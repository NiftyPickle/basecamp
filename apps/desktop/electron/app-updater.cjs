'use strict'

/**
 * electron-updater wrapper for packaged Basecamp builds.
 *
 * Wave-1 ships a self-contained bundle (no .git checkout), so the legacy
 * git-pull self-update path in main.cjs degrades to "not a git checkout".
 * Packaged builds instead check a GitHub Releases feed (publish config:
 * provider github, owner NiftyPickle, repo basecamp). electron-builder bakes that
 * feed into `app-update.yml` under resources at pack time -- its presence is
 * the signal that this binary can talk to the update feed.
 *
 * APPLY paths are platform-aware so wave-1 gets real one-click updates on both
 * desktops without code-signing:
 *   - Windows: NSIS self-installs even when unsigned, so the standard
 *     electron-updater download + quitAndInstall path is used.
 *   - macOS: Squirrel.Mac refuses to install an unsigned update, so a custom
 *     zip-swap updater downloads the release zip, strips the quarantine xattr,
 *     and swaps the .app bundle via a detached helper that relaunches the app.
 *   - Other (Linux/unknown): falls back to opening the GitHub release page.
 * Any failure on a self-install path degrades to the manual release page.
 *
 * SIGNING NOTE (macOS): once builds are code-signed + notarized, flip
 * AUTO_INSTALL_ENABLED to route macOS through Squirrel's silent install too.
 *
 * This module returns objects shaped for the renderer's existing
 * DesktopUpdateStatus contract (src/store/updates.ts): an available update
 * reports `behind > 0` + a `targetSha`, so the existing toast + apply UI work
 * untouched.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const https = require('node:https')
const { spawn } = require('node:child_process')

// macOS silent Squirrel install requires signing + notarization, so it stays
// off. Windows self-installs via electron-updater and macOS uses the custom
// zip-swap below, so neither current path depends on this flag -- it is kept
// for the signed-mac future and the renderer contract.
const AUTO_INSTALL_ENABLED = false

// Mirrors the electron-builder `publish` block in package.json. Used only to
// construct the human-facing release page URL for the manual-download path.
const GH_OWNER = 'NiftyPickle'
const GH_REPO = 'basecamp'

let cachedAutoUpdater
let cachedAutoUpdaterTried = false

// Lazy-require electron-updater. Missing dep (e.g. a dev tree before
// `npm install`) or a load failure must never crash main -- callers treat a
// null updater as "feed unavailable" and fall back to the git-pull path.
function loadAutoUpdater(logger) {
  if (cachedAutoUpdaterTried) return cachedAutoUpdater
  cachedAutoUpdaterTried = true
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    if (logger) autoUpdater.logger = logger
    cachedAutoUpdater = autoUpdater
  } catch (err) {
    if (logger?.warn) logger.warn(`[app-updater] electron-updater unavailable: ${err.message}`)
    cachedAutoUpdater = null
  }
  return cachedAutoUpdater
}

// True when this binary was packaged with a publish feed -- electron-builder
// writes app-update.yml into resources only when `publish` is configured.
function appUpdaterAvailable() {
  const resourcesPath = process.resourcesPath
  if (!resourcesPath) return false
  return fs.existsSync(path.join(resourcesPath, 'app-update.yml'))
}

function releasePageUrl(version) {
  const base = `https://github.com/${GH_OWNER}/${GH_REPO}/releases`
  return version ? `${base}/tag/v${version}` : `${base}/latest`
}

// Map an electron-updater check into the renderer's DesktopUpdateStatus shape.
// `branch` is carried through so the updates UI keeps a stable label; for a
// release-feed build it is purely cosmetic ("stable").
async function checkAppUpdates({ logger, currentVersion } = {}) {
  const autoUpdater = loadAutoUpdater(logger)
  const branch = 'stable'
  if (!autoUpdater) {
    return {
      supported: false,
      reason: 'updater-unavailable',
      message: 'Update feed is unavailable in this build.',
      branch,
      fetchedAt: Date.now()
    }
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    const info = result?.updateInfo || null
    // electron-updater 6.x sets isUpdateAvailable; fall back to a version diff.
    const available =
      typeof result?.isUpdateAvailable === 'boolean'
        ? result.isUpdateAvailable
        : Boolean(info && currentVersion && info.version && info.version !== currentVersion)

    if (!available || !info) {
      return { supported: true, branch, behind: 0, commits: [], fetchedAt: Date.now() }
    }

    return {
      supported: true,
      branch,
      behind: 1,
      // Renderer keys the toast off a non-empty targetSha; the version is the
      // stable identity for a release-feed update.
      targetSha: `v${info.version}`,
      commits: [],
      message: `Basecamp ${info.version} is available`,
      fetchedAt: Date.now()
    }
  } catch (error) {
    return {
      supported: true,
      branch,
      error: 'check-failed',
      message: error?.message || String(error),
      fetchedAt: Date.now()
    }
  }
}

// Open the GitHub release page for a manual download. Used by Linux/unknown
// platforms and as the fallback when a self-install path fails.
async function manualApply({ autoUpdater, emitProgress, openExternal, logger }) {
  let version
  if (autoUpdater) {
    try {
      const result = await autoUpdater.checkForUpdates()
      version = result?.updateInfo?.version
    } catch {
      // Best-effort: fall back to the latest-release URL if the check fails.
    }
  }
  const url = releasePageUrl(version)
  logger?.info?.(`[app-updater] opening release page ${url}`)
  emitProgress?.({ stage: 'manual', message: url, percent: null })
  await openExternal?.(url)
  return { ok: true, manual: true, command: url }
}

// Windows + signed builds: electron-updater downloads with progress, then
// quits and installs. Unsigned NSIS installers self-install fine on Windows.
function electronUpdaterInstall({ autoUpdater, emitProgress }) {
  return new Promise((resolve, reject) => {
    const onProgress = p =>
      emitProgress?.({ stage: 'pull', message: 'Downloading update…', percent: Math.round(p?.percent ?? 0) })
    const onDownloaded = () => {
      emitProgress?.({ stage: 'restart', message: 'Restarting to install update…', percent: 100 })
      cleanup()
      resolve({ ok: true, handedOff: true })
      setTimeout(() => autoUpdater.quitAndInstall(), 400)
    }
    const onError = err => {
      cleanup()
      reject(err instanceof Error ? err : new Error(String(err)))
    }
    const cleanup = () => {
      autoUpdater.removeListener('download-progress', onProgress)
      autoUpdater.removeListener('update-downloaded', onDownloaded)
      autoUpdater.removeListener('error', onError)
    }
    autoUpdater.on('download-progress', onProgress)
    autoUpdater.once('update-downloaded', onDownloaded)
    autoUpdater.once('error', onError)
    autoUpdater.downloadUpdate().catch(onError)
  })
}

// Resolve the installed `.app` bundle root from the running executable path,
// e.g. /Applications/Basecamp.app/Contents/MacOS/Basecamp -> /Applications/Basecamp.app
function bundlePathFromExec(execPath) {
  if (!execPath) return null
  const marker = '.app/'
  const idx = execPath.indexOf(marker)
  if (idx === -1) return null
  return execPath.slice(0, idx + marker.length - 1)
}

// First `*.app` entry directly inside `dir` (ditto extracts the bundle at top).
function findAppInDir(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.app')) return path.join(dir, name)
  }
  return null
}

// Follow redirects (GitHub release assets 302 to codeload/S3) and stream to disk.
function downloadFile(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('too many redirects'))
    https
      .get(url, { headers: { 'User-Agent': 'Basecamp-Updater' } }, res => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          resolve(downloadFile(res.headers.location, dest, onProgress, redirects + 1))
          return
        }
        if (status !== 200) {
          res.resume()
          reject(new Error(`download failed: HTTP ${status}`))
          return
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const out = fs.createWriteStream(dest)
        res.on('data', chunk => {
          received += chunk.length
          if (total && onProgress) onProgress(Math.round((received / total) * 100))
        })
        res.pipe(out)
        out.on('finish', () => out.close(() => resolve()))
        out.on('error', reject)
      })
      .on('error', reject)
  })
}

// Run a command to completion, resolving only on exit code 0.
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}

// Detached helper that waits for the app to quit, atomically swaps the bundle
// (restoring the old one if the move fails, e.g. a non-writable /Applications),
// and relaunches. Embeds the PID so it never races the still-running app.
function buildSwapScript({ newApp, dest, pid }) {
  const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`
  return `#!/bin/bash
NEW_APP=${q(newApp)}
DEST=${q(dest)}
PID=${q(pid)}
for _ in $(seq 1 150); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 0.1
done
BAK="$DEST.old-$$"
if mv "$DEST" "$BAK" 2>/dev/null; then
  if mv "$NEW_APP" "$DEST" 2>/dev/null; then
    rm -rf "$BAK"
  else
    mv "$BAK" "$DEST" 2>/dev/null
  fi
fi
open "$DEST"
`
}

// macOS custom updater: download the per-arch release zip, strip quarantine,
// and swap the bundle via a detached helper that relaunches. Injectable deps
// (`download`, `runCmd`, `spawnDetached`, `execPath`) keep it unit-testable.
async function macZipSwapUpdate({
  logger,
  emitProgress,
  openExternal,
  app,
  autoUpdater,
  download = downloadFile,
  runCmd = run,
  spawnDetached = (scriptPath) => {
    const child = spawn('/bin/bash', [scriptPath], { detached: true, stdio: 'ignore' })
    child.unref()
  },
  execPath = process.execPath,
  arch = process.arch
} = {}) {
  try {
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo?.version
    if (!version) throw new Error('no update version available')

    const bundle = bundlePathFromExec(execPath)
    if (!bundle) throw new Error('running executable is not inside a .app bundle')

    const zipArch = arch === 'arm64' ? 'arm64' : 'x64'
    const zipName = `Basecamp-${version}-mac-${zipArch}.zip`
    const url = `https://github.com/${GH_OWNER}/${GH_REPO}/releases/download/v${version}/${zipName}`

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecamp-update-'))
    const zipPath = path.join(tmpDir, zipName)

    emitProgress?.({ stage: 'pull', message: 'Downloading update…', percent: 0 })
    await download(url, zipPath, percent => emitProgress?.({ stage: 'pull', message: 'Downloading update…', percent }))

    const extractDir = path.join(tmpDir, 'extract')
    fs.mkdirSync(extractDir, { recursive: true })
    await runCmd('ditto', ['-x', '-k', zipPath, extractDir])

    const newApp = findAppInDir(extractDir)
    if (!newApp) throw new Error('no .app found in update zip')

    // Best-effort: a quarantined bundle prompts Gatekeeper on relaunch.
    await runCmd('xattr', ['-dr', 'com.apple.quarantine', newApp]).catch(() => {})

    const scriptPath = path.join(tmpDir, 'swap.sh')
    fs.writeFileSync(scriptPath, buildSwapScript({ newApp, dest: bundle, pid: process.pid }), { mode: 0o755 })

    emitProgress?.({ stage: 'restart', message: 'Restarting to install update…', percent: 100 })
    spawnDetached(scriptPath)

    const quit = () => {
      try {
        ;(app || require('electron').app)?.quit()
      } catch {
        // No electron app in tests; the detached helper handles relaunch.
      }
    }
    setTimeout(quit, 400)
    return { ok: true, handedOff: true }
  } catch (error) {
    logger?.warn?.(`[app-updater] mac zip-swap failed: ${error?.message}; falling back to manual`)
    const fallback = await manualApply({ autoUpdater, emitProgress, openExternal, logger })
    return { ...fallback, fallback: true }
  }
}

// Apply an update, choosing the install path by platform. Any self-install
// failure degrades to the manual release page so the user is never stranded.
async function applyAppUpdate({
  logger,
  emitProgress,
  openExternal,
  app,
  platform = process.platform,
  macUpdate = macZipSwapUpdate
} = {}) {
  const autoUpdater = loadAutoUpdater(logger)
  if (!autoUpdater) {
    return manualApply({ autoUpdater: null, emitProgress, openExternal, logger })
  }

  if (platform === 'win32') {
    return electronUpdaterInstall({ autoUpdater, emitProgress })
  }
  if (platform === 'darwin') {
    return macUpdate({ logger, emitProgress, openExternal, app, autoUpdater })
  }
  return manualApply({ autoUpdater, emitProgress, openExternal, logger })
}

module.exports = {
  appUpdaterAvailable,
  checkAppUpdates,
  applyAppUpdate,
  macZipSwapUpdate,
  electronUpdaterInstall,
  bundlePathFromExec,
  buildSwapScript,
  AUTO_INSTALL_ENABLED
}
