/**
 * TutIn API Client (v4)
 * 
 * Communicates with the TutIn Companion Server (Express + SQLite).
 * Port 9474 is the default, but it may vary if the port is in use.
 */

export const SERVER_URL = 'http://127.0.0.1:9474'
/**
 * Check if the companion server is running and reachable.
 */
export async function isServerAvailable() {
    try {
        const res = await fetch(`${SERVER_URL}/api/health`, {
            signal: AbortSignal.timeout(1000)
        })
        return res.ok
    } catch {
        return false
    }
}

/**
 * Helper to handle non-ok API responses and extract details
 */
async function handleErrorResponse(res) {
    let errMsg = `API error: ${res.status}`
    try {
        const body = await res.json()
        if (body && body.error) {
            errMsg = body.error
        }
    } catch {}
    throw new Error(errMsg)
}

/**
 * GET request wrapper
 */
export async function get(path) {
    const separator = path.includes('?') ? '&' : '?'
    const timestampedPath = `${path}${separator}_t=${Date.now()}`
    const res = await fetch(`${SERVER_URL}${timestampedPath}`)
    if (!res.ok) await handleErrorResponse(res)
    return res.json()
}

/**
 * POST request wrapper
 */
export async function post(path, body) {
    const res = await fetch(`${SERVER_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    if (!res.ok) await handleErrorResponse(res)
    return res.json()
}

/**
 * PUT request wrapper
 */
export async function put(path, body) {
    const res = await fetch(`${SERVER_URL}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    if (!res.ok) await handleErrorResponse(res)
    return res.json()
}

/**
 * DELETE request wrapper
 */
export async function del(path) {
    const res = await fetch(`${SERVER_URL}${path}`, { method: 'DELETE' })
    if (!res.ok) await handleErrorResponse(res)
    return res.json()
}

/**
 * Get the streamable video URL for a given local file path
 */
export function videoUrl(filePath) {
    if (!filePath) return ''
    return `${SERVER_URL}/video/${encodeURIComponent(filePath)}`
}

/**
 * Fetch YouTube transcript via the local server proxy
 */
export async function fetchYoutubeTranscript(videoId, lang = null) {
    let url = `/api/youtube/transcript?videoId=${encodeURIComponent(videoId)}`
    if (lang) {
        url += `&lang=${encodeURIComponent(lang)}`
    }
    return get(url)
}
