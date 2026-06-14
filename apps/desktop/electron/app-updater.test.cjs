'use strict'

// Unit tests for the electron-updater wrapper. electron-updater itself requires
// a live Electron runtime, so we inject a fake `autoUpdater` through the module
// cache before loading app-updater.cjs fresh per case. This pins the mapping
// into the renderer's DesktopUpdateStatus contract (src/store/updates.ts).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const APP_UPDATER_PATH = require.resolve('./app-updater.cjs')
const ELECTRON_UPDATER_PATH = require.resolve('electron-updater')

// Load app-updater.cjs fresh with a fake electron-updater (or null to simulate
// the dep being unavailable). Returns the module's exports.
function loadFresh(fakeAutoUpdater) {
  delete require.cache[APP_UPDATER_PATH]
  if (fakeAutoUpdater === null) {
    // Force the lazy require to throw, mimicking a missing/unloadable dep.
    require.cache[ELECTRON_UPDATER_PATH] = {
      id: ELECTRON_UPDATER_PATH,
      filename: ELECTRON_UPDATER_PATH,
      loaded: true,
      get exports() {
        throw new Error('electron-updater unavailable')
      }
    }
  } else {
    require.cache[ELECTRON_UPDATER_PATH] = {
      id: ELECTRON_UPDATER_PATH,
      filename: ELECTRON_UPDATER_PATH,
      loaded: true,
      exports: { autoUpdater: fakeAutoUpdater }
    }
  }
  return require(APP_UPDATER_PATH)
}

function makeFakeUpdater(overrides = {}) {
  return {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    logger: null,
    checkForUpdates: async () => ({ isUpdateAvailable: false, updateInfo: { version: '1.0.0' } }),
    ...overrides
  }
}

test.afterEach(() => {
  delete require.cache[APP_UPDATER_PATH]
  delete require.cache[ELECTRON_UPDATER_PATH]
})

test('appUpdaterAvailable reflects presence of app-update.yml in resources', () => {
  const mod = loadFresh(makeFakeUpdater())
  const original = process.resourcesPath
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-upd-'))
  try {
    process.resourcesPath = tmp
    assert.equal(mod.appUpdaterAvailable(), false, 'no yml -> unavailable')
    fs.writeFileSync(path.join(tmp, 'app-update.yml'), 'provider: github\n')
    assert.equal(mod.appUpdaterAvailable(), true, 'yml present -> available')
  } finally {
    process.resourcesPath = original
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('loadAutoUpdater disables autoDownload and autoInstallOnAppQuit', async () => {
  const fake = makeFakeUpdater()
  const mod = loadFresh(fake)
  await mod.checkAppUpdates({ currentVersion: '1.0.0' })
  assert.equal(fake.autoDownload, false)
  assert.equal(fake.autoInstallOnAppQuit, false)
})

test('checkAppUpdates maps an available update to behind>0 + targetSha', async () => {
  const fake = makeFakeUpdater({
    checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: '2.3.4' } })
  })
  const mod = loadFresh(fake)
  const status = await mod.checkAppUpdates({ currentVersion: '1.0.0' })
  assert.equal(status.supported, true)
  assert.equal(status.behind, 1)
  assert.equal(status.targetSha, 'v2.3.4')
  assert.match(status.message, /2\.3\.4/)
  assert.ok(status.fetchedAt > 0)
})

test('checkAppUpdates maps no-update to behind 0 with no targetSha', async () => {
  const fake = makeFakeUpdater({
    checkForUpdates: async () => ({ isUpdateAvailable: false, updateInfo: { version: '1.0.0' } })
  })
  const mod = loadFresh(fake)
  const status = await mod.checkAppUpdates({ currentVersion: '1.0.0' })
  assert.equal(status.supported, true)
  assert.equal(status.behind, 0)
  assert.equal(status.targetSha, undefined)
})

test('checkAppUpdates surfaces a feed error without throwing', async () => {
  const fake = makeFakeUpdater({
    checkForUpdates: async () => {
      throw new Error('network down')
    }
  })
  const mod = loadFresh(fake)
  const status = await mod.checkAppUpdates({ currentVersion: '1.0.0' })
  assert.equal(status.supported, true)
  assert.equal(status.error, 'check-failed')
  assert.match(status.message, /network down/)
})

test('checkAppUpdates reports unsupported when the updater cannot load', async () => {
  const mod = loadFresh(null)
  const status = await mod.checkAppUpdates({ currentVersion: '1.0.0' })
  assert.equal(status.supported, false)
  assert.equal(status.reason, 'updater-unavailable')
})

test('applyAppUpdate on Linux opens the release page and returns a manual command', async () => {
  const fake = makeFakeUpdater({
    checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: '2.3.4' } })
  })
  const mod = loadFresh(fake)
  assert.equal(mod.AUTO_INSTALL_ENABLED, false, 'mac silent Squirrel install stays off until signed')

  const opened = []
  const progress = []
  const result = await mod.applyAppUpdate({
    platform: 'linux',
    emitProgress: p => progress.push(p),
    openExternal: async url => opened.push(url)
  })

  assert.equal(result.ok, true)
  assert.equal(result.manual, true)
  assert.equal(result.command, 'https://github.com/NiftyPickle/basecamp/releases/tag/v2.3.4')
  assert.deepEqual(opened, ['https://github.com/NiftyPickle/basecamp/releases/tag/v2.3.4'])
  assert.equal(progress.length, 1)
  assert.equal(progress[0].stage, 'manual')
})

