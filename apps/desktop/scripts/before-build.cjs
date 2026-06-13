/**
 * Desktop bundles ship precompiled renderer assets. Returning false here tells
 * electron-builder to skip the node_modules collector/install step, which
 * avoids workspace dependency graph explosions and keeps packaging
 * deterministic across environments. The Python backend IS bundled: a
 * relocatable standalone CPython + deps + source is staged at build time by
 * `scripts/stage-backend.cjs` into `build/backend/` and shipped via
 * extraResources. The packaged app spawns it offline -- no clone-at-launch.
 * See `createBundledBackend` in `electron/main.cjs`.
 */
module.exports = async function beforeBuild() {
  return false
}
