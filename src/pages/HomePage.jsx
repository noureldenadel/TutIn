import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
    FolderOpen, Grid, List, Search, X,
    SortAsc, ChevronDown, Clock, BookOpen, Play, Youtube
} from 'lucide-react'
import { getAllCourses, addCourse, addModule, addVideo, setInstructorAvatar } from '../utils/db'
import { useSettings } from '../contexts/SettingsContext'
import CourseCard from '../components/course/CourseCard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ImportPreviewModal from '../components/course/ImportPreviewModal'
import EditCourseModal from '../components/course/EditCourseModal'
import YouTubeImportModal from '../components/course/YouTubeImportModal'
import { scanCourseFolder, scanFolderFromFiles, isFileSystemAccessSupported } from '../utils/fileSystem'

function HomePage() {
    const [courses, setCourses] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [importData, setImportData] = useState(null)
    const [editingCourse, setEditingCourse] = useState(null)
    const { settings, updateSettings } = useSettings()
    const viewMode = settings.viewMode || 'grid'

    // Search and Sort state
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [sortBy, setSortBy] = useState(() => {
        return localStorage.getItem('mearn_sort') || 'lastAccessed'
    })
    const [showSortMenu, setShowSortMenu] = useState(false)
    const [showYouTubeModal, setShowYouTubeModal] = useState(false)
    const [showAddMenu, setShowAddMenu] = useState(false)
    const [activeFilter, setActiveFilter] = useState('all') // 'all', 'completed', 'not-started', or tag name

    // Load courses on mount
    useEffect(() => {
        loadCourses()
    }, [])

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // Save sort preference
    useEffect(() => {
        localStorage.setItem('mearn_sort', sortBy)
    }, [sortBy])

    async function loadCourses() {
        try {
            setIsLoading(true)
            const allCourses = await getAllCourses()
            setCourses(allCourses)
        } catch (err) {
            console.error('Failed to load courses:', err)
        } finally {
            setIsLoading(false)
        }
    }



    // Search and sort courses
    const filteredCourses = useMemo(() => {
        let result = [...courses]

        // Search filter
        if (debouncedSearch) {
            const query = debouncedSearch.toLowerCase()
            result = result.filter(course =>
                course.title?.toLowerCase().includes(query) ||
                course.instructor?.toLowerCase().includes(query) ||
                course.tags?.some(tag => tag.toLowerCase().includes(query))
            )
        }


        // Sort
        result.sort((a, b) => {
            switch (sortBy) {
                case 'title':
                    return (a.title || '').localeCompare(b.title || '')
                case 'progress':
                    return (b.completionPercentage || 0) - (a.completionPercentage || 0)
                case 'dateAdded':
                    return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0)
                case 'lastAccessed':
                default:
                    return new Date(b.lastAccessed || 0) - new Date(a.lastAccessed || 0)
            }
        })

        return result
    }, [courses, debouncedSearch, sortBy])

    // Get all unique tags from courses
    const allTags = useMemo(() => {
        const tagSet = new Set()
        courses.forEach(course => {
            course.tags?.forEach(tag => tagSet.add(tag))
        })
        return Array.from(tagSet).sort()
    }, [courses])

    // Apply filter tabs
    const displayedCourses = useMemo(() => {
        let result = [...filteredCourses]

        if (activeFilter === 'completed') {
            result = result.filter(c => c.completionPercentage === 100)
        } else if (activeFilter === 'in-progress') {
            result = result.filter(c => c.completionPercentage > 0 && c.completionPercentage < 100)
        } else if (activeFilter === 'not-started') {
            result = result.filter(c => !c.completionPercentage || c.completionPercentage === 0)
        } else if (activeFilter !== 'all') {
            // It's a tag filter
            result = result.filter(c => c.tags?.includes(activeFilter))
        }

        return result
    }, [filteredCourses, activeFilter])

    // Continue watching courses (in-progress with recent activity)
    const continueWatching = useMemo(() => {
        return courses
            .filter(c => c.completionPercentage > 0 && c.completionPercentage < 100)
            .sort((a, b) => new Date(b.lastAccessed || 0) - new Date(a.lastAccessed || 0))
            .slice(0, 4)
    }, [courses])

    // Handle folder import
    async function handleImportClick() {
        try {
            // ... (existing import logic) ...
            let courseData
            if (isFileSystemAccessSupported()) {
                console.log('Using File System Access API')
                const handle = await window.showDirectoryPicker()
                console.log('Selected folder:', handle.name)
                // Check if checks if course already exists by folderHandle or title
                // Note: comparing handles is hard, better to compare titles or path if available
                // Simplest: Check name first
                /* 
                   We scan first to get the title. 
                   Alternatively, check if handle.name matches any originalTitle?
                */
                courseData = await scanCourseFolder(handle)
            } else {
                console.log('Using fallback picker')
                const input = document.createElement('input')
                input.type = 'file'
                input.webkitdirectory = true
                input.multiple = true

                const files = await new Promise((resolve) => {
                    input.onchange = (e) => resolve(Array.from(e.target.files))
                    input.click()
                })

                if (files.length === 0) return

                const firstFile = files[0]
                const pathParts = firstFile.webkitRelativePath.split('/')
                const folderName = pathParts[0]

                courseData = await scanFolderFromFiles(files, folderName)
            }

            if (courseData) {
                // Check for duplicates
                const dupe = courses.find(c => c.title === courseData.title || c.originalTitle === courseData.title)
                if (dupe) {
                    if (!confirm(`A course named "${courseData.title}" already exists. Do you want to import it again as a duplicate?`)) {
                        return
                    }
                }

                if (courseData.modules?.length === 0 && courseData.totalVideos === 0) {
                    alert('No videos found in the selected folder. Make sure your folder contains MP4, WebM, MOV, OGG, AVI, or MKV files.')
                }
                setImportData(courseData)
            } else {
                alert('Failed to scan folder. Please try again.')
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Import failed:', err)
                alert('Import failed: ' + err.message)
            }
        }
    }

    function toggleViewMode() {
        updateSettings({ viewMode: viewMode === 'grid' ? 'list' : 'grid' })
    }

    // Handle import confirmation - save course to database
    async function handleImportConfirm(editedData) {
        try {
            console.log('Saving course to database:', editedData)

            // Combine original import data with edited data
            const courseData = {
                ...importData,
                title: editedData.title,
                instructor: editedData.instructor,
                thumbnailData: editedData.thumbnailData,
            }

            // Add the course to database
            const savedCourse = await addCourse(courseData)
            console.log('Course saved:', savedCourse.id)

            // Add modules and videos
            /* FIX: Use index for explicit ordering to match preview */
            for (let i = 0; i < editedData.modules.length; i++) {
                const module = editedData.modules[i]
                const savedModule = await addModule({
                    courseId: savedCourse.id,
                    title: module.title,
                    originalTitle: module.originalTitle,
                    order: i, // Explicit order from array index
                    totalDuration: module.totalDuration,
                    totalVideos: module.videos?.length || 0
                })
                console.log('Module saved:', savedModule.id)

                // Add videos for this module
                const videos = module.videos || []
                for (let j = 0; j < videos.length; j++) {
                    const video = videos[j]
                    await addVideo({
                        courseId: savedCourse.id,
                        moduleId: savedModule.id,
                        title: video.title,
                        originalTitle: video.originalTitle,
                        fileName: video.fileName,
                        relativePath: video.relativePath,
                        duration: video.duration,
                        order: j, // Explicit order from array index
                        fileHandle: video.fileHandle
                    })
                }
            }

            console.log('Import complete!')
            setImportData(null)
            loadCourses()
        } catch (err) {
            console.error('Failed to save course:', err)
            alert('Failed to save course: ' + err.message)
        }
    }

    async function handleYouTubeImport(courseData) {
        try {
            // Check for duplicates
            const dupe = courses.find(c => c.title === courseData.title)
            if (dupe) {
                if (!confirm(`A course named "${courseData.title}" already exists. Do you want to import it again?`)) {
                    return
                }
            }

            console.log('Saving YouTube course:', courseData)

            // Store instructor avatar in instructors store (not on the course)
            if (courseData.instructor && courseData.channelAvatar) {
                await setInstructorAvatar(courseData.instructor, courseData.channelAvatar)
            }

            // Calculate total duration and video count from modules
            let totalDuration = 0
            let totalVideos = 0
            if (courseData.modules?.[0]) {
                const videos = courseData.modules[0].videos || []
                totalDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0)
                totalVideos = videos.length
            }

            const savedCourse = await addCourse({
                ...courseData,
                totalDuration,
                totalVideos
            })

            // Add module and videos
            if (courseData.modules?.[0]) {
                const module = courseData.modules[0]
                const moduleDuration = module.videos.reduce((sum, v) => sum + (v.duration || 0), 0)

                const savedModule = await addModule({
                    courseId: savedCourse.id,
                    title: module.title,
                    originalTitle: module.title,
                    order: 0,
                    totalDuration: moduleDuration,
                    totalVideos: module.videos.length
                })

                for (let i = 0; i < module.videos.length; i++) {
                    const video = module.videos[i]
                    await addVideo({
                        courseId: savedCourse.id,
                        moduleId: savedModule.id,
                        title: video.title,
                        originalTitle: video.title,
                        youtubeId: video.youtubeId,
                        url: video.url,
                        duration: video.duration || 0,
                        order: i // Explicit order
                    })
                }
            }

            setShowYouTubeModal(false)
            loadCourses()
        } catch (err) {
            console.error('Failed to save YouTube course:', err)
            alert('Failed to save: ' + err.message)
        }
    }

    const sortOptions = [
        { value: 'lastAccessed', label: 'Recently Accessed' },
        { value: 'title', label: 'Title (A-Z)' },
        { value: 'progress', label: 'Progress' },
        { value: 'dateAdded', label: 'Date Added' }
    ]

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <LoadingSpinner message="Loading your courses..." />
            </div>
        )
    }

    return (
        <div className="container mx-auto px-4 py-6">
            {/* Continue Watching Section */}
            {continueWatching.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Play className="w-5 h-5 text-primary" />
                        Continue Watching
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {continueWatching.map(course => (
                            <Link
                                key={course.id}
                                to={`/course/${course.id}`}
                                className="bg-white dark:bg-dark-surface rounded-lg p-4 hover:shadow-lg transition-shadow border border-light-border dark:border-dark-border"
                            >
                                <h3 className="font-medium truncate mb-2">{course.title}</h3>
                                <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary mb-2">
                                    <Clock className="w-4 h-4" />
                                    <span>{Math.round(course.completionPercentage)}% complete</span>
                                </div>
                                <div className="progress-bar h-2">
                                    <div
                                        className="progress-bar-fill"
                                        style={{ width: `${course.completionPercentage}%` }}
                                    />
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">
                        My Courses
                    </h1>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                        {courses.length} {courses.length === 1 ? 'course' : 'courses'}
                    </p>
                </div>

                <div className="relative">
                    <div className="flex bg-primary rounded-lg overflow-hidden">
                        <button
                            onClick={handleImportClick}
                            className="flex items-center gap-2 px-4 py-2 text-white hover:bg-primary-dark transition-colors"
                        >
                            <FolderOpen className="w-5 h-5" />
                            Add Course
                        </button>
                        <div className="w-[1px] bg-white/20" />
                        <button
                            onClick={() => setShowAddMenu(!showAddMenu)}
                            className="px-2 py-2 text-white hover:bg-primary-dark transition-colors"
                        >
                            <ChevronDown className="w-4 h-4" />
                        </button>
                    </div>

                    {showAddMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
                            <div className="absolute right-0 mt-2 w-48 py-2 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-light-border dark:border-dark-border z-20">
                                <button
                                    onClick={() => {
                                        handleImportClick()
                                        setShowAddMenu(false)
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-light-surface dark:hover:bg-dark-bg flex items-center gap-2"
                                >
                                    <FolderOpen className="w-4 h-4" />
                                    Local Folder
                                </button>
                                <button
                                    onClick={() => {
                                        setShowYouTubeModal(true)
                                        setShowAddMenu(false)
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-light-surface dark:hover:bg-dark-bg flex items-center gap-2"
                                >
                                    <Youtube className="w-4 h-4 text-red-600" />
                                    From YouTube
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Search, Filter, and Sort Bar */}
            {courses.length > 0 && (
                <div className="mb-6 space-y-4">
                    <div className="flex flex-col md:flex-row gap-3">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-light-text-secondary dark:text-dark-text-secondary" />
                            <input
                                type="text"
                                placeholder="Search courses by title, instructor, or tags..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:ring-2 focus:ring-primary outline-none"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-light-surface dark:hover:bg-dark-bg rounded"
                                    title="Clear search"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Sort Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowSortMenu(!showSortMenu)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            >
                                <SortAsc className="w-5 h-5" />
                                <span className="hidden sm:inline">{sortOptions.find(o => o.value === sortBy)?.label}</span>
                                <ChevronDown className="w-4 h-4" />
                            </button>
                            {showSortMenu && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                                    <div className="absolute right-0 mt-2 w-48 py-2 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-light-border dark:border-dark-border z-20">
                                        {sortOptions.map(option => (
                                            <button
                                                key={option.value}
                                                onClick={() => {
                                                    setSortBy(option.value)
                                                    setShowSortMenu(false)
                                                }}
                                                className={`w-full px-4 py-2 text-left text-sm hover:bg-light-surface dark:hover:bg-dark-bg ${sortBy === option.value ? 'text-primary font-medium' : ''
                                                    }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* View Toggle */}
                        <button
                            onClick={toggleViewMode}
                            className="p-2.5 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            aria-label="Toggle view mode"
                        >
                            {viewMode === 'grid' ? <List className="w-5 h-5" /> : <Grid className="w-5 h-5" />}
                        </button>
                    </div>

                    {/* YouTube-style Filter Tabs */}
                    {courses.length > 0 && (
                        <div className="relative">
                            <div className="overflow-x-auto scrollbar-hide">
                                <div className="flex gap-2 pb-2">
                                    {/* All Tab */}
                                    <button
                                        onClick={() => setActiveFilter('all')}
                                        className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFilter === 'all'
                                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                            : 'bg-light-surface dark:bg-dark-bg hover:bg-light-border dark:hover:bg-dark-border'
                                            }`}
                                    >
                                        All
                                    </button>

                                    {/* Completed Tab */}
                                    <button
                                        onClick={() => setActiveFilter('completed')}
                                        className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFilter === 'completed'
                                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                            : 'bg-light-surface dark:bg-dark-bg hover:bg-light-border dark:hover:bg-dark-border'
                                            }`}
                                    >
                                        Completed
                                    </button>

                                    {/* In Progress Tab */}
                                    <button
                                        onClick={() => setActiveFilter('in-progress')}
                                        className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFilter === 'in-progress'
                                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                            : 'bg-light-surface dark:bg-dark-bg hover:bg-light-border dark:hover:bg-dark-border'
                                            }`}
                                    >
                                        In Progress
                                    </button>

                                    {/* Not Started Tab */}
                                    <button
                                        onClick={() => setActiveFilter('not-started')}
                                        className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFilter === 'not-started'
                                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                            : 'bg-light-surface dark:bg-dark-bg hover:bg-light-border dark:hover:bg-dark-border'
                                            }`}
                                    >
                                        Not Started
                                    </button>

                                    {/* Tag Tabs */}
                                    {allTags.map(tag => (
                                        <button
                                            key={tag}
                                            onClick={() => setActiveFilter(tag)}
                                            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFilter === tag
                                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                                : 'bg-light-surface dark:bg-dark-bg hover:bg-light-border dark:hover:bg-dark-border'
                                                }`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Course Grid/List */}
            {displayedCourses.length > 0 ? (
                <div className={viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                    : 'space-y-4'
                }>
                    {displayedCourses.map(course => (
                        <CourseCard
                            key={course.id}
                            course={course}
                            viewMode={viewMode}
                            onRefresh={loadCourses}
                            onEdit={() => setEditingCourse(course)}
                        />
                    ))}
                </div>
            ) : courses.length === 0 ? (
                <div className="text-center py-16">
                    <FolderOpen className="w-16 h-16 mx-auto mb-4 text-light-text-secondary dark:text-dark-text-secondary opacity-50" />
                    <h2 className="text-xl font-semibold mb-2">No courses yet</h2>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary mb-6">
                        Import a course folder to get started
                    </p>
                    <button
                        onClick={handleImportClick}
                        className="btn-primary inline-flex items-center gap-2"
                    >
                        <FolderOpen className="w-5 h-5" />
                        Import Your First Course
                    </button>
                </div>
            ) : (
                <div className="text-center py-16">
                    <Search className="w-16 h-16 mx-auto mb-4 text-light-text-secondary dark:text-dark-text-secondary opacity-50" />
                    <h2 className="text-xl font-semibold mb-2">No results found</h2>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary mb-6">
                        Try adjusting your search or filters
                    </p>
                    <button
                        onClick={() => {
                            setSearchQuery('')
                            clearFilters()
                        }}
                        className="text-primary hover:underline"
                    >
                        Clear search and filters
                    </button>
                </div>
            )
            }



            {/* Import Preview Modal */}
            <ImportPreviewModal
                courseStructure={importData}
                onConfirm={handleImportConfirm}
                onCancel={() => setImportData(null)}
                existingCourseNames={courses.map(c => c.title)}
            />

            {/* Edit Course Modal */}
            <EditCourseModal
                course={editingCourse}
                isOpen={!!editingCourse}
                onClose={() => setEditingCourse(null)}
                onSave={loadCourses}
            />

            {/* YouTube Import Modal */}
            <YouTubeImportModal
                isOpen={showYouTubeModal}
                onClose={() => setShowYouTubeModal(false)}
                onImport={handleYouTubeImport}
            />
        </div >
    )
}

export default HomePage
