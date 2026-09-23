import { useState, useRef, useEffect, memo } from 'react'
import { Link } from 'react-router-dom'
import {
    Play, Clock, Pencil, Trash2, Check, X,
    Maximize2, Minimize2, Image as ImageIcon,
    Folder, ChevronDown, ChevronRight, Palette,
    FileText, ExternalLink, Sparkles, Link2
} from 'lucide-react'
import { NoteEditor } from '../player/NotesPanel'
import { formatDuration } from '../../utils/db'

const COLOR_OPTIONS = [
    { name: 'Default', value: '', class: 'border-light-border dark:border-dark-border', groupBg: 'bg-neutral-500/[0.04] dark:bg-white/[0.03] border-neutral-300/70 dark:border-neutral-600/60' },
    { name: 'Blue', value: 'blue', class: 'border-blue-500/50 bg-blue-50/20 dark:bg-blue-950/20', groupBg: 'bg-blue-500/[0.06] border-blue-400/60 dark:border-blue-500/50' },
    { name: 'Emerald', value: 'emerald', class: 'border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/20', groupBg: 'bg-emerald-500/[0.06] border-emerald-400/60 dark:border-emerald-500/50' },
    { name: 'Amber', value: 'amber', class: 'border-amber-500/50 bg-amber-50/20 dark:bg-amber-950/20', groupBg: 'bg-amber-500/[0.06] border-amber-400/60 dark:border-amber-500/50' },
    { name: 'Purple', value: 'purple', class: 'border-purple-500/50 bg-purple-50/20 dark:bg-purple-950/20', groupBg: 'bg-purple-500/[0.06] border-purple-400/60 dark:border-purple-500/50' },
    { name: 'Rose', value: 'rose', class: 'border-rose-500/50 bg-rose-50/20 dark:bg-rose-950/20', groupBg: 'bg-rose-500/[0.06] border-rose-400/60 dark:border-rose-500/50' }
]

