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
 * SIGNING CONSTRAINT (macOS): electron-updater / Squirrel can only silently
 * INSTALL an update when the app is code-signed + notarized. Wave-1 DMGs are
 * ad-hoc unsigned, so silent download+install is OFF. The apply action instead
 * opens the GitHub release page for a manual download. Flip
 * AUTO_INSTALL_ENABLED to true once signing + notarization land and the same
 * UI gets true one-click updates with zero renderer changes.
 *
 * This module returns objects shaped for the renderer's existing
 * DesktopUpdateStatus contract (src/store/updates.ts): an available update
 * reports `behind > 0` + a `targetSha`, so the existing toast + apply UI work
 * untouched.
 */

const fs = require('node:fs')
const path = require('node:path')

// Wave-1 builds are unsigned: silent auto-install is impossible on macOS.
// Set true only when the build is code-signed + notarized.
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

// Apply an update. Unsigned wave-1 cannot self-install on macOS, so this opens
// the GitHub release page for a manual download and returns a `manual` result
// the existing renderer already knows how to surface. When AUTO_INSTALL_ENABLED
// flips true (signed builds), this downloads + quits-and-installs instead.
async function applyAppUpdate({ logger, emitProgress, openExternal } = {}) {
  const autoUpdater = loadAutoUpdater(logger)
  if (!autoUpdater) {
    const url = releasePageUrl()
    emitProgress?.({ stage: 'manual', message: url, percent: null })
    await openExternal?.(url)
    return { ok: true, manual: true, command: url }
  }

  if (!AUTO_INSTALL_ENABLED) {
    let version
    try {
      const result = await autoUpdater.checkForUpdates()
      version = result?.updateInfo?.version
    } catch {
      // Best-effort: fall back to the latest-release URL if the check fails.
    }
    const url = releasePageUrl(version)
    logger?.info?.(`[app-updater] unsigned build; opening release page ${url}`)
    emitProgress?.({ stage: 'manual', message: url, percent: null })
    await openExternal?.(url)
    return { ok: true, manual: true, command: url }
  }

  // Signed-build path: download with progress, then quit + install.
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

module.exports = {
  appUpdaterAvailable,
  checkAppUpdates,
  applyAppUpdate,
  AUTO_INSTALL_ENABLED
}
