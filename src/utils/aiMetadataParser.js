/**
 * AI Metadata Parser
 * 
 * Fetches external page HTML via CORS proxy, extracts Open Graph metadata,
 * and optionally uses OpenRouter AI to extract course statistics.
 */

// Multiple CORS proxies for redundancy — if one times out or is down, try the next
const PROXIES = [
    {
        // allorigins JSON endpoint — always returns CORS headers, even on errors
        buildUrl: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        parseResponse: async (response) => {
            const json = await response.json()
            if (json.status?.http_code && json.status.http_code >= 400) {
                throw new Error(`Target returned ${json.status.http_code}`)
            }
            return json.contents || ''
        }
    },
    {
        buildUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        parseResponse: async (response) => response.text()
    },
    {
        buildUrl: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        parseResponse: async (response) => response.text()
    },
]

const FETCH_TIMEOUT = 30000 // 30 seconds

/**
 * Try fetching through multiple CORS proxies until one succeeds.
 */
async function fetchWithProxyFallback(url) {
    let lastError = null

    for (const proxy of PROXIES) {
        const proxyUrl = proxy.buildUrl(url)
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

            const response = await fetch(proxyUrl, { signal: controller.signal })
            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error(`Proxy returned ${response.status}`)
            }
            const html = await proxy.parseResponse(response)
            if (!html || html.length < 100) {
                throw new Error('Proxy returned empty or minimal content')
            }
            return html
        } catch (err) {
            lastError = err
            console.warn(`[aiMetadataParser] Proxy failed (${proxyUrl.split('?')[0]}):`, err.message)
            // Try next proxy
        }
    }

    throw lastError || new Error('All proxies failed')
}

/**
 * Fetch an external page through the CORS proxy and extract metadata.
 * 
 * @param {string} url - The external course URL
 * @returns {{ title: string, thumbnail: string|null, siteName: string, textContent: string }}
 */
export async function fetchPageMetadata(url) {
    const fallbackSiteName = extractDomainName(url)

    try {
        const html = await fetchWithProxyFallback(url)

        // Parse HTML using the browser's built-in DOMParser
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')

        // --- Title ---
        const ogTitle = getMetaContent(doc, 'og:title')
        const twitterTitle = getMetaContent(doc, 'twitter:title')
        const titleTag = doc.querySelector('title')?.textContent?.trim()
        const h1Tag = doc.querySelector('h1')?.textContent?.trim()
        const title = ogTitle || twitterTitle || titleTag || h1Tag || ''

        // --- Thumbnail ---
        const ogImage = getMetaContent(doc, 'og:image')
        const twitterImage = getMetaContent(doc, 'twitter:image')
        // Resolve relative URLs to absolute
        const thumbnail = resolveUrl(ogImage, url) || resolveUrl(twitterImage, url) || null

        // --- Site Name ---
        const ogSiteName = getMetaContent(doc, 'og:site_name')
        const siteName = ogSiteName || fallbackSiteName

        // --- Text Content (for AI parsing) ---
        // Strip scripts, styles, navs, footers to reduce noise
        const body = doc.body
        if (body) {
            body.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript').forEach(el => el.remove())
        }
        let textContent = body?.innerText || body?.textContent || ''
        // Clean up excessive whitespace
        textContent = textContent.replace(/\s+/g, ' ').trim()
        // Truncate to ~12K chars to stay within AI token limits
        if (textContent.length > 12000) {
            textContent = textContent.slice(0, 12000) + '... [truncated]'
        }

        return { title, thumbnail, siteName, textContent }
    } catch (err) {
        console.error('[aiMetadataParser] Failed to fetch page:', err)
        // Return partial result with just the domain name
        return {
            title: '',
            thumbnail: null,
            siteName: fallbackSiteName,
            textContent: '',
            error: err.message
        }
    }
}

/**
 * Use OpenRouter AI to extract course statistics from page text.
 * 
 * @param {string} textContent - The page's text content
 * @param {string} apiKey - OpenRouter API key
 * @param {string} model - OpenRouter model identifier
 * @returns {{ totalModules: number, totalVideos: number, hours: number, minutes: number }}
 */
