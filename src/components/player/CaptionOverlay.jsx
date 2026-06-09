import React, { useState, useEffect, useRef, useMemo } from 'react'

// Sentence-ending punctuation (covers Latin, Arabic, Hebrew, CJK, ellipsis…)
const SENTENCE_END = /[.?!。？！…]+\s*$/

/**
 * Group raw word-level Whisper chunks into caption-card sized sentences.
 *
 * Priority order for breaking a group:
 *  1. The accumulated text ends with sentence punctuation (.?!…)
 *  2. Adding the next chunk would exceed MAX_CHARS
 *  3. The next chunk starts more than MAX_GAP seconds after the group start
 *
 * This matches broadcast-caption standards (~2 lines, ~42 chars/line).
 */
const MAX_CHARS = 80  // ~2 display lines at medium font
const MAX_GAP   = 7   // seconds — generous for slow speakers

function groupChunksIntoSentences(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) return []
    const grouped = []
    let currentGroup = { text: '', timestamp: null, endTime: 0 }

    for (const chunk of chunks) {
        const chunkStart  = chunk.timestamp?.[0] ?? 0
        const chunkEnd    = chunk.timestamp?.[1] ?? chunkStart + 1
        const currentStart = currentGroup.timestamp?.[0]
        const isNewGroup   = currentStart === null || currentStart === undefined

        const wouldExceedChars = !isNewGroup && (currentGroup.text.length + chunk.text.length + 1) > MAX_CHARS
        const wouldExceedTime  = !isNewGroup && (chunkStart - currentStart) > MAX_GAP
        // Natural sentence boundary: flush the current group before starting the next thought
        const endsWithPunct    = !isNewGroup && SENTENCE_END.test(currentGroup.text)

        if (isNewGroup || wouldExceedChars || wouldExceedTime || endsWithPunct) {
            if (currentGroup.text.trim()) grouped.push(currentGroup)
            currentGroup = { text: chunk.text.trim(), timestamp: chunk.timestamp, endTime: chunkEnd }
        } else {
            currentGroup.text += ' ' + chunk.text.trim()
            currentGroup.endTime = Math.max(currentGroup.endTime, chunkEnd)
        }
    }
    if (currentGroup.text.trim()) grouped.push(currentGroup)
    return grouped
}

/**
 * Find the active caption group for the given playback time.
 *
 * - While speech is happening (time ≤ endTime of group): always show.
 * - After the group ends but before the next group starts: keep showing
 *   for up to SILENCE_HIDE_S seconds, then hide (prevents stale captions
 *   hanging on screen during long pauses).
 */
const SILENCE_HIDE_S = 1.5  // seconds of silence before hiding

function findActiveSentence(groups, time) {
    if (!groups || groups.length === 0) return null
    for (let i = 0; i < groups.length; i++) {
        const start    = groups[i].timestamp?.[0] ?? 0
        const end      = groups[i].endTime ?? start + 5
        const nextStart = groups[i + 1]?.timestamp?.[0] ?? Infinity

        // Active during spoken range
        if (time >= start && time <= end) return groups[i]

        // In the gap after this group ends
        if (time > end && time < nextStart) {
            if (time - end < SILENCE_HIDE_S) return groups[i]
            return null // silent too long → hide
        }
    }
    return null
}