test('applyAppUpdate on Windows downloads via electron-updater and quits to install', async () => {
  const listeners = {}
  let downloadCalled = false
  let quitCalled = false
  const fake = makeFakeUpdater({
    on: (ev, fn) => {
      listeners[ev] = fn
    },
    once: (ev, fn) => {
      listeners[ev] = fn
    },
    removeListener: () => {},
    downloadUpdate: async () => {
      downloadCalled = true
      setImmediate(() => listeners['update-downloaded']?.())
    },
    quitAndInstall: () => {
      quitCalled = true
    }
  })
  const mod = loadFresh(fake)

  const progress = []
  const result = await mod.applyAppUpdate({
    platform: 'win32',
    emitProgress: p => progress.push(p)
  })

  assert.equal(downloadCalled, true)
  assert.equal(result.ok, true)
  assert.equal(result.handedOff, true)
  assert.ok(progress.some(p => p.stage === 'restart'))
  await new Promise(r => setTimeout(r, 500))
  assert.equal(quitCalled, true, 'quitAndInstall fires after the handoff delay')
})

test('applyAppUpdate on macOS downloads the per-arch zip and swaps via a detached helper', async () => {
  const fake = makeFakeUpdater({
    checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: '2.3.4' } })
  })
  const mod = loadFresh(fake)

  const downloads = []
  const ranCmds = []
  const spawned = []
  let quitCalled = false

  const result = await mod.macZipSwapUpdate({
    autoUpdater: fake,
    app: { quit: () => { quitCalled = true } },
    execPath: '/Applications/Basecamp.app/Contents/MacOS/Basecamp',
    arch: 'arm64',
    emitProgress: () => {},
    download: async (url, dest) => {
      downloads.push(url)
      fs.writeFileSync(dest, 'zipbytes')
    },
    runCmd: async (cmd, args) => {
      ranCmds.push(cmd)
      if (cmd === 'ditto') {
        const dir = args[args.length - 1]
        fs.mkdirSync(path.join(dir, 'Basecamp.app'), { recursive: true })
      }
    },
    spawnDetached: scriptPath => spawned.push(scriptPath)
  })

  assert.equal(result.ok, true)
  assert.equal(result.handedOff, true)
  assert.deepEqual(downloads, [
    'https://github.com/NiftyPickle/basecamp/releases/download/v2.3.4/Basecamp-2.3.4-mac-arm64.zip'
  ])
  assert.ok(ranCmds.includes('ditto'))
  assert.ok(ranCmds.includes('xattr'))
  assert.equal(spawned.length, 1)
  assert.ok(fs.existsSync(spawned[0]), 'swap helper script was written')
  await new Promise(r => setTimeout(r, 500))
  assert.equal(quitCalled, true, 'app quits after the handoff delay')
})

test('macZipSwapUpdate falls back to the release page when the download fails', async () => {
  const fake = makeFakeUpdater({
    checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: '2.3.4' } })
  })
  const mod = loadFresh(fake)

  const opened = []
  const result = await mod.macZipSwapUpdate({
    autoUpdater: fake,
    app: { quit: () => {} },
    execPath: '/Applications/Basecamp.app/Contents/MacOS/Basecamp',
    arch: 'x64',
    emitProgress: () => {},
    openExternal: async url => opened.push(url),
    download: async () => {
      throw new Error('network down')
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.manual, true)
  assert.equal(result.fallback, true)
  assert.deepEqual(opened, ['https://github.com/NiftyPickle/basecamp/releases/tag/v2.3.4'])
})

test('bundlePathFromExec resolves the .app root and rejects non-bundle paths', () => {
  const mod = loadFresh(makeFakeUpdater())
  assert.equal(
    mod.bundlePathFromExec('/Applications/Basecamp.app/Contents/MacOS/Basecamp'),
    '/Applications/Basecamp.app'
  )
  assert.equal(mod.bundlePathFromExec('/usr/local/bin/basecamp'), null)
  assert.equal(mod.bundlePathFromExec(''), null)
})

test('buildSwapScript embeds the bundle paths and the parent pid', () => {
  const mod = loadFresh(makeFakeUpdater())
  const script = mod.buildSwapScript({
    newApp: '/tmp/x/Basecamp.app',
    dest: '/Applications/Basecamp.app',
    pid: 4242
  })
  assert.match(script, /NEW_APP='\/tmp\/x\/Basecamp.app'/)
  assert.match(script, /DEST='\/Applications\/Basecamp.app'/)
  assert.match(script, /PID='4242'/)
  assert.match(script, /kill -0 "\$PID"/)
  assert.match(script, /open "\$DEST"/)
})