export async function extractCourseStatsWithAI(textContent, apiKey, model) {
    if (!textContent || textContent.length < 50) {
        return { totalModules: 0, totalVideos: 0, hours: 0, minutes: 0 }
    }

    if (!apiKey) {
        throw new Error('OpenRouter API key not configured. Go to Settings → API Keys to add it.')
    }

    const prompt = `You are a data extraction assistant. Analyze the following webpage text from an online course page and extract course statistics.

Return ONLY a valid JSON object with these fields (use 0 if you cannot determine a value):
{
  "totalModules": <number of modules/sections/chapters>,
  "totalVideos": <number of videos/lessons/lectures>,
  "hours": <total duration hours component>,
  "minutes": <total duration minutes component>
}

For duration: if the page says "15.5 hours", return hours: 15, minutes: 30.
If the page says "3h 45m", return hours: 3, minutes: 45.

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation, no other text.

Webpage text:
${textContent}`

    const maxRetries = 2
    let lastError = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'TutIn Course Player'
                },
                body: JSON.stringify({
                    model: model || 'google/gemini-2.0-flash-exp:free',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 200,
                    temperature: 0.1
                })
            })

            if (response.status === 429) {
                const waitTime = Math.pow(2, attempt) * 2000
                await new Promise(resolve => setTimeout(resolve, waitTime))
                continue
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(`API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
            }

            const data = await response.json()
            const content = data.choices?.[0]?.message?.content?.trim()

            if (!content) {
                // Model returned empty — retry once, otherwise return defaults
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 2000))
                    continue
                }
                console.warn('[aiMetadataParser] AI returned empty content')
                return { totalModules: 0, totalVideos: 0, hours: 0, minutes: 0 }
            }

            return parseAIResponse(content)
        } catch (err) {
            lastError = err
            if (attempt < maxRetries && (err.message?.includes('429') || err.message?.includes('timeout'))) {
                await new Promise(resolve => setTimeout(resolve, 3000))
            } else {
                throw err
            }
        }
    }

    throw lastError || new Error('Max retries exceeded')
}

// ============= INTERNAL HELPERS =============

/**
 * Extract a meta tag's content by property or name.
 */
function getMetaContent(doc, property) {
    const meta = doc.querySelector(`meta[property="${property}"]`)
        || doc.querySelector(`meta[name="${property}"]`)
    return meta?.getAttribute('content')?.trim() || ''
}

/**
 * Extract a clean domain name from a URL (e.g., "udemy.com" → "Udemy").
 */
function extractDomainName(url) {
    try {
        const hostname = new URL(url).hostname
        // Remove "www." prefix, take the main domain part, capitalize
        const domain = hostname.replace(/^www\./, '').split('.')[0]
        return domain.charAt(0).toUpperCase() + domain.slice(1)
    } catch {
        return ''
    }
}

/**
 * Resolve a potentially relative URL to absolute.
 */
function resolveUrl(path, baseUrl) {
    if (!path) return ''
    // Already absolute
    if (path.startsWith('http://') || path.startsWith('https://')) return path
    // Protocol-relative
    if (path.startsWith('//')) return 'https:' + path
    // Relative
    try {
        return new URL(path, baseUrl).href
    } catch {
        return ''
    }
}

/**
 * Parse the AI response into a structured object.
 * Handles both raw JSON and markdown-wrapped JSON (```json ... ```)
 */
function parseAIResponse(content) {
    const defaults = { totalModules: 0, totalVideos: 0, hours: 0, minutes: 0 }

    try {
        // Try direct JSON parse first
        const parsed = JSON.parse(content)
        return { ...defaults, ...sanitizeNumbers(parsed) }
    } catch {
        // Try to extract JSON from markdown code block
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0])
                return { ...defaults, ...sanitizeNumbers(parsed) }
            } catch {
                // Fall through
            }
        }
    }

    console.warn('[aiMetadataParser] Could not parse AI response:', content)
    return defaults
}

/**
 * Ensure all values are non-negative integers.
 */
function sanitizeNumbers(obj) {
    const result = {}
    for (const key of ['totalModules', 'totalVideos', 'hours', 'minutes']) {
        const val = parseInt(obj[key])
        result[key] = isNaN(val) || val < 0 ? 0 : val
    }
    return result
}
