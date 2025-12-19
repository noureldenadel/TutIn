import { useState, useEffect } from 'react'
import {
    ChevronDown, ChevronUp, Plus, Pencil, Trash2,
    Clock, Copy, Download
} from 'lucide-react'
import {
    addNote, getNotesByVideo, updateNote, deleteNote, formatDuration
} from '../../utils/db'

function NotesPanel({
    video,
    courseId,
    currentTime = 0,
    onSeek,
    isCollapsed: initialCollapsed = false
}) {
    const [notes, setNotes] = useState([])
    const [isCollapsed, setIsCollapsed] = useState(initialCollapsed)
    const [isLoading, setIsLoading] = useState(true)
    const [showAddNote, setShowAddNote] = useState(false)
    const [editingNote, setEditingNote] = useState(null)
    const [noteContent, setNoteContent] = useState('')

    // Load notes when video changes
    useEffect(() => {
        if (video?.id) {
            loadNotes()
        } else {
            setNotes([])
            setIsLoading(false)
        }
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
        if (!noteContent.trim()) return

        try {
            await addNote({
                videoId: video.id,
                courseId,
                timestamp: currentTime,
                content: noteContent.trim()
            })
            setNoteContent('')
            setShowAddNote(false)
            await loadNotes()
        } catch (err) {
            console.error('Failed to add note:', err)
        }
    }

    async function handleUpdateNote() {
        if (!editingNote || !noteContent.trim()) return

        try {
            await updateNote(editingNote.id, {
                content: noteContent.trim()
            })
            setNoteContent('')
            setEditingNote(null)
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
    }

    function cancelEdit() {
        setEditingNote(null)
        setNoteContent('')
        setShowAddNote(false)
    }

    function copyNote(content) {
        navigator.clipboard.writeText(content)
    }

    function exportNotes() {
        const markdown = notes.map(note => {
            const time = formatDuration(note.timestamp)
            return `## ${time}\n${note.content}\n`
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
        <div className="bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg overflow-hidden">
            {/* Header */}
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

            {/* Content */}
            {!isCollapsed && (
                <div className="p-4 space-y-4">
                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => { setShowAddNote(true); setEditingNote(null) }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm"
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

                    {/* Add/Edit Note Form */}
                    {(showAddNote || editingNote) && (
                        <div className="p-3 bg-light-surface dark:bg-dark-bg rounded-lg space-y-3">
                            <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                <Clock className="w-4 h-4" />
                                {editingNote
                                    ? `Editing note at ${formatDuration(editingNote.timestamp)}`
                                    : `New note at ${formatDuration(currentTime)}`
                                }
                            </div>

                            <textarea
                                value={noteContent}
                                onChange={(e) => setNoteContent(e.target.value)}
                                placeholder="Write your note..."
                                rows={3}
                                className="w-full px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface resize-none"
                                autoFocus
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
                                    onClick={editingNote ? handleUpdateNote : handleAddNote}
                                    disabled={!noteContent.trim()}
                                    className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {editingNote ? 'Save Changes' : 'Add Note'}
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
                                            className="flex items-center gap-1 text-sm text-primary hover:underline"
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

                                    <p className="mt-2 text-sm whitespace-pre-wrap">{note.content}</p>
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