export default function CaptionOverlay({
    chunks,
    currentTime,
    enabled,
    position,
    onPositionChange,
    fontSize = 'medium',
    showBackground = true,
    controlsVisible = false
}) {
    const [isDragging, setIsDragging] = useState(false)
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
    const [currentPos, setCurrentPos] = useState(position || { x: 50, y: 85 })
    const [visible, setVisible] = useState(false)
    // Height of the control bar in % of the video container (for upward offset)
    const [controlBarHeightPct, setControlBarHeightPct] = useState(0)
    const containerRef = useRef(null)
    const fadeTimer = useRef(null)

    // Sync position prop to local state
    useEffect(() => {
        if (position && !isDragging) {
            setCurrentPos(position)
        }
    }, [position, isDragging])

    // Measure the control bar height so we can lift captions above it.
    // The control bar lives in a sibling of the video container's parent.
    useEffect(() => {
        const measure = () => {
            const parent = containerRef.current?.parentElement
            if (!parent) return
            // The controls overlay is the last sibling div inside the video-container
            const controlsEl = parent.querySelector('[class*="justify-end"]')
            if (controlsEl && parent.offsetHeight > 0) {
                setControlBarHeightPct((controlsEl.offsetHeight / parent.offsetHeight) * 100)
            }
        }
        measure()
        const ro = new ResizeObserver(measure)
        if (containerRef.current?.parentElement) ro.observe(containerRef.current.parentElement)
        return () => ro.disconnect()
    }, [])

    // Group raw chunks into sentences once (memoised — only recalculates when chunks change)
    const sentenceGroups = useMemo(() => {
        if (!enabled || !Array.isArray(chunks) || chunks.length === 0) return []
        return groupChunksIntoSentences(chunks)
    }, [chunks, enabled])

    // Find the active sentence for the current playback time
    const activeChunk = useMemo(() => {
        if (!enabled || sentenceGroups.length === 0) return null
        return findActiveSentence(sentenceGroups, currentTime)
    }, [sentenceGroups, currentTime, enabled])

    // Fade in when a caption appears; keep container alive during the fade-out transition
    useEffect(() => {
        clearTimeout(fadeTimer.current)
        if (activeChunk) {
            setVisible(true)
        } else {
            // Wait for opacity transition to finish before removing from DOM
            fadeTimer.current = setTimeout(() => setVisible(false), 300)
        }
        return () => clearTimeout(fadeTimer.current)
    }, [activeChunk])

    // Handle dragging
    useEffect(() => {
        if (!isDragging) return

        const handleMove = (clientX, clientY) => {
            if (!containerRef.current || !containerRef.current.parentElement) return
            const parentRect = containerRef.current.parentElement.getBoundingClientRect()

            let newX = ((clientX - parentRect.left - dragOffset.x) / parentRect.width) * 100
            let newY = ((clientY - parentRect.top - dragOffset.y) / parentRect.height) * 100

            newX = Math.max(5, Math.min(newX, 95))
            newY = Math.max(5, Math.min(newY, 95))

            setCurrentPos({ x: newX, y: newY })
        }

        const handleMouseMove = (e) => handleMove(e.clientX, e.clientY)

        const handleTouchMove = (e) => {
            if (e.touches.length > 0) {
                if (e.cancelable) e.preventDefault()
                handleMove(e.touches[0].clientX, e.touches[0].clientY)
            }
        }

        const handleDragEnd = () => {
            setIsDragging(false)
            if (onPositionChange) onPositionChange(currentPos)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleDragEnd)
        document.addEventListener('touchmove', handleTouchMove, { passive: false })
        document.addEventListener('touchend', handleDragEnd)

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleDragEnd)
            document.removeEventListener('touchmove', handleTouchMove)
            document.removeEventListener('touchend', handleDragEnd)
        }
    }, [isDragging, dragOffset, currentPos, onPositionChange])

    // Keep container in DOM during fade-out; fully remove when nothing to show
    if (!enabled || (!activeChunk && !visible)) return null

    const handleMouseDown = (e) => {
        e.stopPropagation()
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        setDragOffset({
            x: e.clientX - (rect.left + rect.width / 2),
            y: e.clientY - (rect.top + rect.height / 2)
        })
        setIsDragging(true)
    }

    const handleTouchStart = (e) => {
        e.stopPropagation()
        if (!containerRef.current) return
        const touch = e.touches[0]
        const rect = containerRef.current.getBoundingClientRect()
        setDragOffset({
            x: touch.clientX - (rect.left + rect.width / 2),
            y: touch.clientY - (rect.top + rect.height / 2)
        })
        setIsDragging(true)
    }

    const fontSizes = {
        small: '14px',
        medium: '18px',
        large: '24px'
    }

    // Only lift captions when the controls bar is visible AND the caption
    // is actually sitting in the control bar zone (bottom N% of the container).
    // Captions already above that zone are unaffected.
    const isInControlBarZone = currentPos.y > (100 - controlBarHeightPct)
    const shouldLift = controlsVisible && !isDragging && isInControlBarZone

    return (
        <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            data-no-speed-boost="true"
            style={{
                position: 'absolute',
                left: `${currentPos.x}%`,
                top: `${currentPos.y}%`,
                // Only lift the caption if it overlaps the control bar zone.
                transform: `translate(-50%, calc(-50% - ${shouldLift ? controlBarHeightPct : 0}%))`,
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: 50,
                userSelect: 'none',
                maxWidth: '80%',
                textAlign: 'center',
                padding: '6px 14px',
                borderRadius: '6px',
                backgroundColor: showBackground ? 'rgba(0, 0, 0, 0.72)' : 'transparent',
                color: '#ffffff',
                fontSize: fontSizes[fontSize] || fontSizes.medium,
                lineHeight: '1.5',
                textShadow: showBackground ? 'none' : '1px 1px 3px black, 0 0 1em black',
                // Smooth fade in/out + position/offset transitions
                opacity: activeChunk ? 1 : 0,
                transition: isDragging
                    ? 'none'
                    : 'left 0.1s, top 0.1s, transform 0.25s ease, opacity 0.25s ease',
                whiteSpace: 'pre-wrap',
                direction: 'ltr',
            }}
            className="backdrop-blur-sm shadow-lg"
        >
            <span dir="auto">{activeChunk?.text ?? ''}</span>
        </div>
    )
}
