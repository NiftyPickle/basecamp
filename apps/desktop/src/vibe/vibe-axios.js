/**
 * vibe-axios.js
 *
 * Drop-in replacement for axios used by the vendored Vibe-Workflow components.
 * Bridges Vibe's expected axios surface onto the Electron IPC bridge exposed at
 * window.hermesDesktop.api({ path, method, body }).
 *
 * Absolute URLs (https?://) bypass the bridge and go to real axios so that
 * presigned S3 uploads in UploadNode.jsx / RenderApiField.jsx continue to hit
 * the CDN directly. All relative /api/... paths route through the bridge --
 * auth headers (X-Hermes-Session-Token) are injected server-side in main.cjs,
 * never in this file.
 */

import realAxios from 'axios'

const ABSOLUTE_URL = /^https?:\/\//i

/**
 * Parse the bridge rejection format "<statusCode>: <bodyText>" into an
 * axios-compatible error so Vibe catch blocks reading err.response.status /
 * err.response.data.detail degrade gracefully.
 */
function bridgeErrorToAxiosLike(err) {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^(\d+):\s*(.*)$/s)

  if (!match) {
    return { response: { status: 0, data: {} }, message: raw }
  }

  const status = parseInt(match[1], 10)
  const text = match[2] ?? ''
  let data = {}

  try {
    data = JSON.parse(text)
  } catch {
    data = { detail: text }
  }

  return { response: { status, data }, message: raw }
}

/**
 * Require the bridge to be present before routing a call through it.
 */
function requireBridge() {
  if (typeof window === 'undefined' || !window.hermesDesktop?.api) {
    throw new Error(
      '[vibe-axios] window.hermesDesktop.api is not available. ' +
      'Ensure the Electron preload script has exposed the bridge before ' +
      'mounting Vibe-Workflow components.'
    )
  }
}

/**
 * Serialize a params object into a querystring and append it to url.
 */
function appendParams(url, params) {
  if (!params || Object.keys(params).length === 0) {
    return url
  }

  const qs = new URLSearchParams(params).toString()

  return url + (url.includes('?') ? '&' : '?') + qs
}

/**
 * Route a relative API call through the Electron IPC bridge and wrap the
 * resolved value in an axios-shaped { data } envelope.
 * On bridge rejection, throw an axios-shaped error { response, message }.
 */
async function bridgeCall(path, method, body) {
  requireBridge()

  try {
    const result = await window.hermesDesktop.api({ path, method, body })

    return { data: result }
  } catch (err) {
    throw bridgeErrorToAxiosLike(err)
  }
}

// ---------- Public surface ----------

/**
 * GET. Appends config.params as a querystring before routing.
 * Absolute URL -> real axios. Relative -> bridge.
 */
async function get(url, config) {
  if (ABSOLUTE_URL.test(url)) {
    return realAxios.get(url, config)
  }

  const path = appendParams(url, config?.params)

  return bridgeCall(path, 'GET', undefined)
}

/**
 * POST.
 * Absolute URL -> real axios (passes config for headers/onUploadProgress).
 * Relative -> bridge with body.
 */
async function post(url, body, config) {
  if (ABSOLUTE_URL.test(url)) {
    return realAxios.post(url, body, config)
  }

  return bridgeCall(url, 'POST', body)
}

/**
 * DELETE.
 * Absolute URL -> real axios. Relative -> bridge (forwards config.data as the
 * body so a DELETE with a request payload still reaches the backend).
 */
async function del(url, config) {
  if (ABSOLUTE_URL.test(url)) {
    return realAxios.delete(url, config)
  }

  return bridgeCall(url, 'DELETE', config?.data)
}

const vibeAxios = { get, post, delete: del }

export default vibeAxios
export { del as delete, get, post }
