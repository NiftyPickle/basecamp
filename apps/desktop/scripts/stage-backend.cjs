'use strict'

/**
 * Stage the self-contained Python backend for electron-builder packaging.
 *
 * Wave-1 ships Basecamp as a fully self-contained desktop app: no
 * clone-at-launch, no network bootstrap, no dependency on a public upstream
 * repo.  This script bakes the entire backend into the build so the packaged
 * app spawns a local, offline Python process.
 *
 * The bundle has two parts, both staged under apps/desktop/build/backend/:
 *
 *   runtime/  A relocatable python-build-standalone CPython (managed by uv).
 *             Its own stdlib + third-party deps are installed into its
 *             site-packages via `uv pip install --break-system-packages`.
 *             Verified relocatable: sys.prefix follows the copy.
 *
 *   src/      The Basecamp/hermes Python source tree (selected top-level
 *             packages + modules + i18n catalogs).  Placed on PYTHONPATH at
 *             spawn time -- mirrors the dev-mode `PYTHONPATH=<repo root>`
 *             layout, so the same import graph that works in dev works packaged.
 *
 * main.cjs spawns:  <resources>/backend/runtime/bin/python3 -m hermes_cli.main
 *                   dashboard ...   with PYTHONPATH=<resources>/backend/src
 *
 * The renderer bundle (apps/desktop/dist) is shipped separately and handed to
 * the backend as HERMES_WEB_DIST by main.cjs -- it is NOT duplicated here.
 *
 * Runs as part of `npm run build`. Idempotent -- re-stages on each build.
 * Output (apps/desktop/build/) is gitignored.
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

// Windows python-build-standalone lays the interpreter out as <root>/python.exe
// (no bin/ dir, no versionless symlink); Unix uses <root>/bin/python3{,.12}.
// Every interpreter-path and copy decision below branches on this.
const IS_WINDOWS = process.platform === 'win32'

const APP_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..')
const STAGE_ROOT = path.join(APP_ROOT, 'build', 'backend')
const RUNTIME_DIR = path.join(STAGE_ROOT, 'runtime')
const SRC_DIR = path.join(STAGE_ROOT, 'src')

// Python minor we lock the bundled runtime to. Must satisfy pyproject
// requires-python (>=3.11,<3.14). 3.12 is the managed standalone we validated.
const PYTHON_VERSION = '3.12'

// Top-level Python packages (directories with __init__.py) the backend imports.
// Mirrors [tool.setuptools.packages.find].include in pyproject.toml plus the
// bare data dir `locales/` (i18n catalogs, no __init__.py).
const SRC_PACKAGES = [
  'agent',
  'tools',
  'hermes_cli',
  'gateway',
  'tui_gateway',
  'cron',
  'acp_adapter',
  'acp_registry',
  'plugins',
  'providers',
  'locales'
]

// Top-level single-file modules. Mirrors [tool.setuptools].py-modules plus
// mini_swe_runner (imported lazily by the agent harness). setup.py excluded --
// packaging metadata, never imported at runtime.
const SRC_MODULES = [
  'run_agent.py',
  'model_tools.py',
  'toolsets.py',
  'batch_runner.py',
  'trajectory_compressor.py',
  'toolset_distributions.py',
  'cli.py',
  'hermes_bootstrap.py',
  'hermes_constants.py',
  'hermes_state.py',
  'hermes_time.py',
  'hermes_logging.py',
  'utils.py',
  'mcp_serve.py',
  'mini_swe_runner.py'
]

// Directory names pruned from copied source trees -- build junk, test suites,
// and node payloads that are never imported by the spawned backend.
const PRUNE_DIRS = new Set(['__pycache__', '.pytest_cache', 'node_modules', '.venv', 'venv', '.git', 'tests', 'test'])

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true })
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true })
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts })
}

// Resolve the managed (python-build-standalone) interpreter for PYTHON_VERSION.
// only-managed forces the relocatable standalone build -- the homebrew
// framework python is NOT relocatable and must never be bundled.
function resolveManagedPython() {
  const env = { ...process.env, UV_PYTHON_PREFERENCE: 'only-managed' }
  try {
    run('uv', ['python', 'install', PYTHON_VERSION], { env })
  } catch (err) {
    // Already installed is fine; surface anything else.
    const msg = (err.stderr || err.stdout || err.message || '').toString()
    if (!/already (installed|available)/i.test(msg)) {
      console.warn(`[stage-backend] uv python install warning: ${msg.trim().split('\n').pop()}`)
    }
  }
  const found = run('uv', ['python', 'find', PYTHON_VERSION], { env }).trim()
  if (!found || !fs.existsSync(found)) {
    throw new Error(`stage-backend: could not resolve managed python ${PYTHON_VERSION} (got: ${found || 'empty'})`)
  }
  // `uv python find` may return a version-alias dir (cpython-3.12-...) whose
  // binaries symlink to the canonical patch-versioned install
  // (cpython-3.12.13-...). Copying the alias farms external symlinks and the
  // copy is not relocatable. realpath the binary to reach the real install.
  const binPath = fs.realpathSync(found)
  // Unix: binPath is <install>/bin/python3.12 -> install root is two levels up,
  // and the install must contain bin/. Windows: binPath is <install>/python.exe
  // -> install root is one level up, validated by python.exe at the root.
  const installRoot = IS_WINDOWS ? path.dirname(binPath) : path.dirname(path.dirname(binPath))
  const layoutMarker = IS_WINDOWS ? path.join(installRoot, 'python.exe') : path.join(installRoot, 'bin')
  if (!fs.existsSync(layoutMarker)) {
    throw new Error(`stage-backend: unexpected managed python layout at ${installRoot}`)
  }
  return installRoot
}

function stageRuntime() {
  const installRoot = resolveManagedPython()
  console.log(`[stage-backend] copying managed python from ${installRoot}`)
  rmrf(RUNTIME_DIR)
  ensureDir(path.dirname(RUNTIME_DIR))
  if (IS_WINDOWS) {
    // Windows has no `cp` and the standalone is symlink-free, so a plain
    // recursive copy is correct and keeps the runtime relocatable.
    fs.cpSync(installRoot, RUNTIME_DIR, { recursive: true })
  } else {
    // Unix: `cp -R` (not -L) preserves the internal symlinks (python3 ->
    // python3.12) and executable bits the standalone relies on for relocation.
    // fs.cpSync does NOT reproduce this here -- the copy loses relocatability
    // (sys.prefix stays at the source), so keep the proven cp invocation.
    run('cp', ['-R', installRoot, RUNTIME_DIR])
  }

  const py = runtimePython()
  if (!fs.existsSync(py)) {
    throw new Error(`stage-backend: bundled python missing after copy: ${py}`)
  }
  // Confirm the copy is relocatable (sys.prefix points inside the copy).
  const prefix = run(py, ['-c', 'import sys; print(sys.prefix)']).trim()
  if (!prefix.startsWith(RUNTIME_DIR)) {
    throw new Error(`stage-backend: copied runtime is not relocatable (sys.prefix=${prefix})`)
  }
  console.log(`[stage-backend] runtime relocatable OK (sys.prefix=${prefix})`)
}

function runtimePython() {
  // Windows: a single python.exe sits at the runtime root. Unix: the standalone
  // ships bin/python3 and bin/python3.12; prefer the versionless symlink so
  // main.cjs can spawn a stable path. Mirror main.cjs createBundledBackend().
  const candidates = IS_WINDOWS
    ? [path.join(RUNTIME_DIR, 'python.exe')]
    : [path.join(RUNTIME_DIR, 'bin', 'python3'), path.join(RUNTIME_DIR, 'bin', `python${PYTHON_VERSION}`)]
  return candidates.find(fs.existsSync) || candidates[0]
}

function installDeps() {
  const reqsPath = path.join(STAGE_ROOT, 'requirements.txt')
  console.log('[stage-backend] exporting locked deps')
  const reqs = run('uv', ['export', '--no-hashes', '--no-emit-project', '--format', 'requirements-txt'], {
    cwd: REPO_ROOT
  })
  fs.writeFileSync(reqsPath, reqs, 'utf8')

  const py = runtimePython()
  console.log('[stage-backend] installing deps into bundled runtime')
  // --break-system-packages is REQUIRED: uv refuses to write into a managed
  // standalone without it. The copy is ours to mutate, so this is safe.
  run('uv', ['pip', 'install', '--python', py, '--break-system-packages', '-r', reqsPath], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'inherit', 'inherit']
  })
  console.log('[stage-backend] deps installed')
}

// Recursively copy a source tree, pruning PRUNE_DIRS and *.pyc.
function copyTree(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    if (PRUNE_DIRS.has(path.basename(src))) return
    ensureDir(dest)
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dest, entry))
    }
  } else if (stat.isFile()) {
    if (src.endsWith('.pyc')) return
    ensureDir(path.dirname(dest))
    fs.copyFileSync(src, dest)
  }
}

function stageSource() {
  console.log('[stage-backend] staging source tree')
  rmrf(SRC_DIR)
  ensureDir(SRC_DIR)
  let count = 0
  for (const pkg of SRC_PACKAGES) {
    const from = path.join(REPO_ROOT, pkg)
    if (!fs.existsSync(from)) {
      throw new Error(`stage-backend: source package missing: ${from}`)
    }
    copyTree(from, path.join(SRC_DIR, pkg))
    count += 1
  }
  for (const mod of SRC_MODULES) {
    const from = path.join(REPO_ROOT, mod)
    if (!fs.existsSync(from)) {
      throw new Error(`stage-backend: source module missing: ${from}`)
    }
    fs.copyFileSync(from, path.join(SRC_DIR, mod))
    count += 1
  }
  console.log(`[stage-backend] staged ${count} source entries -> ${path.relative(APP_ROOT, SRC_DIR)}`)
}

// Final gate: spawn the bundled runtime against the staged source and confirm
// the dashboard entrypoint imports offline. Catches a missing module/dep
// before it ships, not after a user reports a broken build.
function verifyOffline() {
  console.log('[stage-backend] verifying backend imports on bundled runtime')
  const py = runtimePython()
  const out = run(py, ['-c', 'import hermes_cli.web_server; print("OK")'], {
    cwd: STAGE_ROOT,
    env: { ...process.env, HERMES_DESKTOP: '1', PYTHONPATH: SRC_DIR }
  }).trim()
  if (!out.endsWith('OK')) {
    throw new Error(`stage-backend: offline import check failed: ${out}`)
  }
  console.log('[stage-backend] offline import OK')
}

function main() {
  rmrf(STAGE_ROOT)
  ensureDir(STAGE_ROOT)
  stageRuntime()
  installDeps()
  stageSource()
  verifyOffline()
  console.log('[stage-backend] done')
}

main()
