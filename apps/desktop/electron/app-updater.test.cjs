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

test('applyAppUpdate (unsigned) opens the release page and returns a manual command', async () => {
  const fake = makeFakeUpdater({
    checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: '2.3.4' } })
  })
  const mod = loadFresh(fake)
  assert.equal(mod.AUTO_INSTALL_ENABLED, false, 'wave-1 must stay unsigned/manual')

  const opened = []
  const progress = []
  const result = await mod.applyAppUpdate({
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
