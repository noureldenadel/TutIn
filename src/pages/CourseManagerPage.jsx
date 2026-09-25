import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { 
    ArrowLeft, 
    CheckSquare, 
    Square, 
    Settings, 
    Play, 
    Pause, 
    Save, 
    Trash2, 
    Globe, 
    Headphones, 
    Type, 
    AlertTriangle, 
    X, 
    CheckCircle2, 
    Circle,
    Folder
} from 'lucide-react'
import { getCourse, getModulesByCourse, getVideosByCourse, updateVideo, deleteVideo, buildModuleTree, formatDuration } from '../utils/db'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { JobSetupModal } from '../components/player/JobSetupModal'
import { SERVER_URL } from '../utils/api'
import FloatingMiniPlayer from '../components/player/FloatingMiniPlayer'
import CourseManagerVideoRow from '../components/player/CourseManagerVideoRow'
import { useJobs } from '../contexts/JobsContext'
import { useSettings } from '../contexts/SettingsContext'

// Helper to collect all video IDs in a module and all its nested sub-modules
function getAllVideoIdsInModule(mod) {
    let ids = (mod.videos || []).map(v => v.id)
    if (mod.subModules && mod.subModules.length > 0) {
        for (const sub of mod.subModules) {
            ids = ids.concat(getAllVideoIdsInModule(sub))
        }
    }
    return ids
}

