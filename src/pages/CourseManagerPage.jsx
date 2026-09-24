import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, CheckSquare, Settings, Play, Pause, Save, Trash2, Globe, Headphones, Type, AlertTriangle, X, CheckCircle2, Circle } from 'lucide-react'
import { getCourse, getModulesByCourse, getVideosByCourse, updateVideo, deleteVideo, buildModuleTree, formatDuration } from '../utils/db'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { JobSetupModal } from '../components/player/JobSetupModal'
import { SERVER_URL } from '../utils/api'
import FloatingMiniPlayer from '../components/player/FloatingMiniPlayer'
import CourseManagerVideoRow from '../components/player/CourseManagerVideoRow'
import { useJobs } from '../contexts/JobsContext'

function CourseManagerPage() {
    const { courseId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const [course, setCourse] = useState(null)
    const [modules, setModules] = useState([])
    const [videos, setVideos] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [selectedVideoIds, setSelectedVideoIds] = useState(new Set())
    const [activeVideoId, setActiveVideoId] = useState(null)
    
    // Jobs & Modals
    const { activeJobs, setActiveJobs, cancelJob } = useJobs()
    const [jobSetup, setJobSetup] = useState(null) // null or { type: 'dub' | 'translate' }
    
    const selectedVideosList = videos.filter(v => selectedVideoIds.has(v.id))

    useEffect(() => {
        loadData()
    }, [courseId])

    async function loadData() {
        setIsLoading(true)
        try {
            const courseData = await getCourse(courseId)
            const mods = await getModulesByCourse(courseId)
            const vids = await getVideosByCourse(courseId)

            setCourse(courseData)
            setVideos(vids)
            
            // Build tree
            const tree = buildModuleTree(mods)
            // Attach videos
            function attachVideos(mod) {
                mod.videos = vids.filter(v => v.moduleId === mod.id).sort((a, b) => a.order - b.order)
                if (mod.subModules) {
                    mod.subModules.forEach(attachVideos)
                }
            }
            tree.forEach(attachVideos)
            setModules(tree)

            // Set initial active video from navigation state, or fallback to first video
            setVideos(currentVids => {
                const navVideoId = location.state?.currentVideoId
                if (navVideoId && currentVids.find(v => v.id === navVideoId)) {
                    setActiveVideoId(navVideoId)
                } else if (currentVids.length > 0) {
                    setActiveVideoId(currentVids[0].id)
                }
                return currentVids
            })

        } catch (err) {
            console.error('Failed to load course data:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSelectAll = () => {
        if (selectedVideoIds.size === videos.length) {
            setSelectedVideoIds(new Set())
        } else {
            setSelectedVideoIds(new Set(videos.map(v => v.id)))
        }
    }

    const toggleVideoSelection = (id) => {
        const newSet = new Set(selectedVideoIds)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedVideoIds(newSet)
    }

    // Get all unique subtitle sources from all videos
    const allAvailableSources = new Set()
    videos.forEach(v => {
        (v.subtitleSources || v.subtitleFiles || []).forEach(s => {
            allAvailableSources.add(`${s.lang}:${s.origin}`)
        })
    })
    const uniqueSources = Array.from(allAvailableSources).sort()

    const handlePrimaryTranscriptChange = async (videoId, newValue) => {
        try {
            await updateVideo(videoId, { primaryTranscript: newValue || null })
            setVideos(prev => prev.map(v => v.id === videoId ? { ...v, primaryTranscript: newValue } : v))
            setModules(prev => prev.map(m => {
                if (m.videos) {
                    m.videos = m.videos.map(v => v.id === videoId ? { ...v, primaryTranscript: newValue } : v)
                }
                return m
            }))
        } catch (err) {
            console.error('Failed to update primary transcript:', err)
        }
    }

    const handleBulkPrimaryTranscriptChange = async (newValue) => {
        if (selectedVideoIds.size === 0) return
        for (const videoId of selectedVideoIds) {
            await handlePrimaryTranscriptChange(videoId, newValue)
        }
    }

    // Drag & Drop State
    const [draggedVideo, setDraggedVideo] = useState(null)
    const [dragOverVideoId, setDragOverVideoId] = useState(null)

    function handleDragStart(e, video) {
        setDraggedVideo(video)
        e.dataTransfer.effectAllowed = 'move'
    }

    function handleDragOver(e, targetVideo) {
        e.preventDefault()
        if (!draggedVideo) return
        if (draggedVideo.id === targetVideo.id) return
        // Only allow reordering within the same module for now
        if (draggedVideo.moduleId !== targetVideo.moduleId) return

        setDragOverVideoId(targetVideo.id)

        setModules(prev => prev.map(mod => {
            if (mod.id !== draggedVideo.moduleId) return mod

            const oldIndex = mod.videos.findIndex(v => v.id === draggedVideo.id)
            const newIndex = mod.videos.findIndex(v => v.id === targetVideo.id)
            if (oldIndex !== -1 && newIndex !== -1) {
                const nextVideos = [...mod.videos]
                const [removed] = nextVideos.splice(oldIndex, 1)
                nextVideos.splice(newIndex, 0, removed)
                
                // Update orders
                nextVideos.forEach((v, i) => v.order = i)
                return { ...mod, videos: nextVideos }
            }
            return mod
        }))
    }

    async function handleDragEnd() {
        if (!draggedVideo) return
        const mod = modules.find(m => m.id === draggedVideo.moduleId)
        if (mod && mod.videos) {
            // Persist new orders to DB
            try {
                for (const v of mod.videos) {
                    await updateVideo(v.id, { order: v.order })
                }
            } catch (err) {
                console.error("Failed to save order:", err)
            }
        }
        setDraggedVideo(null)
        setDragOverVideoId(null)
    }

    const handleBulkDelete = async () => {
        if (selectedVideoIds.size === 0) return
        if (!confirm(`Are you sure you want to delete ${selectedVideoIds.size} video(s)?`)) return
        
        try {
            for (const videoId of selectedVideoIds) {
                await deleteVideo(videoId)
            }
            setSelectedVideoIds(new Set())
            loadData() // Refresh list
        } catch (err) {
            console.error('Failed to bulk delete videos:', err)
        }
    }

    const handleDeleteSingleVideo = async (videoId) => {
        if (!confirm('Are you sure you want to delete this video?')) return
        try {
            await deleteVideo(videoId)
            if (selectedVideoIds.has(videoId)) {
                const nextSelected = new Set(selectedVideoIds)
                nextSelected.delete(videoId)
                setSelectedVideoIds(nextSelected)
            }
            if (activeVideoId === videoId) {
                setActiveVideoId(null)
            }
            loadData()
        } catch (err) {
            console.error('Failed to delete video:', err)
        }
    }



    async function handleRenameVideo(videoId, newTitle) {
        try {
            await updateVideo(videoId, { title: newTitle })
            setVideos(prev => prev.map(v => v.id === videoId ? { ...v, title: newTitle } : v))
            setModules(prev => prev.map(m => ({
                ...m,
                videos: m.videos?.map(v => v.id === videoId ? { ...v, title: newTitle } : v)
            })))
        } catch (err) {
            console.error(err)
        }
    }

    async function handleStartJobs(targetLang) {
        const type = jobSetup.type
        const vids = [...selectedVideosList]
        
        // Start background processing
        for (const video of vids) {
            const controller = new AbortController()
            setActiveJobs(prev => ({
                ...prev,
                [video.id]: { type, status: 'processing', progress: 5, message: 'Starting...', abortController: controller }
            }))

            try {
                if (type === 'dub') {
                    // DUBBING LOGIC - POST and Poll
                    const res = await fetch(`${SERVER_URL}/api/dub/video/${video.id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ targetLanguage: targetLang }),
                        signal: controller.signal
                    })

                    if (!res.ok) throw new Error(`Server error: ${res.status}`)

                    // Poll
                    let isJobDone = false
                    while (!isJobDone && !controller.signal.aborted) {
                        await new Promise(r => setTimeout(r, 2000))
                        if (controller.signal.aborted) break

                        const statusRes = await fetch(`${SERVER_URL}/api/dub/video/${video.id}/status`)
                        const data = await statusRes.json()

                        if (data.status === 'running' || data.status === 'queued') {
                            setActiveJobs(prev => ({
                                ...prev,
                                [video.id]: { ...prev[video.id], progress: data.progress || 50, message: data.step || 'Processing...' }
                            }))
                        } else if (data.status === 'done') {
                            isJobDone = true
                            setActiveJobs(prev => ({
                                ...prev,
                                [video.id]: { ...prev[video.id], status: 'done', progress: 100, message: 'Done!' }
                            }))
                            setTimeout(() => {
                                setActiveJobs(curr => {
                                    const next = { ...curr }
                                    delete next[video.id]
                                    return next
                                })
                                loadData() // Refresh list to show new badges
                            }, 3000)
                        } else if (data.status === 'failed') {
                            isJobDone = true
                            throw new Error(data.error_message || data.error || 'Failed')
                        }
                    }
                } else if (type === 'translate') {
                    // TRANSLATE LOGIC - SSE Stream
                    const res = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/translate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ targetLanguage: targetLang }),
                        signal: controller.signal
                    })

                    if (!res.ok) throw new Error(`Server error: ${res.status}`)

                    const reader = res.body.getReader()
                    const decoder = new TextDecoder()
                    
                    let buffer = ''
                    while (!controller.signal.aborted) {
                        const { value, done } = await reader.read()
                        if (done) break
                        
                        buffer += decoder.decode(value, { stream: true })
                        const lines = buffer.split('\n\n')
                        buffer = lines.pop() // keep incomplete chunk in buffer
                        
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.substring(6))
                                    if (data.error) {
                                        throw new Error(data.error)
                                    }
                                    if (data.step === 'done') {
                                        setActiveJobs(prev => ({
                                            ...prev,
                                            [video.id]: { ...prev[video.id], status: 'done', progress: 100, message: 'Done!' }
                                        }))
                                        setTimeout(() => {
                                            setActiveJobs(curr => {
                                                const next = { ...curr }
                                                delete next[video.id]
                                                return next
                                            })
                                            loadData() // Refresh list to show new badges
                                        }, 3000)
                                    } else {
                                        setActiveJobs(prev => ({
                                            ...prev,
                                            [video.id]: { ...prev[video.id], progress: data.percent || 50, message: data.message || 'Processing...' }
                                        }))
                                    }
                                } catch (e) {
                                    if (e.message !== 'Unexpected end of JSON input') {
                                        throw e
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    setActiveJobs(prev => ({
                        ...prev,
                        [video.id]: { ...prev[video.id], status: 'error', progress: 0, message: err.message, error: err.message }
                    }))
                    setTimeout(() => {
                        setActiveJobs(curr => {
                            const next = { ...curr }
                            delete next[video.id]
                            return next
                        })
                    }, 5000)
                }
            }
        }
    }



    if (isLoading) return <LoadingSpinner />
    if (!course) return <div className="p-8 text-center">Course not found</div>

    return (
        <div className="flex flex-col h-full space-y-6 max-w-[1600px] mx-auto w-full pb-20 relative">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate(`/course/${courseId}`)}
                        className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold">{course.title}</h1>
                        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Course Manager</p>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex gap-6 h-full min-h-[600px]">
                {/* Full-width List */}
                <div className="flex-1 bg-white dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border overflow-hidden flex flex-col">
                    {/* List Header */}
                    <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-bg/50">
                        <div className="flex items-center gap-3">
                            <div 
                                className="w-6 shrink-0 flex justify-center cursor-pointer text-gray-400 hover:text-primary transition-colors" 
                                onClick={handleSelectAll}
                            >
                                {(selectedVideoIds.size === videos.length && videos.length > 0) ? (
                                    <CheckCircle2 className="w-5 h-5 text-primary" />
                                ) : (
                                    <Circle className="w-5 h-5" />
                                )}
                            </div>
                            <span className="font-medium text-sm">
                                {selectedVideoIds.size} selected
                            </span>
                        </div>
                        
                        {/* Bulk Actions */}
                        <div className={`flex items-center gap-2 transition-opacity duration-300 ${selectedVideoIds.size > 0 ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            
                            <button 
                                onClick={() => setJobSetup({ type: 'translate' })}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover:bg-light-bg dark:hover:bg-dark-bg rounded-lg transition-colors"
                            >
                                <Globe className="w-3.5 h-3.5" /> Translate
                            </button>
                            
                            <button 
                                onClick={() => setJobSetup({ type: 'dub' })}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover:bg-light-bg dark:hover:bg-dark-bg rounded-lg transition-colors"
                            >
                                <Headphones className="w-3.5 h-3.5" /> Dub
                            </button>

                            <div className="h-4 w-px bg-light-border dark:bg-dark-border mx-1"></div>
                            
                            <Type className="w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary ml-1" />
                            <select 
                                onChange={(e) => handleBulkPrimaryTranscriptChange(e.target.value)}
                                className="text-xs border border-light-border dark:border-dark-border px-2 py-1 rounded bg-white dark:bg-dark-surface cursor-pointer"
                                defaultValue=""
                            >
                                <option value="" disabled>Set Primary Transcript</option>
                                <option value="">Auto / Default</option>
                                {uniqueSources.map(srcId => {
                                    const [l, o] = srcId.split(':')
                                    return <option key={srcId} value={srcId}>{l} ({o})</option>
                                })}
                            </select>

                            <div className="h-4 w-px bg-light-border dark:bg-dark-border mx-1"></div>

                            <button 
                                onClick={handleBulkDelete}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                        </div>
                    </div>
                    
                    {/* List Body */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {modules.map(module => (
                            <div key={module.id} className="mb-6">
                                <h3 className="font-bold text-lg mb-3 pl-1">{module.title}</h3>
                                <div className="space-y-1">
                                    {module.videos?.map(video => (
                                            <CourseManagerVideoRow
                                                key={video.id}
                                                video={video}
                                                isSelected={selectedVideoIds.has(video.id)}
                                                onToggleSelect={() => toggleVideoSelection(video.id)}
                                                isActive={activeVideoId === video.id}
                                                onActivate={() => setActiveVideoId(video.id)}
                                                onDelete={() => handleDeleteSingleVideo(video.id)}
                                                onUpdatePrimaryTranscript={handlePrimaryTranscriptChange}
                                                job={activeJobs[video.id]}
                                                onCancelJob={cancelJob}
                                                draggableProps={{
                                                    draggable: true,
                                                    onDragStart: (e) => handleDragStart(e, video),
                                                    onDragOver: (e) => handleDragOver(e, video),
                                                    onDragEnd: handleDragEnd,
                                                    isDragging: draggedVideo?.id === video.id,
                                                    isDragOver: dragOverVideoId === video.id,
                                                    dragHandleProps: {} // Can attach specifically if needed, but the row captures it
                                                }}
                                            />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Floating Mini Player — YouTube style */}
            {activeVideoId && (
                <FloatingMiniPlayer
                    video={videos.find(v => v.id === activeVideoId)}
                    course={course}
                    courseId={courseId}
                    onClose={() => setActiveVideoId(null)}
                />
            )}


            <JobSetupModal 
                isOpen={!!jobSetup}
                onClose={() => setJobSetup(null)}
                type={jobSetup?.type}
                videos={selectedVideosList}
                course={course}
                onStart={handleStartJobs}
            />
        </div>
    )
}

export default CourseManagerPage
