import { useState, useEffect, useMemo } from 'react'
import { Grid, List, SortAsc, ChevronDown, FolderOpen, Search } from 'lucide-react'
import { getAllCourses, addCourse, addModule, addVideo, setInstructorAvatar } from '../utils/db'
import { useSettings } from '../contexts/SettingsContext'
import { useSearch } from '../contexts/SearchContext'
import CourseCard from '../components/course/CourseCard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ImportPreviewModal from '../components/course/ImportPreviewModal'
import EditCourseModal from '../components/course/EditCourseModal'
import { getDriveVideoUrl } from '../utils/googleDrive'

function HomePage() {
    const [courses, setCourses] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [importData, setImportData] = useState(null)
    const [editingCourse, setEditingCourse] = useState(null)
    const { settings, updateSettings } = useSettings()
    const { searchQuery, setSearchQuery } = useSearch()
    const viewMode = settings.viewMode || 'grid'

    // Sort state
    const [sortBy, setSortBy] = useState(() => {
        return localStorage.getItem('mearn_sort') || 'lastAccessed'
    })
    const [showSortMenu, setShowSortMenu] = useState(false)
    const [activeFilter, setActiveFilter] = useState('all')

    // Debounced search
    const [debouncedSearch, setDebouncedSearch] = useState('')

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
            result = result.filter(c => c.tags?.includes(activeFilter))
        }

        return result
    }, [filteredCourses, activeFilter])

    function toggleViewMode() {
        updateSettings({ viewMode: viewMode === 'grid' ? 'list' : 'grid' })
    }

    // Handle import confirmation - save course to database
    async function handleImportConfirm(editedData) {
        try {
            console.log('Saving course to database:', editedData)

            const courseData = {
                ...importData,
                title: editedData.title,
                instructor: editedData.instructor,
                thumbnailData: editedData.thumbnailData,
            }

            const savedCourse = await addCourse(courseData)
            console.log('Course saved:', savedCourse.id)

            for (let i = 0; i < editedData.modules.length; i++) {
                const module = editedData.modules[i]
                const savedModule = await addModule({
                    courseId: savedCourse.id,
                    title: module.title,
                    originalTitle: module.originalTitle,
                    order: i,
                    totalDuration: module.totalDuration,
                    totalVideos: module.videos?.length || 0
                })

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
                        order: j,
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

    // These handlers are passed from App via Header
    // Exposed for Header callbacks
    window.__homePageHandlers = {
        handleImportData: (data) => {
            if (data) {
                const dupe = courses.find(c => c.title === data.title || c.originalTitle === data.title)
                if (dupe) {
                    if (!confirm(`A course named "${data.title}" already exists. Import anyway?`)) return
                }
                setImportData(data)
            }
        },
        handleYouTubeImport: async (courseData) => {
            try {
                const dupe = courses.find(c => c.title === courseData.title)
                if (dupe) {
                    if (!confirm(`A course named "${courseData.title}" already exists. Import anyway?`)) return
                }

                if (courseData.instructor && courseData.channelAvatar) {
                    await setInstructorAvatar(courseData.instructor, courseData.channelAvatar)
                }

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
                            order: i
                        })
                    }
                }

                loadCourses()
            } catch (err) {
                console.error('Failed to save YouTube course:', err)
                alert('Failed to save: ' + err.message)
            }
        },
        handleGoogleDriveImport: async (courseData) => {
            try {
                const dupe = courses.find(c => c.title === courseData.title)
                if (dupe) {
                    if (!confirm(`A course named "${courseData.title}" already exists. Import anyway?`)) return
                }

                const savedCourse = await addCourse({
                    title: courseData.title,
                    instructor: courseData.instructor || '',
                    description: courseData.description || 'Imported from Google Drive',
                    thumbnailData: courseData.thumbnailData,
                    totalDuration: courseData.totalDuration,
                    totalVideos: courseData.totalVideos
                })

                for (let i = 0; i < courseData.modules.length; i++) {
                    const module = courseData.modules[i]
                    const savedModule = await addModule({
                        courseId: savedCourse.id,
                        title: module.title,
                        originalTitle: module.originalTitle,
                        order: i,
                        totalDuration: module.totalDuration,
                        totalVideos: module.totalVideos
                    })

                    for (let j = 0; j < module.videos.length; j++) {
                        const video = module.videos[j]
                        await addVideo({
                            courseId: savedCourse.id,
                            moduleId: savedModule.id,
                            title: video.title,
                            originalTitle: video.originalTitle,
                            driveFileId: video.driveFileId,
                            url: getDriveVideoUrl(video.driveFileId),
                            duration: video.duration || 0,
                            order: j
                        })
                    }
                }

                loadCourses()
            } catch (err) {
                console.error('Failed to save Google Drive course:', err)
                alert('Failed to save: ' + err.message)
            }
        },
        loadCourses
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
            {/* Filter Tabs + Sort/View Controls */}
            {courses.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    {/* Filter Tabs */}
                    <div className="overflow-x-auto scrollbar-hide flex-1">
                        <div className="flex gap-2">
                            {['all', 'completed', 'in-progress', 'not-started'].map(filter => (
                                <button
                                    key={filter}
                                    onClick={() => setActiveFilter(filter)}
                                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFilter === filter
                                        ? 'bg-gray-900 dark:bg-white/10 text-white'
                                        : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                                        }`}
                                >
                                    {filter === 'all' ? 'All' :
                                        filter === 'completed' ? 'Completed' :
                                            filter === 'in-progress' ? 'In Progress' :
                                                'Not Started'}
                                </button>
                            ))}
                            {allTags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => setActiveFilter(tag)}
                                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFilter === tag
                                        ? 'bg-gray-900 dark:bg-white/10 text-white'
                                        : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                                        }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sort + View Toggle */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Sort Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowSortMenu(!showSortMenu)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-bg transition-colors text-sm"
                            >
                                <SortAsc className="w-4 h-4" />
                                <span className="hidden sm:inline">{sortOptions.find(o => o.value === sortBy)?.label}</span>
                                <ChevronDown className="w-3 h-3" />
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
                                                className={`w-full px-4 py-2 text-left text-sm hover:bg-light-surface dark:hover:bg-dark-bg ${sortBy === option.value ? 'text-primary font-medium' : ''}`}
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
                            className="p-1.5 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            aria-label="Toggle view mode"
                        >
                            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
                        </button>
                    </div>
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
                    <FolderOpen className="w-16 h-16 mx-auto mb-4 text-neutral-500 opacity-50" />
                    <h2 className="text-xl font-semibold mb-2 text-white">No courses yet</h2>
                    <p className="text-neutral-400 mb-6">
                        Click "Add Course" in the header to get started
                    </p>
                </div>
            ) : (
                <div className="text-center py-16">
                    <Search className="w-16 h-16 mx-auto mb-4 text-neutral-500 opacity-50" />
                    <h2 className="text-xl font-semibold mb-2 text-white">No results found</h2>
                    <p className="text-neutral-400 mb-6">
                        Try adjusting your search or filters
                    </p>
                    <button
                        onClick={() => {
                            setSearchQuery('')
                            setActiveFilter('all')
                        }}
                        className="text-primary hover:underline"
                    >
                        Clear search and filters
                    </button>
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
        </div>
    )
}

export default HomePage