// Recursive Module Section Component
function ModuleSection({
    module,
    depth = 0,
    selectedVideoIds,
    toggleVideoSelection,
    toggleModuleSelection,
    activeVideoId,
    setActiveVideoId,
    handleDeleteSingleVideo,
    handlePrimaryTranscriptChange,
    activeJobs,
    cancelJob,
    draggedVideo,
    dragOverVideoId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
}) {
    const allModuleVideoIds = getAllVideoIdsInModule(module)
    const allSelected = allModuleVideoIds.length > 0 && allModuleVideoIds.every(id => selectedVideoIds.has(id))
    const someSelected = allModuleVideoIds.length > 0 && !allSelected && allModuleVideoIds.some(id => selectedVideoIds.has(id))

    return (
        <div className={`mb-6 ${depth > 0 ? 'ml-4 pl-3.5 border-l-2 border-primary/20 dark:border-primary/30 mt-3' : ''}`}>
            {/* Module Header with batch toggle */}
            <div className="flex items-center justify-between mb-2.5 px-1">
                <div className="flex items-center gap-2.5">
                    {allModuleVideoIds.length > 0 && (
                        <button
                            type="button"
                            onClick={() => toggleModuleSelection(module)}
                            title={allSelected ? "Deselect section videos" : "Select all videos in section"}
                            className="p-1 -ml-1 rounded hover:bg-light-bg dark:hover:bg-dark-bg transition-colors"
                        >
                            {allSelected ? (
                                <CheckSquare className="w-4 h-4 text-primary" />
                            ) : someSelected ? (
                                <div className="w-4 h-4 rounded border-2 border-primary bg-primary/20 flex items-center justify-center">
                                    <div className="w-2 h-0.5 bg-primary rounded-full" />
                                </div>
                            ) : (
                                <Square className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary" />
                            )}
                        </button>
                    )}
                    <h3 className={`font-bold flex items-center gap-2 ${depth === 0 ? 'text-lg text-light-text-primary dark:text-dark-text-primary' : 'text-base text-light-text-secondary dark:text-dark-text-secondary'}`}>
                        {depth > 0 && <Folder className="w-4 h-4 text-primary/70 shrink-0" />}
                        <span>{module.title}</span>
                        <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-light-bg dark:bg-dark-bg text-light-text-secondary dark:text-dark-text-secondary border border-light-border dark:border-dark-border">
                            {allModuleVideoIds.length} video{allModuleVideoIds.length === 1 ? '' : 's'}
                        </span>
                    </h3>
                </div>
            </div>

            {/* Direct Videos in this module */}
            {module.videos && module.videos.length > 0 && (
                <div className="space-y-1">
                    {module.videos.map(video => (
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
                                dragHandleProps: {}
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Nested Sub-modules */}
            {module.subModules && module.subModules.length > 0 && (
                <div className="space-y-3 mt-2">
                    {module.subModules.map(subMod => (
                        <ModuleSection
                            key={subMod.id}
                            module={subMod}
                            depth={depth + 1}
                            selectedVideoIds={selectedVideoIds}
                            toggleVideoSelection={toggleVideoSelection}
                            toggleModuleSelection={toggleModuleSelection}
                            activeVideoId={activeVideoId}
                            setActiveVideoId={setActiveVideoId}
                            handleDeleteSingleVideo={handleDeleteSingleVideo}
                            handlePrimaryTranscriptChange={handlePrimaryTranscriptChange}
                            activeJobs={activeJobs}
                            cancelJob={cancelJob}
                            draggedVideo={draggedVideo}
                            dragOverVideoId={dragOverVideoId}
                            handleDragStart={handleDragStart}
                            handleDragOver={handleDragOver}
                            handleDragEnd={handleDragEnd}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

function CourseManagerPage() {
    const { courseId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const { settings } = useSettings()
    const [course, setCourse] = useState(null)
    const [modules, setModules] = useState([])
    const [videos, setVideos] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [selectedVideoIds, setSelectedVideoIds] = useState(new Set())
    const [activeVideoId, setActiveVideoId] = useState(null)
    
    // Jobs & Modals from root JobsContext
    const { activeJobs, cancelJob, runBatchJob } = useJobs()
    const [jobSetup, setJobSetup] = useState(null) // null or { type: 'dub' | 'translate' }
    
    const selectedVideosList = videos.filter(v => selectedVideoIds.has(v.id))

    useEffect(() => {
        loadData()
    }, [courseId])

    async function loadData() {
        setIsLoading(true)
        try {
            const [courseData, mods, vids] = await Promise.all([
                getCourse(courseId),
                getModulesByCourse(courseId),
                getVideosByCourse(courseId)
            ])

            setCourse(courseData)
            setVideos(vids)
            
            // Build recursive module tree
            const tree = buildModuleTree(mods)
            
            // Attach videos to matching modules recursively
            function attachVideos(mod) {
                mod.videos = vids.filter(v => v.moduleId === mod.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                if (mod.subModules) {
                    mod.subModules.forEach(attachVideos)
                }
            }
            tree.forEach(attachVideos)

            // Catch any unassigned videos so they are never lost or invisible
            const unassigned = vids.filter(v => !v.moduleId || !mods.some(m => m.id === v.moduleId))
            if (unassigned.length > 0) {
                tree.push({
                    id: '__unassigned__',
                    title: 'General / Unassigned Videos',
                    videos: unassigned.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
                    subModules: []
                })
            }

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

    const toggleModuleSelection = (mod) => {
        const modVideoIds = getAllVideoIdsInModule(mod)
        if (modVideoIds.length === 0) return
        const allSelected = modVideoIds.every(id => selectedVideoIds.has(id))
        const newSet = new Set(selectedVideoIds)
        if (allSelected) {
            modVideoIds.forEach(id => newSet.delete(id))
        } else {
            modVideoIds.forEach(id => newSet.add(id))
        }
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
            
            function updateInTree(treeList) {
                return treeList.map(m => ({
                    ...m,
                    videos: m.videos?.map(v => v.id === videoId ? { ...v, primaryTranscript: newValue } : v),
                    subModules: m.subModules ? updateInTree(m.subModules) : []
                }))
            }
            setModules(prev => updateInTree(prev))
        } catch (err) {
            console.error('Failed to update primary transcript:', err)
        }
    }

    const handleBulkPrimaryTranscriptChange = async (newValue) => {
        if (selectedVideoIds.size === 0) return
        await Promise.all(Array.from(selectedVideoIds).map(videoId => handlePrimaryTranscriptChange(videoId, newValue)))
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
        if (draggedVideo.moduleId !== targetVideo.moduleId) return

        setDragOverVideoId(targetVideo.id)

        // Pure immutable reorder in tree
        setModules(prev => {
            function updateInTree(treeList) {
                return treeList.map(mod => {
                    let updatedVideos = mod.videos
                    if (mod.id === draggedVideo.moduleId) {
                        const oldIndex = mod.videos.findIndex(v => v.id === draggedVideo.id)
                        const newIndex = mod.videos.findIndex(v => v.id === targetVideo.id)
                        if (oldIndex !== -1 && newIndex !== -1) {
                            const nextVideos = [...mod.videos]
                            const [removed] = nextVideos.splice(oldIndex, 1)
                            nextVideos.splice(newIndex, 0, removed)
                            updatedVideos = nextVideos.map((v, i) => ({ ...v, order: i }))
                        }
                    }
                    const updatedSubModules = mod.subModules ? updateInTree(mod.subModules) : []
                    return { ...mod, videos: updatedVideos, subModules: updatedSubModules }
                })
            }
            return updateInTree(prev)
        })
    }

    async function handleDragEnd() {
        if (!draggedVideo) return

        function findModuleInTree(treeList, targetModuleId) {
            for (const mod of treeList) {
                if (mod.id === targetModuleId) return mod
                if (mod.subModules) {
                    const found = findModuleInTree(mod.subModules, targetModuleId)
                    if (found) return found
                }
            }
            return null
        }

        const targetMod = findModuleInTree(modules, draggedVideo.moduleId)
        if (targetMod && targetMod.videos) {
            try {
                await Promise.all(targetMod.videos.map(v => updateVideo(v.id, { order: v.order })))
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

    function handleStartJobs(targetLang) {
        if (!jobSetup) return
        const type = jobSetup.type
        runBatchJob({
            type,
            videos: selectedVideosList,
            targetLang,
            course,
            settings,
            onVideoComplete: () => {
                loadData()
            }
        })
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
                        title="Back to Course Player"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold">{course.title}</h1>
                        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Course Manager &amp; Bulk Operations</p>
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
                                title={selectedVideoIds.size === videos.length ? "Deselect All" : "Select All"}
                            >
                                {(selectedVideoIds.size === videos.length && videos.length > 0) ? (
                                    <CheckCircle2 className="w-5 h-5 text-primary" />
                                ) : (
                                    <Circle className="w-5 h-5" />
                                )}
                            </div>
                            <span className="font-medium text-sm">
                                {selectedVideoIds.size} of {videos.length} selected
                            </span>
                        </div>
                        
                        {/* Bulk Actions */}
                        <div className={`flex items-center gap-2 transition-opacity duration-300 ${selectedVideoIds.size > 0 ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            
                            <button 
                                onClick={() => setJobSetup({ type: 'translate' })}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors border border-blue-200 dark:border-blue-800"
                            >
                                <Globe className="w-3.5 h-3.5" /> Transcript &amp; Translate
                            </button>
                            
                            <button 
                                onClick={() => setJobSetup({ type: 'dub' })}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg transition-colors border border-purple-200 dark:border-purple-800"
                            >
                                <Headphones className="w-3.5 h-3.5" /> Dub Voice
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
                    
                    {/* List Body with Recursive Module Sections */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {modules.map(module => (
                            <ModuleSection
                                key={module.id}
                                module={module}
                                depth={0}
                                selectedVideoIds={selectedVideoIds}
                                toggleVideoSelection={toggleVideoSelection}
                                toggleModuleSelection={toggleModuleSelection}
                                activeVideoId={activeVideoId}
                                setActiveVideoId={setActiveVideoId}
                                handleDeleteSingleVideo={handleDeleteSingleVideo}
                                handlePrimaryTranscriptChange={handlePrimaryTranscriptChange}
                                activeJobs={activeJobs}
                                cancelJob={cancelJob}
                                draggedVideo={draggedVideo}
                                dragOverVideoId={dragOverVideoId}
                                handleDragStart={handleDragStart}
                                handleDragOver={handleDragOver}
                                handleDragEnd={handleDragEnd}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Floating Mini Player */}
            {activeVideoId && (
                <FloatingMiniPlayer
                    video={videos.find(v => v.id === activeVideoId)}
                    course={course}
                    courseId={courseId}
                    onClose={() => setActiveVideoId(null)}
                />
            )}

            {/* Bulk Job Setup Modal */}
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
