import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
    FolderOpen, Grid, List, Search, X, Filter,
    SortAsc, ChevronDown, Clock, BookOpen, Play, Youtube
} from 'lucide-react'
import { getAllCourses, getRecentlyWatchedVideos, addCourse, addModule, addVideo } from '../utils/db'
import { useSettings } from '../contexts/SettingsContext'
import CourseCard from '../components/course/CourseCard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ImportPreviewModal from '../components/course/ImportPreviewModal'
import EditCourseModal from '../components/course/EditCourseModal'
import YouTubeImportModal from '../components/course/YouTubeImportModal'
import { scanCourseFolder, scanFolderFromFiles, isFileSystemAccessSupported } from '../utils/fileSystem'

function HomePage() {
    const [courses, setCourses] = useState([])
    const [recentlyWatched, setRecentlyWatched] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [importData, setImportData] = useState(null)
    const [editingCourse, setEditingCourse] = useState(null)
    const { settings, updateSettings } = useSettings()
    const viewMode = settings.viewMode || 'grid'

    // Search, Filter, and Sort state
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [filters, setFilters] = useState({
        status: [], // 'not-started', 'in-progress', 'completed'
        tags: []
    })
    const [sortBy, setSortBy] = useState(() => {
        return localStorage.getItem('mearn_sort') || 'lastAccessed'
    })
    const [showSortMenu, setShowSortMenu] = useState(false)
    const [showYouTubeModal, setShowYouTubeModal] = useState(false)
    const [showAddMenu, setShowAddMenu] = useState(false)

    // Load courses on mount
    useEffect(() => {
        loadCourses()
        loadRecentlyWatched()
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

    async function loadRecentlyWatched() {
        try {
            const recent = await getRecentlyWatchedVideos(10)
            setRecentlyWatched(recent)
        } catch (err) {
            console.error('Failed to load recently watched:', err)
        }
    }

    // Filter and sort courses
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

        // Status filter
        if (filters.status.length > 0) {
            result = result.filter(course => {
                const progress = course.completionPercentage || 0
                if (filters.status.includes('not-started') && progress === 0) return true
                if (filters.status.includes('in-progress') && progress > 0 && progress < 100) return true
                if (filters.status.includes('completed') && progress === 100) return true
                return false
            })
        }

        // Tags filter
        if (filters.tags.length > 0) {
            result = result.filter(course =>
                course.tags?.some(tag => filters.tags.includes(tag))
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
    }, [courses, debouncedSearch, filters, sortBy])

    // Get all unique tags from courses
    const allTags = useMemo(() => {
        const tags = new Set()
        courses.forEach(course => {
            course.tags?.forEach(tag => tags.add(tag))
        })
        return Array.from(tags).sort()
    }, [courses])

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
            const savedCourse = await addCourse(courseData)

            // Add module and videos
            if (courseData.modules?.[0]) {
                const module = courseData.modules[0]
                const savedModule = await addModule({
                    courseId: savedCourse.id,
                    title: module.title,
                    originalTitle: module.title,
                    order: 0,
                    totalDuration: 0, // YouTube duration requires separate fetch or player
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
                        duration: 0,
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

    function toggleFilter(type, value) {
        setFilters(prev => ({
            ...prev,
            [type]: prev[type].includes(value)
                ? prev[type].filter(v => v !== value)
                : [...prev[type], value]
        }))
    }

    function clearFilters() {
        setFilters({ status: [], tags: [] })
    }

    const activeFilterCount = filters.status.length + filters.tags.length

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

                        {/* Filter Button */}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            title="Filter courses"
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${showFilters || activeFilterCount > 0
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-bg'
                                }`}
                        >
                            <Filter className="w-5 h-5" />
                            Filter
                            {activeFilterCount > 0 && (
                                <span className="bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>

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

                    {/* Filter Panel */}
                    {showFilters && (
                        <div className="p-4 bg-light-surface dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium">Filters</h3>
                                {activeFilterCount > 0 && (
                                    <button
                                        onClick={clearFilters}
                                        className="text-sm text-primary hover:underline"
                                    >
                                        Clear all
                                    </button>
                                )}
                            </div>

                            {/* Status Filter */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2">Status</label>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { value: 'not-started', label: 'Not Started' },
                                        { value: 'in-progress', label: 'In Progress' },
                                        { value: 'completed', label: 'Completed' }
                                    ].map(status => (
                                        <button
                                            key={status.value}
                                            onClick={() => toggleFilter('status', status.value)}
                                            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${filters.status.includes(status.value)
                                                ? 'bg-primary text-white'
                                                : 'bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border hover:border-primary'
                                                }`}
                                        >
                                            {status.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Tags Filter */}
                            {allTags.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">Tags</label>
                                    <div className="flex flex-wrap gap-2">
                                        {allTags.map(tag => (
                                            <button
                                                key={tag}
                                                onClick={() => toggleFilter('tags', tag)}
                                                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${filters.tags.includes(tag)
                                                    ? 'bg-primary text-white'
                                                    : 'bg-white dark:bg-dark-surface border border-light-border dark:border-dark-border hover:border-primary'
                                                    }`}
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Course Grid/List */}
            {filteredCourses.length > 0 ? (
                <div className={viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                    : 'space-y-4'
                }>
                    {filteredCourses.map(course => (
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
            )}

            {/* Recently Watched Section */}
            {recentlyWatched.length > 0 && (
                <div className="mt-12">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary" />
                        Recently Watched
                    </h2>
                    <div className="bg-white dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border overflow-hidden">
                        {recentlyWatched.slice(0, 5).map((item, index) => (
                            <Link
                                key={item.video.id}
                                to={`/course/${item.course.id}`}
                                className={`flex items-center gap-4 p-4 hover:bg-light-surface dark:hover:bg-dark-bg transition-colors ${index > 0 ? 'border-t border-light-border dark:border-dark-border' : ''
                                    }`}
                            >
                                <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <Play className="w-5 h-5 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium truncate">{item.video.title}</h4>
                                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary truncate">
                                        {item.course.title}
                                    </p>
                                </div>
                                <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">
                                    {Math.round((item.video.watchProgress || 0) * 100)}%
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

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
        </div>
    )
}

export default HomePage
