/**
 * TutIn — Caption Parser Utility
 * Parses SRT, VTT, ASS, LRC → internal chunk format: [{timestamp:[start,end], text}]
 * Also exports chunks back to SRT and VTT.
 */

const LANG_NAME_MAP = {
    arabic:'ar', ara:'ar', french:'fr', fre:'fr', fra:'fr', spanish:'es', spa:'es', german:'de', ger:'de', 
    italian:'it', ita:'it', portuguese:'pt', por:'pt', russian:'ru', rus:'ru', japanese:'ja', jpn:'ja', 
    korean:'ko', kor:'ko', chinese:'zh', chi:'zh', zho:'zh', hindi:'hi', hin:'hi', turkish:'tr', tur:'tr', 
    dutch:'nl', dut:'nl', nld:'nl', polish:'pl', pol:'pl', indonesian:'id', ind:'id', vietnamese:'vi', vie:'vi', 
    english:'en', eng:'en', hebrew:'he', heb:'he', greek:'el', gre:'el', ell:'el', swedish:'sv', swe:'sv',
    danish:'da', dan:'da', norwegian:'no', nor:'no', finnish:'fi', fin:'fi', czech:'cs', cze:'cs', ces:'cs', 
    hungarian:'hu', hun:'hu', romanian:'ro', rum:'ro', ron:'ro', thai:'th', tha:'th', ukrainian:'uk', ukr:'uk',
}

// ── Format Detection ──────────────────────────────────────────

export function detectFormat(filename) {
    const ext = filename.split('.').pop().toLowerCase()
    if (ext === 'srt') return 'srt'
    if (ext === 'vtt') return 'vtt'
    if (ext === 'ass' || ext === 'ssa') return 'ass'
    if (ext === 'lrc') return 'lrc'
    return null
}

/**
 * Extract ISO 639-1 language code from subtitle filename.
 * Supports: video.ar.srt | video.Arabic.srt | video - Arabic.srt
 */
export function extractLangCode(filename, baseName = '') {
    const nameWithoutExt = filename.replace(/\.[a-z0-9]+$/i, '').toLowerCase()

    // 1. Try strict matching if the file starts with the video base name
    if (baseName && filename.toLowerCase().startsWith(baseName.toLowerCase())) {
        const withoutBase = nameWithoutExt.slice(baseName.length)
        const strictMatch = withoutBase.match(/^[\.\s-]*([a-z]{2,})$/)
        if (strictMatch) {
            const code = strictMatch[1]
            if (LANG_NAME_MAP[code]) return LANG_NAME_MAP[code]
            if (Object.values(LANG_NAME_MAP).includes(code)) return code
            if (code.length <= 3) return code
        }
    }

    // 2. Try scanning the whole filename for known language names or codes
    const words = nameWithoutExt.split(/[^a-z]+/)
    // Reverse to prefer suffixes (e.g. "my-video-english.srt" -> "english")
    for (const word of words.reverse()) { 
        if (!word) continue
        if (LANG_NAME_MAP[word]) return LANG_NAME_MAP[word]
        if (Object.values(LANG_NAME_MAP).includes(word)) return word
    }

    return null // source language
}

// ── Time Helpers ──────────────────────────────────────────────

function parseTime(ts) {
    const clean = ts.trim().replace(',', '.')
    const parts = clean.split(':')
    if (parts.length === 3) {
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
    }
    if (parts.length === 2) {
        return parseInt(parts[0]) * 60 + parseFloat(parts[1])
    }
    return 0
}

