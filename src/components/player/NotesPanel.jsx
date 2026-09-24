import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
    ChevronDown, ChevronUp, Plus, Minus, Pencil, Trash2,
    Clock, Copy, Download, Bold, Italic, Strikethrough,
    List, ImagePlus, Camera, Crop, X, ZoomIn, ExternalLink,
    Zap, Settings2, RotateCcw, Sparkles, Search, FileText, Check, MoreVertical,
    ArrowUpNarrowWide, ArrowDownWideNarrow, LayoutGrid
} from 'lucide-react'
import {
    addNote, getNotesByVideo, updateNote, deleteNote, formatDuration, getVideo
} from '../../utils/db'
import { get } from '../../utils/api'
import { transcriptEngine } from '../../utils/transcriptAutocomplete'
import { useNotification } from '../../contexts/NotificationContext'
import InlineImageCropper from './InlineImageCropper'

const MAX_IMAGE_WIDTH = 800
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

function resizeImage(file) {
    return new Promise((resolve, reject) => {
        if (file.size > MAX_IMAGE_SIZE_BYTES * 4) {
            reject(new Error('Image too large (max ~8MB input)'))
            return
        }
        const reader = new FileReader()
        reader.onload = (e) => {
            const img = new Image()
            img.onload = () => {
                if (img.width <= MAX_IMAGE_WIDTH && file.size <= MAX_IMAGE_SIZE_BYTES) {
                    resolve(e.target.result)
                    return
                }
                const canvas = document.createElement('canvas')
                const scale = Math.min(1, MAX_IMAGE_WIDTH / img.width)
                canvas.width = img.width * scale
                canvas.height = img.height * scale
                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                let quality = 0.85
                let result = canvas.toDataURL('image/jpeg', quality)
                // Reduce quality if still too big
                while (result.length > MAX_IMAGE_SIZE_BYTES && quality > 0.3) {
                    quality -= 0.1
                    result = canvas.toDataURL('image/jpeg', quality)
                }
                resolve(result)
            }
            img.onerror = () => reject(new Error('Failed to load image'))
            img.src = e.target.result
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
    })
}

function execCommand(command, value = null) {
    document.execCommand(command, false, value)
}

function RichTextToolbar({ onImageInsert, onCaptureScreenshot, onActivity }) {
    const fileInputRef = useRef(null)
    const [isCapturing, setIsCapturing] = useState(false)
    const { showNotification } = useNotification()

    const toolbarBtn = (onClick, title, Icon, isActive, disabled = false) => (
        <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => {
                e.preventDefault()
                if (!disabled) {
                    onClick()
                    onActivity?.()
                }
            }}
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer ${isActive
                ? 'bg-primary/15 text-primary-fg font-semibold'
                : 'text-light-text-secondary hover:text-light-text dark:text-dark-text-secondary dark:hover:text-dark-text hover:bg-gray-200/70 dark:hover:bg-white/10'
                } ${disabled ? 'opacity-35 cursor-not-allowed' : ''}`}
            title={title}
        >
            <Icon className={`w-3.5 h-3.5 ${isActive ? 'animate-pulse' : ''}`} />
        </button>
    )

    async function handleFileSelect(e) {
        const file = e.target.files?.[0]
        if (!file || !file.type.startsWith('image/')) return
        try {
            const dataUrl = await resizeImage(file)
            onImageInsert(dataUrl)
            onActivity?.()
        } catch (err) {
            console.error('Failed to process image:', err)
            showNotification(err.message || 'Failed to process image', 'error')
        }
        e.target.value = ''
    }

    async function handleScreenshotCapture() {
        if (!onCaptureScreenshot) {
            showNotification('Video player not ready for screenshot capture', 'warning')
            return
        }

        try {
            setIsCapturing(true)
            const result = await onCaptureScreenshot()
            const dataUrl = result?.dataUrl || result
            if (dataUrl) {
                onImageInsert(dataUrl)
                onActivity?.()
            }
        } catch (err) {
            console.error('Failed to capture screenshot:', err)
            showNotification(err.message || 'Failed to capture screenshot', 'error')
        } finally {
            setIsCapturing(false)
        }
    }

    return (
        <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-b border-light-border dark:border-dark-border bg-light-bg/40 dark:bg-dark-bg/30">
            {toolbarBtn(() => execCommand('bold'), 'Bold (Ctrl+B)', Bold)}
            {toolbarBtn(() => execCommand('italic'), 'Italic (Ctrl+I)', Italic)}
            {toolbarBtn(() => execCommand('strikeThrough'), 'Strikethrough', Strikethrough)}
            <div className="w-px h-3.5 bg-black/10 dark:bg-white/10 mx-1" />
            {toolbarBtn(() => execCommand('insertUnorderedList'), 'Bullet List', List)}
            <div className="w-px h-3.5 bg-black/10 dark:bg-white/10 mx-1" />
            {toolbarBtn(() => fileInputRef.current?.click(), 'Add Image', ImagePlus)}
            {toolbarBtn(handleScreenshotCapture, 'Capture Video Screenshot', Camera, isCapturing)}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
            />
        </div>
    )
}

function NoteEditor({
    content,
    onChange,
    onSubmit,
    onCancel,
    onCaptureScreenshot,
    onPlay,
    onPause,
    getPlaybackState,
    onSeek,
    currentTime = 0,
    autocompleteEnabled = true,
    smartPauseEnabled = true,
    smartPauseDelay = 2.5,
    smartPauseRewind = true,
    placeholder = 'Write your note...',
    borderless = false,
    onSmartPauseChange
}) {
    const editorRef = useRef(null)
    const wrapperRef = useRef(null)
    const isInitializedRef = useRef(false)
    const [croppingImage, setCroppingImage] = useState(null)
    const [hoveredImg, setHoveredImg] = useState(null)
    // ghostSuggestion holds metadata about the pending suggestion but NOT rendered as floating div
    // The actual ghost text is an inline <span data-ghost> injected into the contentEditable DOM
    const [ghostSuggestion, setGhostSuggestion] = useState(null)
    const ghostSpanRef = useRef(null) // ref to the live inline ghost span element
    const { showNotification } = useNotification()

    // Smart Pause State & Refs
    const [isSmartPaused, setIsSmartPaused] = useState(false)
    const [countdownSecs, setCountdownSecs] = useState(null)
    const isSmartPausedRef = useRef(false)
    const wasPlayingWhenStartedRef = useRef(false)
    const resumeTimerRef = useRef(null)
    const countdownIntervalRef = useRef(null)
    const typingStartTimeRef = useRef(null)

    const onPlayRef = useRef(onPlay)
    onPlayRef.current = onPlay
    const onPauseRef = useRef(onPause)
    onPauseRef.current = onPause
    const onSeekRef = useRef(onSeek)
    onSeekRef.current = onSeek
    const getPlaybackStateRef = useRef(getPlaybackState)
    getPlaybackStateRef.current = getPlaybackState
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const smartPauseRewindRef = useRef(smartPauseRewind)
    smartPauseRewindRef.current = smartPauseRewind

    // Set initial content once
    useEffect(() => {
        if (editorRef.current && !isInitializedRef.current) {
            editorRef.current.innerHTML = content || ''
            isInitializedRef.current = true
        }
    }, [content])

    const handleInput = useCallback(() => {
        if (editorRef.current) {
            const html = editorRef.current.innerHTML
            onChangeRef.current?.(html)
        }
    }, [])

    const getClosestBlock = useCallback((node) => {
        let curr = node
        while (curr && curr !== editorRef.current) {
            if (curr.nodeType === Node.ELEMENT_NODE) {
                const tag = curr.tagName.toLowerCase()
                if (['p', 'div', 'h1', 'h2', 'h3', 'blockquote', 'li', 'pre'].includes(tag)) {
                    return curr
                }
            }
            curr = curr.parentNode
        }
        return null
    }, [])

    const setCaretInside = useCallback((el) => {
        try {
            const range = document.createRange()
            const sel = window.getSelection()
            if (el.firstChild) {
                if (el.firstChild.nodeType === Node.TEXT_NODE) {
                    range.setStart(el.firstChild, 0)
                } else {
                    range.setStart(el, 0)
                }
            } else {
                range.selectNodeContents(el)
            }
            range.collapse(true)
            sel.removeAllRanges()
            sel.addRange(range)
            el.focus?.()
        } catch { /* ignore */ }
    }, [])

    const setCaretToEnd = useCallback((el) => {
        try {
            const range = document.createRange()
            const sel = window.getSelection()
            range.selectNodeContents(el)
            range.collapse(false)
            sel.removeAllRanges()
            sel.addRange(range)
        } catch { /* ignore */ }
    }, [])

    // Get the current block's text content, ignoring ghost spans
    const getCurrentBlockText = useCallback((block) => {
        if (!block) return ''
        const clone = block.cloneNode(true)
        clone.querySelectorAll('[data-ghost]').forEach(s => s.remove())
        return clone.textContent || ''
    }, [])

    // Wrap a bare text/inline node that is a direct child of the editor into a <p>
    const ensureBlockWrapper = useCallback((node) => {
        if (!editorRef.current) return null
        let directChild = node
        while (directChild && directChild.parentNode !== editorRef.current) {
            directChild = directChild.parentNode
        }
        if (!directChild || directChild === editorRef.current) return null
        // Already a recognised block
        if (directChild.nodeType === Node.ELEMENT_NODE) {
            const t = directChild.tagName.toLowerCase()
            if (['p', 'div', 'h1', 'h2', 'h3', 'blockquote', 'li', 'pre', 'ul', 'ol'].includes(t)) {
                return directChild
            }
        }
        // Bare text node — wrap in <p>
        if (directChild.nodeType === Node.TEXT_NODE) {
            const p = document.createElement('p')
            editorRef.current.insertBefore(p, directChild)
            p.appendChild(directChild)
            return p
        }
        return null
    }, [])

    // Called on Space keydown — converts markdown prefixes (#, ##, ###, >, -, *, 1.)
    const applyMarkdownOnSpace = useCallback(() => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0 || !editorRef.current) return false
        const range = sel.getRangeAt(0)
        if (!range.collapsed) return false

        const node = range.startContainer
        let block = getClosestBlock(node)
        if (!block || !editorRef.current.contains(block)) {
            block = ensureBlockWrapper(node)
        }
        if (!block || !editorRef.current.contains(block)) return false

        const tag = block.tagName.toLowerCase()
        const rawText = getCurrentBlockText(block)
        const text = rawText.trim()

        const replaceBlockWith = (newEl, targetInside = null) => {
            const parent = block.parentNode || editorRef.current
            if (parent.contains(block)) {
                parent.replaceChild(newEl, block)
            } else {
                editorRef.current.appendChild(newEl)
            }
            setCaretInside(targetInside || newEl)
            handleInput()
            return true
        }

        // Headings: # → h1, ## → h2, ### → h3
        if (!['h1', 'h2', 'h3'].includes(tag)) {
            if (text === '###') {
                const h = document.createElement('h3')
                h.innerHTML = '<br>'
                return replaceBlockWith(h)
            }
            if (text === '##') {
                const h = document.createElement('h2')
                h.innerHTML = '<br>'
                return replaceBlockWith(h)
            }
            if (text === '#') {
                const h = document.createElement('h1')
                h.innerHTML = '<br>'
                return replaceBlockWith(h)
            }
        }

        // Blockquote: >
        if (tag !== 'blockquote' && text === '>') {
            const bq = document.createElement('blockquote')
            bq.innerHTML = '<br>'
            return replaceBlockWith(bq)
        }

        // Unordered list: - or *
        if (tag !== 'li' && (text === '-' || text === '*')) {
            const ul = document.createElement('ul')
            const li = document.createElement('li')
            li.innerHTML = '<br>'
            ul.appendChild(li)
            return replaceBlockWith(ul, li)
        }

        // Ordered list: 1. or 1
        if (tag !== 'li' && (text === '1.' || text === '1')) {
            const ol = document.createElement('ol')
            const li = document.createElement('li')
            li.innerHTML = '<br>'
            ol.appendChild(li)
            return replaceBlockWith(ol, li)
        }

        return false
    }, [getClosestBlock, ensureBlockWrapper, getCurrentBlockText, setCaretInside, handleInput])

    // Inline code (`text`) — runs on onInput after the closing backtick is typed
    const processInlineCode = useCallback(() => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0 || !editorRef.current) return
        const range = sel.getRangeAt(0)
        const node = range.startContainer
        if (node.nodeType !== Node.TEXT_NODE) return

        const val = node.nodeValue || ''
        const codeMatch = /`([^`\n]+)`/.exec(val)
        if (codeMatch && range.startOffset >= codeMatch.index + codeMatch[0].length) {
            const codeText = codeMatch[1]
            const startIdx = codeMatch.index
            const endIdx = startIdx + codeMatch[0].length
            const beforeText = val.slice(0, startIdx)
            const afterText = val.slice(endIdx)

            const codeEl = document.createElement('code')
            codeEl.textContent = codeText
            const parent = node.parentNode
            if (parent) {
                if (beforeText) parent.insertBefore(document.createTextNode(beforeText), node)
                parent.insertBefore(codeEl, node)
                const afterNode = document.createTextNode(afterText || '\u00A0')
                parent.insertBefore(afterNode, node)
                parent.removeChild(node)
                const newRange = document.createRange()
                newRange.setStart(afterNode, afterText ? 0 : 1)
                newRange.collapse(true)
                sel.removeAllRanges()
                sel.addRange(newRange)
                handleInput()
            }
        }
    }, [handleInput])

    // Remove the inline ghost <span> from the DOM if present
    const removeGhostSpan = useCallback(() => {
        if (ghostSpanRef.current && ghostSpanRef.current.isConnected) {
            ghostSpanRef.current.remove()
        }
        ghostSpanRef.current = null
    }, [])

    // Insert the inline ghost <span> right after the caret position
    const insertGhostSpan = useCallback((textNode, offset, completion) => {
        removeGhostSpan()
        if (!textNode || !textNode.isConnected) return

        const span = document.createElement('span')
        span.setAttribute('data-ghost', 'true')
        span.contentEditable = 'false'
        span.textContent = completion
        span.style.cssText = [
            'color: var(--color-primary-fg, #7c6af7)',
            'opacity: 0.55',
            'font-style: italic',
            'pointer-events: none',
            'user-select: none',
            'display: inline',
        ].join(';')

        // Split the text node at caret offset and insert span between the halves
        const after = textNode.splitText(offset)
        textNode.parentNode.insertBefore(span, after)
        ghostSpanRef.current = span

        // Restore caret to original position (end of the first text node half)
        try {
            const sel = window.getSelection()
            const r = document.createRange()
            r.setStart(textNode, textNode.textContent.length)
            r.collapse(true)
            sel.removeAllRanges()
            sel.addRange(r)
        } catch { /* ignore */ }
    }, [removeGhostSpan])

    const updateGhostSuggestion = useCallback(() => {
        if (!autocompleteEnabled || !editorRef.current) {
            removeGhostSpan()
            setGhostSuggestion(null)
            return
        }

        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) {
            removeGhostSpan()
            setGhostSuggestion(null)
            return
        }

        const range = sel.getRangeAt(0)
        let node = range.startContainer

        // Verify that the active cursor is actually inside our editor (skip ghost span itself)
        if (!editorRef.current.contains(node) || node === ghostSpanRef.current) {
            removeGhostSpan()
            setGhostSuggestion(null)
            return
        }

        // If cursor is at start of after-half of a previous split, look at the sibling before
        if (node.nodeType === Node.TEXT_NODE) {
            const textBefore = node.textContent.slice(0, range.startOffset)
            const curTime = getPlaybackStateRef.current?.()?.currentTime ?? currentTime ?? 0
            const suggestion = transcriptEngine.getSuggestion(textBefore, curTime)

            if (suggestion && suggestion.completion) {
                // Only re-insert if suggestion changed to avoid caret jumping
                const same = ghostSpanRef.current?.textContent === suggestion.completion
                if (!same) {
                    insertGhostSpan(node, range.startOffset, suggestion.completion)
                }
                setGhostSuggestion({
                    completion: suggestion.completion,
                    fullPhrase: suggestion.fullPhrase,
                    node,
                    offset: range.startOffset
                })
                return
            }
        }

        removeGhostSpan()
        setGhostSuggestion(null)
    }, [currentTime, autocompleteEnabled, insertGhostSpan, removeGhostSpan])

    const cleanupSmartTimers = useCallback(() => {
        if (resumeTimerRef.current) {
            clearTimeout(resumeTimerRef.current)
            resumeTimerRef.current = null
        }
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current)
            countdownIntervalRef.current = null
        }
        setCountdownSecs(null)
    }, [])

    const resumePlaybackNow = useCallback((shouldRewind = true) => {
        cleanupSmartTimers()
        if (isSmartPausedRef.current && wasPlayingWhenStartedRef.current) {
            if (shouldRewind && smartPauseRewindRef.current && onSeekRef.current) {
                const cur = getPlaybackStateRef.current?.()?.currentTime
                if (typeof cur === 'number' && cur > 0) {
                    onSeekRef.current(Math.max(0, cur - 1.5))
                }
            }
            onPlayRef.current?.()
        }
        isSmartPausedRef.current = false
        wasPlayingWhenStartedRef.current = false
        setIsSmartPaused(false)
    }, [cleanupSmartTimers])

    const triggerWritingActivity = useCallback(() => {
        if (!smartPauseEnabled || !onPauseRef.current) {
            return
        }

        // First keystroke: detect if video was playing and pause it
        if (!isSmartPausedRef.current) {
            const pbState = getPlaybackStateRef.current?.()
            const isPlaying = pbState?.isPlaying ?? false

            if (isPlaying) {
                wasPlayingWhenStartedRef.current = true
                isSmartPausedRef.current = true
                setIsSmartPaused(true)
                onPauseRef.current()
            } else {
                return
            }
        }

        // Video was playing when we started — debounce the resume timer
        if (wasPlayingWhenStartedRef.current) {
            if (resumeTimerRef.current) {
                clearTimeout(resumeTimerRef.current)
                resumeTimerRef.current = null
            }
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current)
                countdownIntervalRef.current = null
            }

            const delay = Math.max(1, smartPauseDelay)
            typingStartTimeRef.current = Date.now()
            setCountdownSecs(Number(delay.toFixed(1)))

            countdownIntervalRef.current = setInterval(() => {
                const elapsed = (Date.now() - typingStartTimeRef.current) / 1000
                const left = Math.max(0, delay - elapsed)
                setCountdownSecs(Number(left.toFixed(1)))
                if (left <= 0) {
                    clearInterval(countdownIntervalRef.current)
                    countdownIntervalRef.current = null
                }
            }, 100)

            resumeTimerRef.current = setTimeout(() => {
                resumePlaybackNow(true)
            }, delay * 1000)
        }
    }, [smartPauseEnabled, smartPauseDelay, resumePlaybackNow])

    // Sync smart pause status to parent component for footer display
    useEffect(() => {
        onSmartPauseChange?.({
            isSmartPaused,
            countdownSecs,
            smartPauseDelay,
            resumePlaybackNow
        })
    }, [isSmartPaused, countdownSecs, smartPauseDelay, resumePlaybackNow, onSmartPauseChange])

    useEffect(() => {
        return () => {
            onSmartPauseChange?.(null)
        }
    }, [onSmartPauseChange])

    // Cleanup and resume playback only on actual component unmount
    useEffect(() => {
        return () => {
            if (isSmartPausedRef.current && wasPlayingWhenStartedRef.current) {
                onPlayRef.current?.()
            }
            if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
        }
    }, [])

    function acceptGhostSuggestion() {
        if (!ghostSuggestion) return

        // Remove the ghost span first so it doesn't get serialised as content
        removeGhostSpan()

        const textNode = ghostSuggestion.node
        const offset = ghostSuggestion.offset
        const completion = ghostSuggestion.completion

        if (textNode && textNode.isConnected) {
            // The text node was NOT split yet (ghost was just metadata) — insert inline
            const before = textNode.textContent.slice(0, offset)
            const after = textNode.textContent.slice(offset)
            textNode.textContent = before + completion + after

            // Move caret to end of completion
            try {
                const sel = window.getSelection()
                const newRange = document.createRange()
                newRange.setStart(textNode, offset + completion.length)
                newRange.collapse(true)
                sel.removeAllRanges()
                sel.addRange(newRange)
            } catch { /* ignore */ }

            // Brief flash: wrap the inserted text in a transient highlight span, then unwrap
            try {
                const hlSpan = document.createElement('span')
                hlSpan.style.cssText = 'color: var(--color-primary-fg, #7c6af7); transition: color 400ms'
                const hlText = document.createTextNode(completion)
                hlSpan.appendChild(hlText)
                // Split textNode at offset to insert the highlight
                const afterPart = textNode.splitText(offset)
                // Remove the newly inserted completion from afterPart's start
                afterPart.textContent = afterPart.textContent.slice(completion.length)
                textNode.parentNode.insertBefore(hlSpan, afterPart)
                // After animation, unwrap
                setTimeout(() => {
                    if (hlSpan.isConnected) {
                        const plain = document.createTextNode(hlSpan.textContent)
                        hlSpan.parentNode.replaceChild(plain, hlSpan)
                    }
                }, 420)
            } catch { /* non-critical */ }
        } else {
            document.execCommand('insertText', false, completion)
        }

        setGhostSuggestion(null)
        handleInput()
        triggerWritingActivity()
    }

    function handleEditorKeyDown(e) {
        // Ctrl+Enter or Cmd+Enter to submit
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            onSubmit?.()
            return
        }

        // Escape to dismiss ghost suggestion first, or cancel editor
        if (e.key === 'Escape') {
            if (ghostSuggestion) {
                e.preventDefault()
                e.stopPropagation()
                removeGhostSpan()
                setGhostSuggestion(null)
                return
            }
            e.preventDefault()
            onCancel?.()
            return
        }

        // Tab or ArrowRight at end-of-line to accept ghost suggestion
        if (ghostSuggestion && (e.key === 'Tab' || e.key === 'ArrowRight')) {
            if (e.key === 'ArrowRight') {
                const sel = window.getSelection()
                if (sel && sel.rangeCount > 0) {
                    const r = sel.getRangeAt(0)
                    if (r.startOffset < r.startContainer.textContent.length) return
                }
            }
            e.preventDefault()
            e.stopPropagation()
            acceptGhostSuggestion()
            return
        }

        // Any real keystroke clears the ghost
        if (!['Control', 'Shift', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
            removeGhostSpan()
            setGhostSuggestion(null)
            triggerWritingActivity()
        }

        // ── Backspace: reduce heading level (Obsidian-style h3→h2→h1→p), exit list/quote ──
        if (e.key === 'Backspace') {
            const sel = window.getSelection()
            if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
                const range = sel.getRangeAt(0)
                const node = range.startContainer
                let block = getClosestBlock(node)
                if (!block) block = ensureBlockWrapper(node)
                const tag = block?.tagName?.toLowerCase()

                // 1. Heading downgrade: h3 → h2 → h1 → p
                if (block && ['h1', 'h2', 'h3'].includes(tag)) {
                    const isAtStart =
                        (range.startOffset === 0 && node === block) ||
                        (range.startOffset === 0 && node === block.firstChild) ||
                        (node.nodeType === Node.TEXT_NODE && range.startOffset === 0 && !node.previousSibling)

                    if (isAtStart) {
                        e.preventDefault()
                        const newTag = tag === 'h3' ? 'h2' : tag === 'h2' ? 'h1' : 'p'
                        const newEl = document.createElement(newTag)
                        newEl.innerHTML = block.innerHTML || '<br>'
                        block.parentNode.replaceChild(newEl, block)
                        setCaretInside(newEl)
                        handleInput()
                        return
                    }
                }

                // 2. Empty list item backspace: exit list to paragraph
                if (tag === 'li') {
                    const blockText = getCurrentBlockText(block).trim()
                    if (!blockText) {
                        e.preventDefault()
                        const listParent = block.closest('ul, ol')
                        const newP = document.createElement('p')
                        newP.innerHTML = '<br>'
                        if (listParent && listParent.children.length === 1) {
                            listParent.parentNode.replaceChild(newP, listParent)
                        } else if (block.parentNode) {
                            block.remove()
                            if (listParent) listParent.parentNode.insertBefore(newP, listParent.nextSibling)
                        }
                        setCaretInside(newP)
                        handleInput()
                        return
                    }
                }

                // 3. Empty blockquote backspace: turn into paragraph
                if (tag === 'blockquote') {
                    const blockText = getCurrentBlockText(block).trim()
                    if (!blockText) {
                        e.preventDefault()
                        const newP = document.createElement('p')
                        newP.innerHTML = '<br>'
                        block.parentNode.replaceChild(newP, block)
                        setCaretInside(newP)
                        handleInput()
                        return
                    }
                }
            }
        }

        // ── Space key: try markdown block transform (intercept BEFORE browser inserts space) ──
        if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            const transformed = applyMarkdownOnSpace()
            if (transformed) {
                e.preventDefault()
                return
            }
        }

        // ── Enter key: exit heading to paragraph, empty list exit, or markdown divider (---) ──
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            const sel = window.getSelection()
            if (sel && sel.rangeCount > 0 && editorRef.current) {
                const node = sel.getRangeAt(0).startContainer
                let block = getClosestBlock(node)
                if (!block) block = ensureBlockWrapper(node)
                const tag = block?.tagName?.toLowerCase()

                // Divider line: ---
                if (block && getCurrentBlockText(block).trim() === '---') {
                    e.preventDefault()
                    const hr = document.createElement('hr')
                    const newP = document.createElement('p')
                    newP.innerHTML = '<br>'
                    if (block.parentNode) {
                        block.parentNode.insertBefore(hr, block)
                        block.parentNode.replaceChild(newP, block)
                        setCaretInside(newP)
                        handleInput()
                        triggerWritingActivity()
                    }
                    return
                }

                // Empty list item enter: exit list
                if (tag === 'li' && !getCurrentBlockText(block).trim()) {
                    e.preventDefault()
                    const listParent = block.closest('ul, ol')
                    const newP = document.createElement('p')
                    newP.innerHTML = '<br>'
                    if (listParent && listParent.children.length === 1) {
                        listParent.parentNode.replaceChild(newP, listParent)
                    } else if (block.parentNode) {
                        block.remove()
                        if (listParent) listParent.parentNode.insertBefore(newP, listParent.nextSibling)
                    }
                    setCaretInside(newP)
                    handleInput()
                    triggerWritingActivity()
                    return
                }

                // Heading Enter at end: next line is normal paragraph
                if (block && ['h1', 'h2', 'h3'].includes(tag)) {
                    const range = sel.getRangeAt(0)
                    const isAtEnd = range.startOffset >= (node.textContent?.length || 0)
                    if (isAtEnd) {
                        e.preventDefault()
                        const newP = document.createElement('p')
                        newP.innerHTML = '<br>'
                        block.parentNode.insertBefore(newP, block.nextSibling)
                        setCaretInside(newP)
                        handleInput()
                        triggerWritingActivity()
                        return
                    }
                }
            }
        }
    }

    function handleImageInsert(dataUrl) {
        if (!editorRef.current) return
        editorRef.current.focus()

        // Insert image as its own block so cursor doesn't get stuck beside it
        const imgWrapper = document.createElement('div')
        imgWrapper.style.margin = '6px 0'
        const img = document.createElement('img')
        img.src = dataUrl
        img.alt = 'Note image'
        img.style.maxWidth = '100%'
        img.style.borderRadius = '6px'
        imgWrapper.appendChild(img)

        // Create a new empty paragraph after the image for the cursor to land on
        const newLine = document.createElement('p')
        newLine.appendChild(document.createElement('br'))

        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0)
            range.deleteContents()
            range.insertNode(newLine)
            range.insertNode(imgWrapper)
            // Move cursor to the new empty paragraph after the image
            const newRange = document.createRange()
            newRange.setStart(newLine, 0)
            newRange.collapse(true)
            sel.removeAllRanges()
            sel.addRange(newRange)
        } else {
            editorRef.current.appendChild(imgWrapper)
            editorRef.current.appendChild(newLine)
        }

        handleInput()
        triggerWritingActivity()
    }

    async function handlePaste(e) {
        triggerWritingActivity()
        const items = e.clipboardData?.items
        if (!items) return

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault()
                const file = item.getAsFile()
                if (!file) continue
                try {
                    const dataUrl = await resizeImage(file)
                    handleImageInsert(dataUrl)
                } catch (err) {
                    console.error('Failed to paste image:', err)
                }
                return
            }
        }
    }

    function handleDragOver(e) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
    }

    async function handleDrop(e) {
        e.preventDefault()
        triggerWritingActivity()
        const files = e.dataTransfer?.files
        if (!files) return

        for (const file of files) {
            if (file.type.startsWith('image/')) {
                try {
                    const dataUrl = await resizeImage(file)
                    handleImageInsert(dataUrl)
                } catch (err) {
                    console.error('Failed to drop image:', err)
                }
                return
            }
        }
    }

    function startCropping(targetImgElement) {
        if (!targetImgElement) return
        handleInput()
        cleanupSmartTimers()
        setCroppingImage({
            element: targetImgElement,
            src: targetImgElement.src
        })
        setHoveredImg(null)
    }

    // Detect hovered image and position the action buttons natively inside the scroll container
    function handleMouseMove(e) {
        if (croppingImage) return
        if (e.target.tagName === 'IMG' && wrapperRef.current) {
            const wrapRect = wrapperRef.current.getBoundingClientRect()
            const imgRect = e.target.getBoundingClientRect()
            const scrollTop = wrapperRef.current.scrollTop
            const scrollLeft = wrapperRef.current.scrollLeft
            setHoveredImg({
                element: e.target,
                src: e.target.src,
                top: (imgRect.top - wrapRect.top) + scrollTop + 6,
                left: (imgRect.left - wrapRect.left) + scrollLeft + imgRect.width - 96
            })
        } else if (hoveredImg && !e.target.closest('.crop-action-pill')) {
            setHoveredImg(null)
        }
    }

    function handleApplyCrop(croppedDataUrl) {
        if (croppingImage) {
            // First try direct element mutation if attached to DOM
            if (croppingImage.element && croppingImage.element.isConnected) {
                croppingImage.element.src = croppedDataUrl
            } else if (editorRef.current) {
                // Fallback: search images by matching src
                const imgs = editorRef.current.querySelectorAll('img')
                let replaced = false
                for (const img of imgs) {
                    if (img.src === croppingImage.src) {
                        img.src = croppedDataUrl
                        replaced = true
                        break
                    }
                }
                if (!replaced) {
                    editorRef.current.innerHTML = editorRef.current.innerHTML.replace(croppingImage.src, croppedDataUrl)
                }
            }
            handleInput()
        }

        setCroppingImage(null)
        setHoveredImg(null)
        triggerWritingActivity()
    }

    function handleRemoveImage(targetImgElement) {
        if (!targetImgElement) return
        const parent = targetImgElement.parentElement
        // If image is inside an imgWrapper or single-child container, clean up the wrapper
        if (parent && parent !== editorRef.current && (parent.tagName === 'DIV' || parent.tagName === 'P') && parent.children.length === 1 && !parent.textContent.trim()) {
            parent.remove()
        } else {
            targetImgElement.remove()
        }
        setHoveredImg(null)
        handleInput()
        triggerWritingActivity()
    }

    function handleCancelCrop() {
        setCroppingImage(null)
        setHoveredImg(null)
    }

    return (
        <div className={`relative overflow-hidden ${borderless ? '' : 'border border-light-border dark:border-dark-border rounded-lg'}`}>
            <RichTextToolbar
                onImageInsert={handleImageInsert}
                onCaptureScreenshot={onCaptureScreenshot}
                onActivity={triggerWritingActivity}
            />

            {/* In-Place Image Cropper (rendered without unmounting the editor DOM) */}
            {croppingImage && (
                <div className="p-2 bg-light-surface dark:bg-dark-bg/60 border-b border-light-border dark:border-dark-border">
                    <InlineImageCropper
                        imageSrc={croppingImage.src}
                        onApplyCrop={handleApplyCrop}
                        onCancel={handleCancelCrop}
                    />
                </div>
            )}

            <div
                ref={wrapperRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredImg(null)}
                onScroll={() => {
                    // Ghost scrolls with content naturally (inline span) — just update suggestion metadata
                    updateGhostSuggestion()
                }}
                className={`relative w-full min-h-[95px] max-h-[320px] overflow-y-auto px-3.5 py-2.5 bg-white dark:bg-dark-surface ${croppingImage ? 'hidden' : 'block'}`}
            >
                <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={() => {
                        // Remove ghost before reading innerHTML so span isn't serialised
                        removeGhostSpan()
                        setGhostSuggestion(null)
                        processInlineCode()   // only inline-code transform runs on input
                        handleInput()
                        triggerWritingActivity()
                        // Suggest after DOM settles
                        requestAnimationFrame(updateGhostSuggestion)
                    }}
                    onKeyUp={(e) => {
                        // Re-compute only on cursor-moving keys (not when Tab/ArrowRight already accepted)
                        if (!['Tab', 'ArrowRight'].includes(e.key)) {
                            updateGhostSuggestion()
                        }
                    }}
                    onMouseUp={updateGhostSuggestion}
                    onBlur={() => {
                        setTimeout(() => {
                            removeGhostSpan()
                            setGhostSuggestion(null)
                        }, 150)
                    }}
                    onKeyDown={handleEditorKeyDown}
                    onPaste={handlePaste}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className="note-editor w-full min-h-full text-sm focus:outline-none"
                    data-placeholder={placeholder}
                    dir="auto"
                />

                {/* Ghost text is rendered INLINE inside contentEditable via ghostSpanRef — no overlay div needed */}
                {/* Tab hint pill shown near bottom-right of editor whenever a ghost is active */}
                {ghostSuggestion && (
                    <div className="absolute bottom-2 right-2 pointer-events-none z-20 flex items-center gap-1 animate-fade-in">
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-primary/15 text-primary-fg text-[10px] font-mono font-semibold rounded border border-primary/25 shadow-xs select-none">
                            ⇥ Tab
                        </span>
                    </div>
                )}

                {/* Action Buttons statically positioned on the Photo - scrolls natively with image */}
                {hoveredImg && (
                    <div
                        className="crop-action-pill absolute z-20 pointer-events-auto flex items-center gap-1"
                        style={{
                            top: `${Math.max(6, hoveredImg.top)}px`,
                            left: `${Math.max(6, hoveredImg.left)}px`
                        }}
                    >
                        {/* Crop Button */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                startCropping(hoveredImg.element)
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 bg-black/85 hover:bg-black text-white text-[11px] font-medium rounded shadow cursor-pointer"
                            title="Crop this photo"
                        >
                            <Crop className="w-3 h-3 text-primary-fg" />
                            <span>Crop</span>
                        </button>

                        {/* X (Remove Photo) Button */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleRemoveImage(hoveredImg.element)
                            }}
                            className="flex items-center justify-center w-6 h-6 bg-black/85 hover:bg-red-600 text-white rounded shadow cursor-pointer"
                            title="Remove photo"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

function NotesPanel({
    video,
    courseId,
    currentTime = 0,
    onSeek,
    onCaptureFrame,
    onPlay,
    onPause,
    getPlaybackState
}) {
    const [notes, setNotes] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [showAddNote, setShowAddNote] = useState(false)
    const [editingNote, setEditingNote] = useState(null)
    const [noteContent, setNoteContent] = useState('')
    const [noteTimestamp, setNoteTimestamp] = useState(null)
    const [editorKey, setEditorKey] = useState(0)
    const [previewImage, setPreviewImage] = useState(null)
    const { showNotification } = useNotification()

    const [smartPauseState, setSmartPauseState] = useState(null)
    const [sortOrder, setSortOrder] = useState(() => localStorage.getItem('tutin_notes_sort_order') || 'asc')
    const [transcriptStats, setTranscriptStats] = useState({ isIndexed: false, totalTokens: 0 })
    const [autocompleteEnabled, setAutocompleteEnabled] = useState(() => {
        return localStorage.getItem('tutin_transcript_autocomplete') !== 'false'
    })

    // Sort notes according to sortOrder (asc = chronological / oldest first, desc = latest first)
    const sortedNotes = useMemo(() => {
        return [...notes].sort((a, b) => {
            const timeA = a.timestamp ?? 0
            const timeB = b.timestamp ?? 0
            if (sortOrder === 'asc') {
                if (timeA !== timeB) return timeA - timeB
                return new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
            } else {
                if (timeA !== timeB) return timeB - timeA
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
            }
        })
    }, [notes, sortOrder])

    // Load and index video transcript into memory Trie + N-Gram indexer
    const loadAndIndexTranscript = useCallback(async (videoId) => {
        if (!videoId) {
            transcriptEngine.indexTranscript([], '')
            setTranscriptStats(transcriptEngine.getStats())
            return
        }

        try {
            // 1. Try fetching timestamped chunks from companion server
            const chunks = await get(`/api/transcripts/${videoId}/chunks`)
            if (Array.isArray(chunks) && chunks.length > 0) {
                transcriptEngine.indexTranscript(chunks)
                setTranscriptStats(transcriptEngine.getStats())
                return
            }
        } catch (err) {
            // Chunks not ready or server error - fallback to DB
        }

        try {
            const dbVid = await getVideo(videoId)
            if (dbVid?.transcript) {
                transcriptEngine.indexTranscript([], dbVid.transcript)
                setTranscriptStats(transcriptEngine.getStats())
            } else {
                transcriptEngine.indexTranscript([], '')
                setTranscriptStats(transcriptEngine.getStats())
            }
        } catch {
            transcriptEngine.indexTranscript([], '')
            setTranscriptStats(transcriptEngine.getStats())
        }
    }, [])

    useEffect(() => {
        loadAndIndexTranscript(video?.id)
    }, [video?.id, loadAndIndexTranscript])

    // Listen for global transcript events (e.g. caption file loaded, smart sync, or translation)
    useEffect(() => {
        const handleTranscriptUpdated = (e) => {
            if (e.detail?.videoId === video?.id || !e.detail?.videoId) {
                loadAndIndexTranscript(video?.id)
            }
        }
        window.addEventListener('tutin:transcript-updated', handleTranscriptUpdated)
        return () => window.removeEventListener('tutin:transcript-updated', handleTranscriptUpdated)
    }, [video?.id, loadAndIndexTranscript])

    // Smart Pause options
    const [smartPauseEnabled, setSmartPauseEnabled] = useState(() => {
        return localStorage.getItem('tutin_smart_pause') !== 'false'
    })
    const [smartPauseDelay, setSmartPauseDelay] = useState(() => {
        const val = parseFloat(localStorage.getItem('tutin_smart_pause_delay') || '2.5')
        return isNaN(val) ? 2.5 : val
    })
    const [smartPauseRewind, setSmartPauseRewind] = useState(() => {
        return localStorage.getItem('tutin_smart_pause_rewind') !== 'false'
    })
    const [showSmartSettings, setShowSmartSettings] = useState(false)

    // Handle Escape key to close image preview or settings
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (previewImage) setPreviewImage(null)
                if (showSmartSettings) setShowSmartSettings(false)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [previewImage, showSmartSettings])

    // Close settings popover on outside click
    useEffect(() => {
        if (!showSmartSettings) return
        function handleOutside(e) {
            if (!e.target.closest('.smart-pause-settings-container')) {
                setShowSmartSettings(false)
            }
        }
        document.addEventListener('mousedown', handleOutside)
        return () => document.removeEventListener('mousedown', handleOutside)
    }, [showSmartSettings])

    useEffect(() => {
        if (video?.id) {
            loadNotes()
        } else {
            setNotes([])
            setIsLoading(false)
        }

        // Reset draft state when switching to a different video
        setShowAddNote(false)
        setEditingNote(null)
        setNoteContent('')
        setNoteTimestamp(null)
        setEditorKey(prev => prev + 1)
    }, [video?.id])

    async function loadNotes() {
        try {
            setIsLoading(true)
            const videoNotes = await getNotesByVideo(video.id)
            setNotes(videoNotes)
        } catch (err) {
            console.error('Failed to load notes:', err)
        } finally {
            setIsLoading(false)
        }
    }

    async function handleAddNote() {
        // Strip tags to check if there's actual content or images
        const textContent = noteContent.replace(/<[^>]*>/g, '').trim()
        const hasImages = noteContent.includes('<img')
        if (!textContent && !hasImages) return

        try {
            // Extract image data URLs from content
            const imgRegex = /<img[^>]+src="(data:[^"]+)"/g
            const images = []
            let match
            while ((match = imgRegex.exec(noteContent)) !== null) {
                images.push(match[1])
            }

            await addNote({
                videoId: video.id,
                courseId,
                timestamp: noteTimestamp ?? currentTime,
                content: noteContent,
                images
            })
            setNoteContent('')
            setShowAddNote(false)
            setNoteTimestamp(null)
            setEditorKey(k => k + 1)
            await loadNotes()
        } catch (err) {
            console.error('Failed to add note:', err)
        }
    }

    async function handleUpdateNote() {
        if (!editingNote) return
        const textContent = noteContent.replace(/<[^>]*>/g, '').trim()
        const hasImages = noteContent.includes('<img')
        if (!textContent && !hasImages) return

        try {
            const imgRegex = /<img[^>]+src="(data:[^"]+)"/g
            const images = []
            let match
            while ((match = imgRegex.exec(noteContent)) !== null) {
                images.push(match[1])
            }

            await updateNote(editingNote.id, {
                content: noteContent,
                images
            })
            setNoteContent('')
            setEditingNote(null)
            setEditorKey(k => k + 1)
            await loadNotes()
        } catch (err) {
            console.error('Failed to update note:', err)
        }
    }

    async function handleDeleteNote(noteId) {
        if (!confirm('Delete this note?')) return

        try {
            await deleteNote(noteId)
            await loadNotes()
        } catch (err) {
            console.error('Failed to delete note:', err)
        }
    }

    function startEditNote(note) {
        setEditingNote(note)
        setNoteContent(note.content)
        setShowAddNote(false)
        setEditorKey(k => k + 1)
    }

    function cancelEdit() {
        setEditingNote(null)
        setNoteContent('')
        setShowAddNote(false)
        setNoteTimestamp(null)
        setEditorKey(k => k + 1)
    }

    function copyNote(content) {
        // Strip HTML for clipboard
        const temp = document.createElement('div')
        temp.innerHTML = content
        navigator.clipboard.writeText(temp.textContent || temp.innerText || '')
    }

    function exportNotes() {
        const markdown = notes.map(note => {
            const time = formatDuration(note.timestamp)
            // Convert HTML to plain text for export
            const temp = document.createElement('div')
            temp.innerHTML = note.content
            const text = temp.textContent || temp.innerText || ''
            // Include image count if any
            const imgCount = (note.images || []).length
            const imgNote = imgCount > 0 ? `\n[${imgCount} image(s) attached]` : ''
            return `## ${time}\n${text}${imgNote}\n`
        }).join('\n---\n\n')

        const header = `# Notes for: ${video.title}\n\n`
        const blob = new Blob([header + markdown], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${video.title.replace(/[^a-z0-9]/gi, '_')}_notes.md`
        a.click()
        URL.revokeObjectURL(url)
    }

    if (!video) return null

    return (
        <div className="p-4 space-y-4">
                    {/* Unified Single-Row Toolbar */}
                    <div className="flex items-center gap-1.5">
                        {/* 1. Primary Add Note Button */}
                        <button
                            type="button"
                            onClick={() => {
                                setEditingNote(null);
                                setNoteContent('');
                                setNoteTimestamp(currentTime);
                                setEditorKey(k => k + 1);
                                setShowAddNote(true);
                            }}
                            className="flex-1 min-w-0 flex items-center justify-center gap-1.5 h-9 px-3 bg-primary text-primary-content hover:bg-primary-hover rounded-lg transition-all text-xs sm:text-sm font-medium cursor-pointer shadow-sm active:scale-[0.98]"
                            title={`Add note at ${formatDuration(currentTime)}`}
                        >
                            <Plus className="w-4 h-4 shrink-0" />
                            <span className="truncate">Add Note at {formatDuration(currentTime)}</span>
                        </button>

                        {/* 2. Screenshot Note Icon Button */}
                        <button
                            type="button"
                            onClick={async () => {
                                if (!onCaptureFrame) {
                                    showNotification('Video player not ready for screenshot', 'warning')
                                    return
                                }

                                try {
                                    const res = await onCaptureFrame()
                                    const dataUrl = res?.dataUrl || res
                                    if (dataUrl) {
                                        setEditingNote(null);
                                        setNoteContent(`<p><img src="${dataUrl}" alt="Video screenshot at ${formatDuration(currentTime)}" /></p><p><br></p>`);
                                        setNoteTimestamp(currentTime);
                                        setEditorKey(k => k + 1);
                                        setShowAddNote(true);
                                    }
                                } catch (err) {
                                    console.error('Screenshot capture notice:', err)
                                    showNotification(err.message || 'Failed to capture screenshot', 'warning')
                                }
                            }}
                            className="h-9 w-9 flex items-center justify-center border border-light-border dark:border-dark-border rounded-lg bg-light-surface dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface/80 text-light-text dark:text-dark-text transition-colors cursor-pointer shrink-0 shadow-sm active:scale-[0.98]"
                            title="Capture video screenshot to new note"
                        >
                            <Camera className="w-4 h-4 text-primary-fg" />
                        </button>

                        {/* 3. Transcript Autocomplete Toggle Button */}
                        <button
                            type="button"
                            onClick={() => {
                                const next = !autocompleteEnabled
                                setAutocompleteEnabled(next)
                                localStorage.setItem('tutin_transcript_autocomplete', next ? 'true' : 'false')
                            }}
                            className={`h-9 w-9 flex items-center justify-center border border-light-border dark:border-dark-border rounded-lg transition-all duration-150 cursor-pointer shrink-0 shadow-sm active:scale-[0.98] ${autocompleteEnabled
                                ? 'bg-primary/10 text-primary-fg hover:bg-primary/20'
                                : 'bg-light-surface dark:bg-dark-bg text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-surface/80'
                                }`}
                            title={`Transcript Autocomplete: ${autocompleteEnabled ? 'ON' : 'OFF'} (Click to toggle)`}
                        >
                            <Sparkles className={`w-4 h-4 transition-transform ${autocompleteEnabled ? 'fill-primary-fg text-primary-fg' : 'text-light-text-secondary dark:text-dark-text-secondary'}`} />
                        </button>

                        {/* 4. Export Notes Icon Button */}
                        <button
                            type="button"
                            onClick={exportNotes}
                            disabled={notes.length === 0}
                            className="h-9 w-9 flex items-center justify-center border border-light-border dark:border-dark-border rounded-lg bg-light-surface dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface/80 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer shrink-0 shadow-sm active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                            title={notes.length > 0 ? "Export notes as Markdown" : "No notes to export"}
                        >
                            <Download className="w-4 h-4" />
                        </button>

                        {/* 4b. Course Canvas Whiteboard Button */}
                        {courseId && (
                            <Link
                                to={`/course/${courseId}/canvas`}
                                className="h-9 w-9 flex items-center justify-center border border-light-border dark:border-dark-border rounded-lg bg-light-surface dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface/80 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-fg dark:hover:text-primary-fg transition-colors cursor-pointer shrink-0 shadow-sm active:scale-[0.98]"
                                title="Open Canvas"
                            >
                                <LayoutGrid className="w-4 h-4 text-primary-fg" />
                            </Link>
                        )}

                        {/* 5. Reverse / Sort Order Toggle Button */}
                        <button
                            type="button"
                            onClick={() => {
                                const next = sortOrder === 'asc' ? 'desc' : 'asc'
                                setSortOrder(next)
                                localStorage.setItem('tutin_notes_sort_order', next)
                            }}
                            disabled={notes.length <= 1}
                            className="h-9 w-9 flex items-center justify-center border border-light-border dark:border-dark-border rounded-lg bg-light-surface dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface/80 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer shrink-0 shadow-sm active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                            title={`Sort: ${sortOrder === 'asc' ? 'Oldest first' : 'Latest first'}`}
                        >
                            {sortOrder === 'asc' ? (
                                <ArrowUpNarrowWide className="w-4 h-4 text-primary-fg" />
                            ) : (
                                <ArrowDownWideNarrow className="w-4 h-4 text-primary-fg" />
                            )}
                        </button>

                        {/* 6. Smart Pause Split Button with 3-Dots Settings Popover */}
                        <div className="relative smart-pause-settings-container shrink-0 flex items-center">
                            <div className={`flex items-center rounded-lg border border-light-border dark:border-dark-border transition-all duration-150 shadow-sm overflow-hidden outline-none ${smartPauseEnabled
                                ? 'bg-primary/10 text-primary-fg'
                                : 'bg-light-surface dark:bg-dark-bg text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                }`}>
                                {/* Toggle ON/OFF */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = !smartPauseEnabled
                                        setSmartPauseEnabled(next)
                                        localStorage.setItem('tutin_smart_pause', next ? 'true' : 'false')
                                    }}
                                    className={`h-9 px-2.5 flex items-center justify-center transition-colors cursor-pointer active:scale-[0.98] outline-none focus:outline-none ${smartPauseEnabled
                                        ? 'hover:bg-primary/20 text-primary-fg'
                                        : 'hover:bg-gray-100 dark:hover:bg-dark-surface/80'
                                        }`}
                                    title={`Smart Pause: ${smartPauseEnabled ? 'ON' : 'OFF'} (Click to toggle)`}
                                >
                                    <Zap className={`w-4 h-4 ${smartPauseEnabled ? 'fill-primary-fg text-primary-fg' : ''}`} />
                                </button>

                                {/* Subtle Divider */}
                                <div className="w-px h-4.5 bg-light-border dark:border-dark-border" />

                                {/* 3-Dots Settings Trigger */}
                                <button
                                    type="button"
                                    onClick={() => setShowSmartSettings(prev => !prev)}
                                    className={`h-9 w-6.5 flex items-center justify-center transition-colors cursor-pointer active:scale-[0.98] outline-none focus:outline-none ${smartPauseEnabled
                                        ? 'hover:bg-primary/20 text-primary-fg'
                                        : 'hover:bg-gray-100 dark:hover:bg-dark-surface/80'
                                        } ${showSmartSettings ? 'bg-primary/20 text-primary-fg' : ''}`}
                                    title="Smart Pause Settings"
                                >
                                    <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Smart Pause Settings Dropdown Popover */}
                            {showSmartSettings && (
                                <div className="absolute top-full right-0 mt-2 w-60 p-3 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl shadow-xl z-30 space-y-3 animate-fade-in text-xs">
                                    {/* Header */}
                                    <div className="flex items-center justify-between pb-2 border-b border-light-border dark:border-dark-border">
                                        <div className="flex items-center gap-1.5 font-medium text-light-text dark:text-dark-text">
                                            <Zap className="w-3.5 h-3.5 text-primary-fg" />
                                            <span>Smart Pause Settings</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowSmartSettings(false)}
                                            className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded cursor-pointer text-light-text-secondary dark:text-dark-text-secondary transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    {/* Delay Input Section */}
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary font-medium">
                                            Auto-resume delay
                                        </label>

                                        {/* Stepper + Direct Editable Input */}
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = Math.max(0.5, Number((smartPauseDelay - 0.5).toFixed(1)))
                                                    setSmartPauseDelay(next)
                                                    localStorage.setItem('tutin_smart_pause_delay', next.toString())
                                                }}
                                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface/80 cursor-pointer text-light-text dark:text-dark-text transition-colors"
                                                title="Decrease 0.5s"
                                            >
                                                <Minus className="w-3.5 h-3.5" />
                                            </button>

                                            <div className="flex-1 relative flex items-center">
                                                <input
                                                    type="number"
                                                    min="0.5"
                                                    max="30"
                                                    step="0.1"
                                                    value={smartPauseDelay}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value)
                                                        if (!isNaN(val) && val >= 0.1) {
                                                            setSmartPauseDelay(val)
                                                            localStorage.setItem('tutin_smart_pause_delay', val.toString())
                                                        }
                                                    }}
                                                    className="w-full h-8 px-2 pr-6 text-center font-mono font-medium text-xs bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg focus:outline-none focus:border-primary text-light-text dark:text-dark-text"
                                                    placeholder="2.5"
                                                />
                                                <span className="absolute right-2 text-[10px] text-light-text-secondary dark:text-dark-text-secondary pointer-events-none select-none">
                                                    s
                                                </span>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = Math.min(30, Number((smartPauseDelay + 0.5).toFixed(1)))
                                                    setSmartPauseDelay(next)
                                                    localStorage.setItem('tutin_smart_pause_delay', next.toString())
                                                }}
                                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface/80 cursor-pointer text-light-text dark:text-dark-text transition-colors"
                                                title="Increase 0.5s"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        {/* Quick Preset Chips */}
                                        <div className="grid grid-cols-4 gap-1 pt-1">
                                            {[1.5, 2.5, 4.0, 6.0].map((val) => (
                                                <button
                                                    key={val}
                                                    type="button"
                                                    onClick={() => {
                                                        setSmartPauseDelay(val)
                                                        localStorage.setItem('tutin_smart_pause_delay', val.toString())
                                                    }}
                                                    className={`py-1 rounded-md text-[11px] font-mono transition-colors cursor-pointer text-center ${smartPauseDelay === val
                                                        ? 'bg-primary text-primary-content font-semibold shadow-xs'
                                                        : 'bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-surface/80 text-light-text-secondary dark:text-dark-text-secondary'
                                                        }`}
                                                >
                                                    {val}s
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Rewind Toggle */}
                                    <div className="pt-2 border-t border-light-border dark:border-dark-border">
                                        <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                                            <div className="flex items-center gap-1.5">
                                                <RotateCcw className="w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary" />
                                                <span className="text-light-text dark:text-dark-text text-[11px]">Rewind 1.5s on resume</span>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={smartPauseRewind}
                                                onChange={(e) => {
                                                    setSmartPauseRewind(e.target.checked)
                                                    localStorage.setItem('tutin_smart_pause_rewind', e.target.checked ? 'true' : 'false')
                                                }}
                                                className="rounded border-light-border dark:border-dark-border text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer accent-primary"
                                            />
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* AI Assist: not-indexed micro-hint */}
                    {autocompleteEnabled && !transcriptStats.isIndexed && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-light-bg dark:bg-dark-bg/50 border border-dashed border-light-border dark:border-dark-border text-[11px] text-light-text-secondary dark:text-dark-text-secondary animate-fade-in">
                            <Sparkles className="w-3 h-3 shrink-0 text-primary-fg/60" />
                            <span>AI Assist is on &mdash; no transcript indexed for this video yet. Add a transcript to enable suggestions.</span>
                        </div>
                    )}

                    {/* Add Note Form */}
                    {showAddNote && !editingNote && (
                        <div className="rounded-xl border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface shadow-xs transition-all focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/50 overflow-hidden animate-fade-in">
                            {/* Header Bar */}
                            <div className="flex items-center justify-between px-3.5 py-2.5 bg-light-bg/50 dark:bg-dark-bg/40 border-b border-light-border dark:border-dark-border">
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary-fg font-mono text-xs font-semibold">
                                        <Clock className="w-3.5 h-3.5" />
                                        {formatDuration(noteTimestamp ?? currentTime)}
                                    </span>
                                    <span className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                        New Note
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    {autocompleteEnabled && transcriptStats.isIndexed && (
                                        <span
                                            className="hidden sm:inline-flex items-center gap-1 text-[10px] text-primary-fg/70 font-medium select-none"
                                            title={`AI Assist active — ${transcriptStats.totalTokens.toLocaleString()} words indexed. Press Tab to accept suggestions.`}
                                        >
                                            <Sparkles className="w-3 h-3 fill-primary-fg/70" />
                                            AI
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={cancelEdit}
                                        className="p-1 hover:bg-gray-200/70 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer text-light-text-secondary hover:text-light-text dark:text-dark-text-secondary dark:hover:text-dark-text"
                                        title="Close (Esc)"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <NoteEditor
                                key={editorKey}
                                content={noteContent}
                                onChange={setNoteContent}
                                onSubmit={handleAddNote}
                                onCancel={cancelEdit}
                                onCaptureScreenshot={onCaptureFrame}
                                onPlay={onPlay}
                                onPause={onPause}
                                getPlaybackState={getPlaybackState}
                                onSeek={onSeek}
                                currentTime={currentTime}
                                autocompleteEnabled={autocompleteEnabled}
                                smartPauseEnabled={smartPauseEnabled}
                                smartPauseDelay={smartPauseDelay}
                                smartPauseRewind={smartPauseRewind}
                                onSmartPauseChange={setSmartPauseState}
                                placeholder="Write your note... (paste or drop images, or capture screenshot)"
                                borderless
                            />

                            {/* Actions Footer */}
                            <div className="flex items-center justify-between px-3.5 py-2.5 bg-light-bg/30 dark:bg-dark-bg/30 border-t border-light-border dark:border-dark-border min-h-[46px]">
                                <div className="flex items-center">
                                    {smartPauseState?.isSmartPaused && (
                                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-primary/10 text-xs font-medium text-light-text dark:text-dark-text animate-fade-in">
                                            <Zap className="w-3.5 h-3.5 text-primary-fg fill-primary-fg" />

                                            {/* Reverse depletion rectangle bar */}
                                            <div className="relative w-16 sm:w-20 h-2 bg-primary/20 rounded-full overflow-hidden" title={smartPauseState.countdownSecs !== null ? `Resuming in ${smartPauseState.countdownSecs}s` : 'Resuming soon'}>
                                                <div
                                                    className="h-full bg-primary-fg rounded-full transition-all duration-100 ease-linear"
                                                    style={{
                                                        width: `${Math.min(100, Math.max(0, (((smartPauseState.countdownSecs ?? smartPauseDelay) / (smartPauseState.smartPauseDelay || smartPauseDelay)) * 100)))}%`
                                                    }}
                                                />
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => smartPauseState.resumePlaybackNow(false)}
                                                className="px-2 py-0.5 rounded bg-primary text-primary-content hover:bg-primary-hover text-[11px] font-medium transition-colors cursor-pointer"
                                                title="Resume video now"
                                            >
                                                Resume
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 ml-auto">
                                    <button
                                        type="button"
                                        onClick={cancelEdit}
                                        className="px-3 py-1.5 text-xs font-medium text-light-text-secondary hover:text-light-text dark:text-dark-text-secondary dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAddNote}
                                        className="px-3.5 py-1.5 text-xs bg-primary text-primary-content hover:bg-primary-hover font-medium rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Add Note</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notes List */}
                    {isLoading ? (
                        <div className="text-center py-4 text-light-text-secondary dark:text-dark-text-secondary text-sm">
                            Loading notes...
                        </div>
                    ) : notes.length === 0 ? (
                        <div className="text-center py-4 text-light-text-secondary dark:text-dark-text-secondary text-sm">
                            No notes yet. Add one above!
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {sortedNotes.map(note => (
                                <div
                                    key={note.id}
                                    className="p-3 bg-light-surface dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg group space-y-2"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <button
                                            type="button"
                                            onClick={() => onSeek?.(note.timestamp)}
                                            className="flex items-center gap-1 text-sm text-primary-fg hover:underline font-medium cursor-pointer"
                                            title={`Jump to ${formatDuration(note.timestamp)}`}
                                        >
                                            <Clock className="w-3.5 h-3.5" />
                                            {formatDuration(note.timestamp)}
                                        </button>

                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={() => copyNote(note.content)}
                                                className="p-1 hover:bg-gray-100 dark:hover:bg-dark-surface rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text cursor-pointer transition-colors"
                                                title="Copy note"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => startEditNote(note)}
                                                className="p-1 hover:bg-gray-100 dark:hover:bg-dark-surface rounded text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text cursor-pointer transition-colors"
                                                title="Edit note"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteNote(note.id)}
                                                className="p-1 hover:bg-gray-100 dark:hover:bg-dark-surface rounded text-danger cursor-pointer transition-colors"
                                                title="Delete note"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {editingNote?.id === note.id ? (
                                        <div className="mt-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface shadow-xs transition-all focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/50 overflow-hidden animate-fade-in">
                                            <div className="flex items-center justify-between px-3.5 py-2 bg-light-bg/50 dark:bg-dark-bg/40 border-b border-light-border dark:border-dark-border">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary-fg font-mono text-xs font-semibold">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        {formatDuration(note.timestamp)}
                                                    </span>
                                                    <span className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                                        Editing Note
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {autocompleteEnabled && transcriptStats.isIndexed && (
                                                        <span
                                                            className="hidden sm:inline-flex items-center gap-1 text-[10px] text-primary-fg/70 font-medium select-none"
                                                            title={`AI Assist active — ${transcriptStats.totalTokens.toLocaleString()} words indexed. Press Tab to accept suggestions.`}
                                                        >
                                                            <Sparkles className="w-3 h-3 fill-primary-fg/70" />
                                                            AI
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={cancelEdit}
                                                        className="p-1 hover:bg-gray-200/70 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer text-light-text-secondary hover:text-light-text dark:text-dark-text-secondary dark:hover:text-dark-text"
                                                        title="Close (Esc)"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            <NoteEditor
                                                key={editorKey}
                                                content={noteContent}
                                                onChange={setNoteContent}
                                                onSubmit={handleUpdateNote}
                                                onCancel={cancelEdit}
                                                onCaptureScreenshot={onCaptureFrame}
                                                onPlay={onPlay}
                                                onPause={onPause}
                                                getPlaybackState={getPlaybackState}
                                                onSeek={onSeek}
                                                currentTime={currentTime}
                                                autocompleteEnabled={autocompleteEnabled}
                                                smartPauseEnabled={smartPauseEnabled}
                                                smartPauseDelay={smartPauseDelay}
                                                smartPauseRewind={smartPauseRewind}
                                                onSmartPauseChange={setSmartPauseState}
                                                placeholder="Edit your note..."
                                                borderless
                                            />

                                            <div className="flex items-center justify-between px-3.5 py-2 bg-light-bg/30 dark:bg-dark-bg/30 border-t border-light-border dark:border-dark-border min-h-[46px]">
                                                <div className="flex items-center">
                                                    {smartPauseState?.isSmartPaused && (
                                                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-primary/10 text-xs font-medium text-light-text dark:text-dark-text animate-fade-in">
                                                            <Zap className="w-3.5 h-3.5 text-primary-fg fill-primary-fg" />

                                                            {/* Reverse depletion rectangle bar */}
                                                            <div className="relative w-16 sm:w-20 h-2 bg-primary/20 rounded-full overflow-hidden" title={smartPauseState.countdownSecs !== null ? `Resuming in ${smartPauseState.countdownSecs}s` : 'Resuming soon'}>
                                                                <div
                                                                    className="h-full bg-primary-fg rounded-full transition-all duration-100 ease-linear"
                                                                    style={{
                                                                        width: `${Math.min(100, Math.max(0, (((smartPauseState.countdownSecs ?? smartPauseDelay) / (smartPauseState.smartPauseDelay || smartPauseDelay)) * 100)))}%`
                                                                    }}
                                                                />
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => smartPauseState.resumePlaybackNow(false)}
                                                                className="px-2 py-0.5 rounded bg-primary text-primary-content hover:bg-primary-hover text-[11px] font-medium transition-colors cursor-pointer"
                                                                title="Resume video now"
                                                            >
                                                                Resume
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 ml-auto">
                                                    <button
                                                        type="button"
                                                        onClick={cancelEdit}
                                                        className="px-3 py-1.5 text-xs font-medium text-light-text-secondary hover:text-light-text dark:text-dark-text-secondary dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleUpdateNote}
                                                        className="px-3.5 py-1.5 text-xs bg-primary text-primary-content hover:bg-primary-hover font-medium rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                        <span>Save Changes</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className="note-content text-sm select-text"
                                            title="Click on any screenshot to view full size"
                                            dir="auto"
                                            onClick={(e) => {
                                                if (e.target.tagName === 'IMG' && e.target.src) {
                                                    e.stopPropagation()
                                                    setPreviewImage({
                                                        src: e.target.src,
                                                        timestamp: note.timestamp,
                                                        videoTitle: video.title
                                                    })
                                                }
                                            }}
                                            dangerouslySetInnerHTML={{ __html: note.content }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

            {/* Fullscreen Screenshot Lightbox Modal */}
            {previewImage && (
                <div
                    className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fade-in"
                    onClick={() => setPreviewImage(null)}
                >
                    <div
                        className="relative max-w-5xl w-full max-h-[90vh] bg-dark-surface/95 rounded-xl overflow-hidden shadow-2xl border border-white/15 flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Lightbox Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-white/5 backdrop-blur-md text-white border-b border-white/10">
                            <div className="flex items-center gap-2 text-sm font-medium min-w-0">
                                <Camera className="w-4 h-4 text-primary-fg flex-shrink-0" />
                                <span className="truncate max-w-[300px] sm:max-w-md">{previewImage.videoTitle || 'Screenshot Preview'}</span>
                                {previewImage.timestamp !== undefined && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/15 text-white/90 flex-shrink-0 font-mono">
                                        {formatDuration(previewImage.timestamp)}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <a
                                    href={previewImage.src}
                                    download={`screenshot_${formatDuration(previewImage.timestamp || 0).replace(':', '_')}.jpg`}
                                    className="p-1.5 hover:bg-white/15 rounded-lg text-white transition-colors cursor-pointer"
                                    title="Download screenshot"
                                >
                                    <Download className="w-4 h-4" />
                                </a>
                                <button
                                    type="button"
                                    onClick={() => setPreviewImage(null)}
                                    className="p-1.5 hover:bg-white/15 rounded-lg text-white transition-colors cursor-pointer"
                                    title="Close (Esc)"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Lightbox Image Preview */}
                        <div className="flex-1 overflow-auto flex items-center justify-center p-3 bg-black/60 min-h-[200px]">
                            <img
                                src={previewImage.src}
                                alt="Screenshot preview"
                                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export { NoteEditor }
export default NotesPanel