function CanvasNode({
    node,
    courseId,
    isSelected = false,
    isConnecting = false,
    onSelect,
    onDragStart,
    onStartConnect,
    onEndConnect,
    onUpdateNode,
    onDeleteNode,
    onImagePreview
}) {
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState(node.content || '')
    const [editTitle, setEditTitle] = useState(node.title || '')
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [showColorPicker, setShowColorPicker] = useState(false)
    const [isShrunk, setIsShrunk] = useState(false)
    const nodeRef = useRef(null)
    const colorPickerRef = useRef(null)

    // Sync content when node updates from outside
    useEffect(() => {
        if (!isEditing) {
            setEditContent(node.content || '')
        }
    }, [node.content, isEditing])

    // Close color picker on click outside
    useEffect(() => {
        function handleClickOutside(e) {
            if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
                setShowColorPicker(false)
            }
        }
        if (showColorPicker) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [showColorPicker])

    function handleSaveEdit() {
        onUpdateNode?.(node.id, {
            content: editContent,
            title: editTitle
        })
        setIsEditing(false)
        setIsEditingTitle(false)
    }

    function handleCancelEdit() {
        setEditContent(node.content || '')
        setEditTitle(node.title || '')
        setIsEditing(false)
        setIsEditingTitle(false)
    }

    function handleDoubleClickEdge(e) {
        if (e.target.closest('.note-editor') || e.target.closest('button') || e.target.closest('input')) {
            return
        }
        e.stopPropagation()
        const nextShrunk = !isShrunk
        setIsShrunk(nextShrunk)
        const targetWidth = nextShrunk ? 240 : 320
        onUpdateNode?.(node.id, { width: targetWidth })
    }

    // Group corner resize handler
    function handleGroupResizeStart(e) {
        e.stopPropagation()
        e.preventDefault()
        const startX = e.clientX
        const startY = e.clientY
        const startW = node.width || 480
        const startH = node.height || 320

        function onMouseMove(moveEvt) {
            const dw = moveEvt.clientX - startX
            const dh = moveEvt.clientY - startY
            const nextW = Math.max(260, startW + dw)
            const nextH = Math.max(160, startH + dh)
            onUpdateNode?.(node.id, { width: nextW, height: nextH })
        }

        function onMouseUp() {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    const isGroup = node.type === 'group'
    const isImage = node.type === 'image'
    const isVideoNote = Boolean(node.noteId)

    // Compute color styles
    const activeColor = COLOR_OPTIONS.find(c => c.value === node.color) || COLOR_OPTIONS[0]
    const cardWidth = node.width || (isGroup ? 480 : 320)

    // Ports renderer
    const renderPorts = () => {
        if (isGroup) return null
        const baseClass = 'absolute w-4 h-4 rounded-full bg-blue-500 hover:bg-blue-400 border-2 border-white dark:border-dark-bg transition-all duration-150 z-30 cursor-crosshair flex items-center justify-center shadow-md opacity-40 group-hover/card:opacity-100 hover:scale-125'
        return (
            <>
                {/* Top Port */}
                <button type="button" onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onStartConnect?.(node.id) }}
                    className={`${baseClass} -top-2 left-1/2 -translate-x-1/2`} title="Connect arrow from top">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                </button>
                {/* Right Port */}
                <button type="button" onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onStartConnect?.(node.id) }}
                    className={`${baseClass} top-1/2 -right-2 -translate-y-1/2`} title="Connect arrow from right">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                </button>
                {/* Bottom Port */}
                <button type="button" onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onStartConnect?.(node.id) }}
                    className={`${baseClass} -bottom-2 left-1/2 -translate-x-1/2`} title="Connect arrow from bottom">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                </button>
                {/* Left Port */}
                <button type="button" onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onStartConnect?.(node.id) }}
                    className={`${baseClass} top-1/2 -left-2 -translate-y-1/2`} title="Connect arrow from left">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                </button>
            </>
        )
    }

    // ============================================
    // GROUP NODE — Obsidian-style: transparent container, floating label, dashed border
    // ============================================
    if (isGroup) {
        const groupFill = isSelected
            ? 'bg-primary/[0.08] border-primary ring-2 ring-primary/25'
            : (activeColor.groupBg || 'bg-neutral-500/[0.04] dark:bg-white/[0.03] border-neutral-300/70 dark:border-neutral-600/60')

        return (
            <div
                ref={nodeRef}
                style={{
                    transform: `translate(${node.x}px, ${node.y}px)`,
                    width: `${cardWidth}px`,
                    height: `${node.height || 320}px`,
                    zIndex: isSelected ? 4 : 1
                }}
                className={`absolute top-0 left-0 rounded-2xl border-2 border-dashed ${groupFill} transition-colors duration-150 select-none group/card pointer-events-auto`}
                onClick={(e) => { e.stopPropagation(); onSelect?.(node.id) }}
                onDoubleClick={handleDoubleClickEdge}
            >
                {/* Floating label above the top-left corner */}
                <div
                    onMouseDown={(e) => onDragStart?.(e, node.id)}
                    className="absolute -top-7 left-2 flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none"
                >
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold
                        ${ isSelected
                            ? 'bg-primary/20 text-primary border border-primary/40'
                            : 'bg-neutral-200/90 dark:bg-neutral-800/95 text-neutral-700 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700'
                        } shadow-sm backdrop-blur-sm`}
                    >
                        <Folder className="w-3.5 h-3.5 shrink-0 text-primary-fg" />
                        {isEditingTitle ? (
                            <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                                onBlur={handleSaveEdit}
                                autoFocus
                                className="px-1 py-0 text-xs font-semibold rounded bg-white dark:bg-dark-bg border border-primary outline-none w-32"
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <span
                                className="max-w-[200px] truncate cursor-text"
                                onDoubleClick={(e) => { e.stopPropagation(); setIsEditingTitle(true) }}
                                title={node.title || 'Group'}
                            >
                                {node.title || 'Group Container'}
                            </span>
                        )}

                        {/* Color Picker for Group */}
                        <div className="relative" ref={colorPickerRef}>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setShowColorPicker(!showColorPicker)
                                }}
                                className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded"
                                title="Group color"
                            >
                                <Palette className="w-3 h-3" />
                            </button>
                            {showColorPicker && (
                                <div
                                    className="absolute left-0 top-full mt-1 p-1 bg-white dark:bg-dark-surface rounded-lg shadow-xl border border-light-border dark:border-dark-border z-30 flex items-center gap-1 animate-scale-in"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {COLOR_OPTIONS.map((c) => (
                                        <button
                                            key={c.value}
                                            type="button"
                                            onClick={() => {
                                                onUpdateNode?.(node.id, { color: c.value })
                                                setShowColorPicker(false)
                                            }}
                                            className={`w-4 h-4 rounded-full border ${
                                                c.value === '' ? 'bg-neutral-300 dark:bg-neutral-600' :
                                                c.value === 'blue' ? 'bg-blue-500' :
                                                c.value === 'emerald' ? 'bg-emerald-500' :
                                                c.value === 'amber' ? 'bg-amber-500' :
                                                c.value === 'purple' ? 'bg-purple-500' : 'bg-rose-500'
                                            }`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onDeleteNode?.(node.id) }}
                            className="ml-1 p-0.5 text-neutral-400 hover:text-red-500 rounded transition-colors"
                            title="Remove group container"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* Drag handle: full-surface background */}
                <div
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) onDragStart?.(e, node.id)
                    }}
                    className="absolute inset-0 rounded-2xl cursor-grab active:cursor-grabbing"
                />

                {/* Bottom-Right Corner Resize Handle */}
                <div
                    onMouseDown={handleGroupResizeStart}
                    className="absolute bottom-1.5 right-1.5 w-4 h-4 rounded cursor-se-resize flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity text-neutral-400 hover:text-primary z-20"
                    title="Drag to resize group container"
                >
                    <svg className="w-3 h-3" viewBox="0 0 10 10" fill="currentColor">
                        <path d="M 8 8 L 8 2 L 6 4 L 4 2 L 2 4 L 4 6 L 2 8 Z" />
                    </svg>
                </div>
            </div>
        )
    }

    // ============================================
    // IMAGE NODE
    // ============================================
    if (isImage) {
        return (
            <div
                ref={nodeRef}
                style={{
                    transform: `translate(${node.x}px, ${node.y}px)`,
                    width: `${cardWidth}px`
                }}
                className={`absolute top-0 left-0 rounded-xl bg-white dark:bg-dark-surface border ${
                    isSelected ? 'border-primary ring-2 ring-primary/25 shadow-2xl z-20' : 'border-light-border dark:border-dark-border shadow-md'
                } overflow-hidden transition-all duration-150 group/card pointer-events-auto`}
                onClick={(e) => {
                    e.stopPropagation()
                    onSelect?.(node.id)
                }}
                onDoubleClick={handleDoubleClickEdge}
            >
                {/* Header */}
                <div
                    onMouseDown={(e) => onDragStart?.(e, node.id)}
                    className="px-3 py-2 bg-light-surface/80 dark:bg-dark-bg/80 flex items-center justify-between border-b border-light-border dark:border-dark-border cursor-grab active:cursor-grabbing select-none"
                >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 truncate">
                        <ImageIcon className="w-3.5 h-3.5 text-primary-fg" />
                        <span className="truncate">{node.title || 'Image'}</span>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                onStartConnect?.(node.id)
                            }}
                            className="p-1 text-neutral-400 hover:text-blue-500 rounded transition-colors"
                            title="Draw connection arrow to another card"
                        >
                            <Link2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                onDeleteNode?.(node.id)
                            }}
                            className="p-1 text-neutral-400 hover:text-red-500 rounded transition-colors"
                            title="Delete image card"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Image Display */}
                <div className="p-2 bg-neutral-900/5 dark:bg-black/30 flex items-center justify-center">
                    {node.content ? (
                        <img
                            src={node.content}
                            alt={node.title || 'Canvas Image'}
                            className="max-h-[300px] w-full object-contain rounded cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => onImagePreview?.(node.content)}
                        />
                    ) : (
                        <div className="py-8 text-neutral-400 text-xs flex flex-col items-center gap-1">
                            <ImageIcon className="w-6 h-6 opacity-40" />
                            <span>No image data</span>
                        </div>
                    )}
                </div>

                {renderPorts()}
            </div>
        )
    }

    // ============================================
    // NOTE NODE (VIDEO NOTE OR STANDALONE)
    // ============================================
    return (
        <div
            ref={nodeRef}
            style={{
                transform: `translate(${node.x}px, ${node.y}px)`,
                width: `${cardWidth}px`
            }}
            className={`absolute top-0 left-0 rounded-2xl bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md border ${
                isSelected
                    ? 'border-primary ring-2 ring-primary/30 shadow-2xl z-20'
                    : `${activeColor.class} shadow-lg hover:shadow-xl`
            } overflow-hidden transition-all duration-150 group/card pointer-events-auto`}
            onClick={(e) => {
                e.stopPropagation()
                onSelect?.(node.id)
            }}
            onDoubleClick={handleDoubleClickEdge}
        >
            {/* Color Accent Bar on Top */}
            {node.color && (
                <div
                    className={`h-1.5 w-full ${
                        node.color === 'blue' ? 'bg-blue-500' :
                        node.color === 'emerald' ? 'bg-emerald-500' :
                        node.color === 'amber' ? 'bg-amber-500' :
                        node.color === 'purple' ? 'bg-purple-500' :
                        node.color === 'rose' ? 'bg-rose-500' : 'bg-primary'
                    }`}
                />
            )}

            {/* Card Header Bar (Draggable) */}
            <div
                onMouseDown={(e) => onDragStart?.(e, node.id)}
                className="px-3 py-2.5 bg-neutral-100/70 dark:bg-neutral-800/60 border-b border-light-border dark:border-dark-border flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
            >
                {/* Left metadata info */}
                <div className="flex items-center gap-1.5 min-w-0 pr-2">
                    {isVideoNote ? (
                        <>
                            {/* Play video timestamp button */}
                            {node.timestamp !== null && node.timestamp !== undefined ? (
                                <Link
                                    to={`/course/${courseId}?v=${node.videoId}&t=${node.timestamp}`}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-medium rounded transition-colors shrink-0"
                                    title={`Play video at ${formatDuration(node.timestamp)}`}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Play className="w-2.5 h-2.5 fill-current" />
                                    <span>{formatDuration(node.timestamp)}</span>
                                </Link>
                            ) : (
                                <span className="p-1 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                                    <FileText className="w-3 h-3" />
                                </span>
                            )}
                            <span
                                className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate"
                                title={node.videoTitle || 'Video Note'}
                            >
                                {node.videoTitle || 'Video Note'}
                            </span>
                        </>
                    ) : (
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="p-1 rounded bg-amber-500/10 text-amber-500 dark:text-amber-400">
                                <Sparkles className="w-3 h-3" />
                            </span>
                            {isEditingTitle ? (
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                                    onBlur={handleSaveEdit}
                                    autoFocus
                                    className="px-1.5 py-0.5 text-xs font-medium rounded bg-white dark:bg-dark-bg border border-primary outline-none"
                                />
                            ) : (
                                <span
                                    className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate cursor-text"
                                    onDoubleClick={(e) => {
                                        e.stopPropagation()
                                        setIsEditingTitle(true)
                                    }}
                                    title={node.title || 'Course Note'}
                                >
                                    {node.title || 'Course Note'}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Right action icons */}
                <div className="flex items-center gap-1 shrink-0">
                    {/* Color picker toggle */}
                    <div className="relative" ref={colorPickerRef}>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                setShowColorPicker(!showColorPicker)
                            }}
                            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded transition-colors"
                            title="Card accent color"
                        >
                            <Palette className="w-3.5 h-3.5" />
                        </button>

                        {showColorPicker && (
                            <div
                                className="absolute right-0 top-full mt-1.5 p-1.5 bg-white dark:bg-dark-surface rounded-xl shadow-2xl border border-light-border dark:border-dark-border z-30 flex items-center gap-1 animate-scale-in"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {COLOR_OPTIONS.map((c) => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => {
                                            onUpdateNode?.(node.id, { color: c.value })
                                            setShowColorPicker(false)
                                        }}
                                        className={`w-5 h-5 rounded-full border transition-transform hover:scale-115 ${
                                            c.value === '' ? 'bg-neutral-300 dark:bg-neutral-600' :
                                            c.value === 'blue' ? 'bg-blue-500' :
                                            c.value === 'emerald' ? 'bg-emerald-500' :
                                            c.value === 'amber' ? 'bg-amber-500' :
                                            c.value === 'purple' ? 'bg-purple-500' : 'bg-rose-500'
                                        } ${node.color === c.value ? 'ring-2 ring-primary ring-offset-1 dark:ring-offset-dark-surface' : ''}`}
                                        title={c.name}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Connect Arrow button */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            onStartConnect?.(node.id)
                        }}
                        className="p-1 text-neutral-400 hover:text-blue-500 rounded transition-colors"
                        title="Draw connection arrow to another card"
                    >
                        <Link2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Edit button */}
                    {!isEditing ? (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                setIsEditing(true)
                            }}
                            className="p-1 text-neutral-400 hover:text-primary-fg rounded transition-colors"
                            title="Edit note (or double-click content)"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleSaveEdit()
                                }}
                                className="p-1 text-emerald-500 hover:text-emerald-600 rounded transition-colors font-semibold"
                                title="Save changes (Ctrl+Enter)"
                            >
                                <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleCancelEdit()
                                }}
                                className="p-1 text-neutral-400 hover:text-neutral-600 rounded transition-colors"
                                title="Cancel edit"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}

                    {/* Delete button */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            onDeleteNode?.(node.id)
                        }}
                        className="p-1 text-neutral-400 hover:text-red-500 rounded transition-colors"
                        title={isVideoNote ? "Remove card from canvas (note remains in course)" : "Delete course note"}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Note Content Area */}
            <div
                className="p-3.5 min-h-[70px] max-h-[400px] overflow-y-auto"
                onDoubleClick={(e) => {
                    e.stopPropagation()
                    if (!isEditing) setIsEditing(true)
                }}
            >
                {isEditing ? (
                    <div className="space-y-2">
                        <NoteEditor
                            content={editContent}
                            onChange={setEditContent}
                            onSubmit={handleSaveEdit}
                            onCancel={handleCancelEdit}
                            placeholder="Write note with # headings, - bullets, `code`, images..."
                            borderless={true}
                        />
                        <div className="flex items-center justify-between pt-2 border-t border-light-border dark:border-dark-border text-[11px] text-neutral-500">
                            <span>Markdown shortcuts supported</span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="px-2 py-1 rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveEdit}
                                    className="px-2.5 py-1 rounded bg-primary text-white hover:bg-primary-hover font-medium transition-colors"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="note-content text-sm text-neutral-800 dark:text-neutral-200 select-text">
                        {node.content ? (
                            <div
                                dangerouslySetInnerHTML={{ __html: node.content }}
                                onClick={(e) => {
                                    if (e.target.tagName === 'IMG') {
                                        onImagePreview?.(e.target.src)
                                    }
                                }}
                            />
                        ) : (
                            <p className="text-neutral-400 italic text-xs">
                                Double-click to write notes...
                            </p>
                        )}
                    </div>
                )}
            </div>

            {renderPorts()}
        </div>
    )
}

export default memo(CanvasNode)