function formatTime(seconds, sep = '.') {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.round((seconds % 1) * 1000)
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${sep}${String(ms).padStart(3,'0')}`
}

function stripTags(text) {
    return text.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim()
}

// ── Parsers ───────────────────────────────────────────────────

export function parseSRT(text) {
    const chunks = []
    const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/)
    for (const block of blocks) {
        const lines = block.trim().split('\n')
        let tsLine = lines.findIndex(l => l.includes('-->'))
        if (tsLine === -1) continue
        const [startStr, endStr] = lines[tsLine].split('-->')
        const start = parseTime(startStr)
        const end = parseTime(endStr.trim().split(' ')[0])
        const clean = stripTags(lines.slice(tsLine + 1).join('\n'))
        if (clean) chunks.push({ timestamp: [start, end], text: clean })
    }
    return chunks
}

export function parseVTT(text) {
    const chunks = []
    const blocks = text.replace(/\r\n/g, '\n').replace(/^WEBVTT.*\n/, '').split(/\n\s*\n/)
    for (const block of blocks) {
        const lines = block.trim().split('\n')
        if (/^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue
        let tsLine = lines.findIndex(l => l.includes('-->'))
        if (tsLine === -1) continue
        const [startStr, endStr] = lines[tsLine].split('-->')
        const start = parseTime(startStr)
        const end = parseTime(endStr.trim().split(/\s/)[0])
        const clean = stripTags(lines.slice(tsLine + 1).join('\n'))
        if (clean) chunks.push({ timestamp: [start, end], text: clean })
    }
    return chunks
}

export function parseASS(text) {
    const chunks = []
    const eventsMatch = text.replace(/\r\n/g, '\n').match(/\[Events\]([\s\S]*)/)
    if (!eventsMatch) return []
    const lines = eventsMatch[1].split('\n')
    let cols = []
    for (const line of lines) {
        if (line.startsWith('Format:')) {
            cols = line.slice(7).split(',').map(c => c.trim().toLowerCase())
            break
        }
    }
    const si = cols.indexOf('start'), ei = cols.indexOf('end'), ti = cols.indexOf('text')
    if (si === -1 || ti === -1) return []
    for (const line of lines) {
        if (!line.startsWith('Dialogue:')) continue
        const parts = line.slice(9).split(',')
        if (parts.length <= ti) continue
        const rawText = parts.slice(ti).join(',')
        const start = parseTime(parts[si])
        const end = ei !== -1 ? parseTime(parts[ei]) : start + 3
        const clean = rawText.replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').trim()
        if (clean) chunks.push({ timestamp: [start, end], text: clean })
    }
    chunks.sort((a, b) => a.timestamp[0] - b.timestamp[0])
    return chunks
}

export function parseLRC(text) {
    const entries = []
    const timeRe = /\[(\d{1,2}):(\d{2})\.(\d{2,3})\]/g
    for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
        if (/^\[(ar|ti|al|by|offset|re|ve):/.test(line)) continue
        const timestamps = []
        let m
        timeRe.lastIndex = 0
        while ((m = timeRe.exec(line)) !== null) {
            const div = m[3].length === 3 ? 1000 : 100
            timestamps.push(parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / div)
        }
        const t = line.replace(/\[\d{1,2}:\d{2}\.\d{2,3}\]/g, '').trim()
        if (t) timestamps.forEach(ts => entries.push({ start: ts, text: t }))
    }
    entries.sort((a, b) => a.start - b.start)
    return entries.map((e, i) => {
        const next = entries[i + 1]?.start
        return { timestamp: [e.start, next ? Math.min(next, e.start + 7) : e.start + 5], text: e.text }
    })
}

export function parseSubtitleFile(text, filename) {
    const fmt = detectFormat(filename)
    if (fmt === 'srt') return parseSRT(text)
    if (fmt === 'vtt') return parseVTT(text)
    if (fmt === 'ass') return parseASS(text)
    if (fmt === 'lrc') return parseLRC(text)
    const fallback = parseSRT(text)
    return fallback.length ? fallback : parseVTT(text)
}

// ── Exporters ─────────────────────────────────────────────────

export function chunksToSRT(chunks) {
    if (!chunks?.length) return ''
    return chunks.map((c, i) => {
        const [s, e] = c.timestamp
        return `${i + 1}\n${formatTime(s, ',')} --> ${formatTime(e, ',')}\n${c.text.trim()}\n`
    }).join('\n')
}

export function chunksToVTT(chunks) {
    if (!chunks?.length) return 'WEBVTT\n'
    const cues = chunks.map((c, i) => {
        const [s, e] = c.timestamp
        return `${i + 1}\n${formatTime(s)} --> ${formatTime(e)}\n${c.text.trim()}\n`
    }).join('\n')
    return `WEBVTT\n\n${cues}`
}
