import { useState, useEffect, useRef, useCallback } from 'react'
import {
    ChevronDown, ChevronUp, Plus, Pencil, Trash2,
    Clock, Copy, Download, Bold, Italic, Strikethrough,
    List, ImagePlus, X
} from 'lucide-react'
import {
    addNote, getNotesByVideo, updateNote, deleteNote, formatDuration
} from '../../utils/db'
import { useNotification } from '../../contexts/NotificationContext'

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

function RichTextToolbar({ onImageInsert }) {
    const fileInputRef = useRef(null)
    const { showNotification } = useNotification()

    const toolbarBtn = (onClick, title, Icon, isActive) => (
        <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onClick() }}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors ${isActive ? 'bg-gray-200 dark:bg-white/15 text-primary' : 'text-light-text-secondary dark:text-dark-text-secondary'}`}
            title={title}
        >
            <Icon className="w-4 h-4" />
        </button>
    )

    async function handleFileSelect(e) {
        const file = e.target.files?.[0]
        if (!file || !file.type.startsWith('image/')) return
        try {
            const dataUrl = await resizeImage(file)
            onImageInsert(dataUrl)
        } catch (err) {
            console.error('Failed to process image:', err)
            showNotification(err.message || 'Failed to process image', 'error')
        }
        e.target.value = ''
    }

    return (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-light-border dark:border-dark-border bg-gray-50 dark:bg-dark-bg/50 rounded-t-lg">
            {toolbarBtn(() => execCommand('bold'), 'Bold (Ctrl+B)', Bold)}
            {toolbarBtn(() => execCommand('italic'), 'Italic (Ctrl+I)', Italic)}
            {toolbarBtn(() => execCommand('strikeThrough'), 'Strikethrough', Strikethrough)}
            <div className="w-px h-5 bg-light-border dark:bg-dark-border mx-1" />
            {toolbarBtn(() => execCommand('insertUnorderedList'), 'Bullet List', List)}
            <div className="w-px h-5 bg-light-border dark:bg-dark-border mx-1" />
            {toolbarBtn(() => fileInputRef.current?.click(), 'Add Image', ImagePlus)}
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

function NoteEditor({ content, onChange, onImageInsert, placeholder = 'Write your note...' }) {
    const editorRef = useRef(null)
    const isInitializedRef = useRef(false)

    // Set initial content once
    useEffect(() => {
        if (editorRef.current && !isInitializedRef.current) {
            editorRef.current.innerHTML = content || ''
            isInitializedRef.current = true
        }
    }, [])

    // Reset when content changes externally (e.g. editing a different note)
    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.innerHTML = content || ''
        }
    }, [content])

    const handleInput = useCallback(() => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML)
        }
    }, [onChange])

    function handleImageInsert(dataUrl) {
        if (!editorRef.current) return
        editorRef.current.focus()
        execCommand('insertImage', dataUrl)
        handleInput()
    }

    async function handlePaste(e) {
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

    return (
        <div className="border border-light-border dark:border-dark-border rounded-lg overflow-hidden">
            <RichTextToolbar onImageInsert={handleImageInsert} />
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onPaste={handlePaste}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="note-editor w-full min-h-[80px] max-h-[300px] overflow-y-auto px-3 py-2 bg-white dark:bg-dark-surface text-sm focus:outline-none"
                data-placeholder={placeholder}
            />
        </div>
    )
}

function NotesPanel({
    video,
    courseId,
    currentTime = 0,
    onSeek,
    isCollapsed: initialCollapsed = false,
    hideHeader = false
}) {
    const [notes, setNotes] = useState([])
    const [isCollapsed, setIsCollapsed] = useState(initialCollapsed)
    const [isLoading, setIsLoading] = useState(true)
    const [showAddNote, setShowAddNote] = useState(false)
    const [editingNote, setEditingNote] = useState(null)
    const [noteContent, setNoteContent] = useState('')
    const [noteTimestamp, setNoteTimestamp] = useState(null)
    const [editorKey, setEditorKey] = useState(0)

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
        <div className={`bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg overflow-hidden ${hideHeader ? 'border-0' : ''}`}>
            {/* Header */}
            {!hideHeader && (
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-light-surface dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <span className="font-medium">Notes</span>
                        {notes.length > 0 && (
                            <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                                {notes.length}
                            </span>
                        )}
                    </div>
                    {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
            )}

            {/* Content */}
            {!isCollapsed && (
                <div className="p-4 space-y-4">
                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => {
                                setShowAddNote(true);
                                setEditingNote(null);
                                setNoteContent('');
                                setNoteTimestamp(currentTime);
                                setEditorKey(k => k + 1);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-content hover:bg-primary-hover rounded-lg hover:bg-gray-800 dark:hover:bg-white/20 transition-colors text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Add Note at {formatDuration(currentTime)}
                        </button>

                        {notes.length > 0 && (
                            <button
                                onClick={exportNotes}
                                className="flex items-center gap-2 px-3 py-1.5 border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg transition-colors text-sm ml-auto"
                                title="Export notes as Markdown"
                            >
                                <Download className="w-4 h-4" />
                                Export
                            </button>
                        )}
                    </div>

                    {/* Add Note Form */}
                    {showAddNote && !editingNote && (
                        <div className="p-3 bg-light-surface dark:bg-dark-bg rounded-lg space-y-3 animate-fade-in">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                    <Clock className="w-4 h-4" />
                                    New note at {formatDuration(noteTimestamp ?? currentTime)}
                                </div>
                                <button
                                    onClick={cancelEdit}
                                    className="p-1 hover:bg-gray-200 dark:hover:bg-dark-surface rounded transition-colors"
                                    title="Close"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <NoteEditor
                                key={editorKey}
                                content=""
                                onChange={setNoteContent}
                                placeholder="Write your note... (paste or drag images here)"
                            />

                            {/* Actions */}
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={cancelEdit}
                                    className="px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-dark-surface rounded"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddNote}
                                    className="px-3 py-1.5 text-sm bg-primary text-primary-content hover:bg-primary-hover rounded-lg hover:bg-gray-800 dark:hover:bg-white/20 disabled:opacity-50"
                                >
                                    Add Note
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Notes List */}
                    {isLoading ? (
                        <div className="text-center py-4 text-light-text-secondary dark:text-dark-text-secondary">
                            Loading notes...
                        </div>
                    ) : notes.length === 0 ? (
                        <div className="text-center py-4 text-light-text-secondary dark:text-dark-text-secondary">
                            No notes yet. Add one above!
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {notes.map(note => (
                                <div
                                    key={note.id}
                                    className="p-3 bg-light-surface dark:bg-dark-bg rounded-lg group"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <button
                                            onClick={() => onSeek?.(note.timestamp)}
                                            className="flex items-center gap-1 text-sm text-primary-fg hover:underline"
                                        >
                                            <Clock className="w-3 h-3" />
                                            {formatDuration(note.timestamp)}
                                        </button>

                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => copyNote(note.content)}
                                                className="p-1 hover:bg-gray-100 dark:hover:bg-dark-surface rounded"
                                                title="Copy note"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => startEditNote(note)}
                                                className="p-1 hover:bg-gray-100 dark:hover:bg-dark-surface rounded"
                                                title="Edit note"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteNote(note.id)}
                                                className="p-1 hover:bg-gray-100 dark:hover:bg-dark-surface rounded text-danger"
                                                title="Delete note"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {editingNote?.id === note.id ? (
                                        <div className="mt-3 space-y-3 animate-fade-in">
                                            <NoteEditor
                                                key={editorKey}
                                                content={noteContent}
                                                onChange={setNoteContent}
                                                placeholder="Edit your note..."
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={cancelEdit}
                                                    className="px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-dark-surface rounded"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleUpdateNote}
                                                    className="px-3 py-1.5 text-sm bg-primary text-primary-content hover:bg-primary-hover rounded-lg hover:bg-gray-800 dark:hover:bg-white/20 disabled:opacity-50"
                                                >
                                                    Save Changes
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className="note-content mt-2 text-sm"
                                            dangerouslySetInnerHTML={{ __html: note.content }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default NotesPanel
