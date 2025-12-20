/**
 * MEARN Database - IndexedDB wrapper for course management
 * 
 * Stores:
 * - courses: Course metadata and settings
 * - modules: Module information grouped by course
 * - videos: Video information with progress tracking
 * - notes: Timestamped notes for videos
 * - analytics: Daily learning statistics
 * - settings: User preferences (fallback to localStorage)
 */

const DB_NAME = 'mearn_db'
const DB_VERSION = 3  // Upgraded to add course order index

// Database instance singleton
let dbInstance = null

/**
 * Initialize and return the database connection
 */
export async function initDatabase() {
    if (dbInstance) return dbInstance

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onerror = () => {
            reject(new Error('Failed to open database: ' + request.error))
        }

        request.onsuccess = () => {
            dbInstance = request.result
            resolve(dbInstance)
        }

        request.onupgradeneeded = (event) => {
            const db = event.target.result

            // Courses store
            if (!db.objectStoreNames.contains('courses')) {
                const coursesStore = db.createObjectStore('courses', { keyPath: 'id' })
                coursesStore.createIndex('title', 'title', { unique: false })
                coursesStore.createIndex('lastAccessed', 'lastAccessed', { unique: false })
                coursesStore.createIndex('dateAdded', 'dateAdded', { unique: false })
                coursesStore.createIndex('order', 'order', { unique: false })
            } else {
                // Version 3 upgrade: Add order index to existing store
                const txn = event.target.transaction
                const coursesStore = txn.objectStore('courses')
                if (!coursesStore.indexNames.contains('order')) {
                    coursesStore.createIndex('order', 'order', { unique: false })
                }
            }

            // Modules store
            if (!db.objectStoreNames.contains('modules')) {
                const modulesStore = db.createObjectStore('modules', { keyPath: 'id' })
                modulesStore.createIndex('courseId', 'courseId', { unique: false })
                modulesStore.createIndex('order', 'order', { unique: false })
            }

            // Videos store
            if (!db.objectStoreNames.contains('videos')) {
                const videosStore = db.createObjectStore('videos', { keyPath: 'id' })
                videosStore.createIndex('courseId', 'courseId', { unique: false })
                videosStore.createIndex('moduleId', 'moduleId', { unique: false })
                videosStore.createIndex('isCompleted', 'isCompleted', { unique: false })
                videosStore.createIndex('lastWatchedAt', 'lastWatchedAt', { unique: false })
            }

            // Notes store
            if (!db.objectStoreNames.contains('notes')) {
                const notesStore = db.createObjectStore('notes', { keyPath: 'id' })
                notesStore.createIndex('videoId', 'videoId', { unique: false })
                notesStore.createIndex('courseId', 'courseId', { unique: false })
                notesStore.createIndex('timestamp', 'timestamp', { unique: false })
            }

            // Analytics store
            if (!db.objectStoreNames.contains('analytics')) {
                const analyticsStore = db.createObjectStore('analytics', { keyPath: 'id' })
                analyticsStore.createIndex('date', 'date', { unique: true })
            }

            // Instructors store (for avatar storage)
            if (!db.objectStoreNames.contains('instructors')) {
                const instructorsStore = db.createObjectStore('instructors', { keyPath: 'id' })
                instructorsStore.createIndex('name', 'name', { unique: true })
            }
        }
    })
}

/**
 * Generate a unique ID
 */
export function generateId(prefix = '') {
    return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ============= COURSE OPERATIONS =============

/**
 * Add a new course
 */
export async function addCourse(courseData) {
    const db = await initDatabase()
    const course = {
        id: generateId('course_'),
        title: courseData.title || 'Untitled Course',
        originalTitle: courseData.originalTitle || courseData.title,
        description: courseData.description || '',
        instructor: courseData.instructor || '',
        category: courseData.category || 'Uncategorized',
        difficulty: courseData.difficulty || 'intermediate',
        tags: courseData.tags || [],
        thumbnailData: courseData.thumbnailData || null,
        folderHandle: courseData.folderHandle || null,
        dateAdded: new Date().toISOString(),
        dateModified: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        totalDuration: courseData.totalDuration || 0,
        totalVideos: courseData.totalVideos || 0,
        completedVideos: 0,
        completionPercentage: 0,
        customMetadata: courseData.customMetadata || {},
        settings: {
            autoPlayNext: true,
            defaultSpeed: 1.0,
            ...courseData.settings
        }
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['courses'], 'readwrite')
        const store = transaction.objectStore('courses')
        const request = store.add(course)

        request.onsuccess = () => resolve(course)
        request.onerror = () => reject(new Error('Failed to add course: ' + request.error))
    })
}

/**
 * Get a course by ID
 */
export async function getCourse(courseId) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['courses'], 'readonly')
        const store = transaction.objectStore('courses')
        const request = store.get(courseId)

        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => reject(new Error('Failed to get course: ' + request.error))
    })
}

/**
 * Get all courses
 */
export async function getAllCourses() {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['courses'], 'readonly')
        const store = transaction.objectStore('courses')
        const request = store.getAll()

        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(new Error('Failed to get courses: ' + request.error))
    })
}

/**
 * Update a course
 */
export async function updateCourse(courseId, updates) {
    const db = await initDatabase()
    const course = await getCourse(courseId)

    if (!course) {
        throw new Error('Course not found')
    }

    const updatedCourse = {
        ...course,
        ...updates,
        dateModified: new Date().toISOString()
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['courses'], 'readwrite')
        const store = transaction.objectStore('courses')
        const request = store.put(updatedCourse)

        request.onsuccess = () => resolve(updatedCourse)
        request.onerror = () => reject(new Error('Failed to update course: ' + request.error))
    })
}

/**
 * Delete a course and all its modules and videos
 */
export async function deleteCourse(courseId) {
    const db = await initDatabase()

    // Delete all videos for this course
    const videos = await getVideosByCourse(courseId)
    for (const video of videos) {
        await deleteVideo(video.id)
    }

    // Delete all modules for this course
    const modules = await getModulesByCourse(courseId)
    for (const module of modules) {
        await deleteModule(module.id)
    }

    // Delete the course
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['courses'], 'readwrite')
        const store = transaction.objectStore('courses')
        const request = store.delete(courseId)

        request.onsuccess = () => resolve(true)
        request.onerror = () => reject(new Error('Failed to delete course: ' + request.error))
    })
}

// ============= MODULE OPERATIONS =============

/**
 * Add a new module
 */
export async function addModule(moduleData) {
    const db = await initDatabase()
    const module = {
        id: generateId('module_'),
        courseId: moduleData.courseId,
        title: moduleData.title || 'Untitled Module',
        originalTitle: moduleData.originalTitle || moduleData.title,
        description: moduleData.description || '',
        thumbnailData: moduleData.thumbnailData || null,
        order: moduleData.order || 0,
        folderHandle: moduleData.folderHandle || null,
        totalDuration: moduleData.totalDuration || 0,
        totalVideos: moduleData.totalVideos || 0,
        completedVideos: 0,
        dateAdded: new Date().toISOString()
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['modules'], 'readwrite')
        const store = transaction.objectStore('modules')
        const request = store.add(module)

        request.onsuccess = () => resolve(module)
        request.onerror = () => reject(new Error('Failed to add module: ' + request.error))
    })
}

/**
 * Get modules by course ID
 */
export async function getModulesByCourse(courseId) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['modules'], 'readonly')
        const store = transaction.objectStore('modules')
        const index = store.index('courseId')
        const request = index.getAll(courseId)

        request.onsuccess = () => {
            const modules = request.result || []
            // Sort by order
            modules.sort((a, b) => a.order - b.order)
            resolve(modules)
        }
        request.onerror = () => reject(new Error('Failed to get modules: ' + request.error))
    })
}

/**
 * Update a module
 */
export async function updateModule(moduleId, updates) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['modules'], 'readwrite')
        const store = transaction.objectStore('modules')
        const getRequest = store.get(moduleId)

        getRequest.onsuccess = () => {
            const module = getRequest.result
            if (!module) {
                reject(new Error('Module not found'))
                return
            }

            const updatedModule = { ...module, ...updates }
            const putRequest = store.put(updatedModule)

            putRequest.onsuccess = () => resolve(updatedModule)
            putRequest.onerror = () => reject(new Error('Failed to update module: ' + putRequest.error))
        }
        getRequest.onerror = () => reject(new Error('Failed to get module: ' + getRequest.error))
    })
}

/**
 * Delete a module
 */
export async function deleteModule(moduleId) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['modules'], 'readwrite')
        const store = transaction.objectStore('modules')
        const request = store.delete(moduleId)

        request.onsuccess = () => resolve(true)
        request.onerror = () => reject(new Error('Failed to delete module: ' + request.error))
    })
}

// ============= VIDEO OPERATIONS =============

/**
 * Add a new video
 */
export async function addVideo(videoData) {
    const db = await initDatabase()
    const video = {
        id: generateId('video_'),
        courseId: videoData.courseId,
        moduleId: videoData.moduleId,
        title: videoData.title || 'Untitled Video',
        originalTitle: videoData.originalTitle || videoData.title,
        description: videoData.description || '',
        fileName: videoData.fileName || '',
        fileHandle: videoData.fileHandle || null,
        fileSize: videoData.fileSize || 0,
        duration: videoData.duration || 0,
        thumbnailData: videoData.thumbnailData || null,
        order: videoData.order || 0,
        isRequired: videoData.isRequired !== false,
        isCompleted: false,
        watchProgress: 0,
        lastWatchedPosition: 0,
        lastWatchedAt: null,
        completedAt: null,
        watchCount: 0,
        tags: videoData.tags || [],
        bookmarks: [],
        youtubeId: videoData.youtubeId || null,
        url: videoData.url || null
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['videos'], 'readwrite')
        const store = transaction.objectStore('videos')
        const request = store.add(video)

        request.onsuccess = () => resolve(video)
        request.onerror = () => reject(new Error('Failed to add video: ' + request.error))
    })
}

/**
 * Get a video by ID
 */
export async function getVideo(videoId) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['videos'], 'readonly')
        const store = transaction.objectStore('videos')
        const request = store.get(videoId)

        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => reject(new Error('Failed to get video: ' + request.error))
    })
}

/**
 * Get videos by course ID
 */
export async function getVideosByCourse(courseId) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['videos'], 'readonly')
        const store = transaction.objectStore('videos')
        const index = store.index('courseId')
        const request = index.getAll(courseId)

        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(new Error('Failed to get videos: ' + request.error))
    })
}

/**
 * Get videos by module ID
 */
export async function getVideosByModule(moduleId) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['videos'], 'readonly')
        const store = transaction.objectStore('videos')
        const index = store.index('moduleId')
        const request = index.getAll(moduleId)

        request.onsuccess = () => {
            const videos = request.result || []
            // Sort by order
            videos.sort((a, b) => a.order - b.order)
            resolve(videos)
        }
        request.onerror = () => reject(new Error('Failed to get videos: ' + request.error))
    })
}

/**
 * Update video progress
 */
export async function updateVideoProgress(videoId, currentTime, duration) {
    const video = await getVideo(videoId)
    if (!video) {
        throw new Error('Video not found')
    }

    const watchProgress = duration > 0 ? currentTime / duration : 0

    const updates = {
        watchProgress,
        lastWatchedPosition: currentTime,
        lastWatchedAt: new Date().toISOString(),
        watchCount: video.watchCount + (video.lastWatchedPosition === 0 ? 1 : 0)
    }

    return updateVideo(videoId, updates)
}

/**
 * Mark video as complete
 */
export async function markVideoComplete(videoId, isCompleted = true) {
    const updates = {
        isCompleted,
        completedAt: isCompleted ? new Date().toISOString() : null,
        watchProgress: isCompleted ? 1 : undefined
    }

    const video = await updateVideo(videoId, updates)

    // Update course and module completion counts
    await recalculateCourseProgress(video.courseId)

    return video
}

/**
 * Update a video
 */
export async function updateVideo(videoId, updates) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['videos'], 'readwrite')
        const store = transaction.objectStore('videos')
        const getRequest = store.get(videoId)

        getRequest.onsuccess = () => {
            const video = getRequest.result
            if (!video) {
                reject(new Error('Video not found'))
                return
            }

            const updatedVideo = { ...video, ...updates }
            const putRequest = store.put(updatedVideo)

            putRequest.onsuccess = () => resolve(updatedVideo)
            putRequest.onerror = () => reject(new Error('Failed to update video: ' + putRequest.error))
        }
        getRequest.onerror = () => reject(new Error('Failed to get video: ' + getRequest.error))
    })
}

/**
 * Delete a video
 */
export async function deleteVideo(videoId) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['videos'], 'readwrite')
        const store = transaction.objectStore('videos')
        const request = store.delete(videoId)

        request.onsuccess = () => resolve(true)
        request.onerror = () => reject(new Error('Failed to delete video: ' + request.error))
    })
}

/**
 * Recalculate course progress based on video completion
 */
export async function recalculateCourseProgress(courseId) {
    const videos = await getVideosByCourse(courseId)
    const modules = await getModulesByCourse(courseId)

    const totalVideos = videos.length
    const completedVideos = videos.filter(v => v.isCompleted).length
    const completionPercentage = totalVideos > 0 ? (completedVideos / totalVideos) * 100 : 0
    const totalDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0)

    // Update course
    await updateCourse(courseId, {
        totalVideos,
        completedVideos,
        completionPercentage,
        totalDuration
    })

    // Update each module
    for (const module of modules) {
        const moduleVideos = videos.filter(v => v.moduleId === module.id)
        const moduleTotalVideos = moduleVideos.length
        const moduleCompletedVideos = moduleVideos.filter(v => v.isCompleted).length
        const moduleTotalDuration = moduleVideos.reduce((sum, v) => sum + (v.duration || 0), 0)

        await updateModule(module.id, {
            totalVideos: moduleTotalVideos,
            completedVideos: moduleCompletedVideos,
            totalDuration: moduleTotalDuration
        })
    }
}

// ============= RECENTLY WATCHED =============

/**
 * Get recently watched videos with course info
 */
export async function getRecentlyWatchedVideos(limit = 10) {
    const db = await initDatabase()

    return new Promise(async (resolve, reject) => {
        try {
            const transaction = db.transaction(['videos', 'courses'], 'readonly')
            const videosStore = transaction.objectStore('videos')
            const coursesStore = transaction.objectStore('courses')

            // Get all videos with lastWatchedAt
            const videosRequest = videosStore.getAll()

            videosRequest.onsuccess = async () => {
                const videos = videosRequest.result || []

                // Filter and sort by lastWatchedAt
                const watchedVideos = videos
                    .filter(v => v.lastWatchedAt && v.watchProgress > 0)
                    .sort((a, b) => new Date(b.lastWatchedAt) - new Date(a.lastWatchedAt))
                    .slice(0, limit)

                // Get course info for each video
                const results = []
                for (const video of watchedVideos) {
                    const courseRequest = coursesStore.get(video.courseId)
                    const course = await new Promise((res) => {
                        courseRequest.onsuccess = () => res(courseRequest.result)
                        courseRequest.onerror = () => res(null)
                    })

                    if (course) {
                        results.push({ video, course })
                    }
                }

                resolve(results)
            }

            videosRequest.onerror = () => {
                reject(new Error('Failed to get videos: ' + videosRequest.error))
            }
        } catch (err) {
            reject(err)
        }
    })
}

// ============= UTILITY FUNCTIONS =============

/**
 * Format duration in seconds to HH:MM:SS
 */
export function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0:00'

    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Export all database data
 */
export async function exportAllData() {
    const courses = await getAllCourses()
    const allModules = []
    const allVideos = []
    const allNotes = []

    for (const course of courses) {
        const modules = await getModulesByCourse(course.id)
        allModules.push(...modules)

        const videos = await getVideosByCourse(course.id)
        allVideos.push(...videos)

        // Get notes for each video in this course
        for (const video of videos) {
            const notes = await getNotesByVideo(video.id)
            allNotes.push(...notes)
        }
    }

    return {
        version: DB_VERSION,
        exportDate: new Date().toISOString(),
        courses,
        modules: allModules,
        videos: allVideos,
        notes: allNotes
    }
}


/**
 * Clear all data from database
 */
export async function clearAllData() {
    const db = await initDatabase()
    const storeNames = ['courses', 'modules', 'videos', 'notes', 'analytics']

    for (const storeName of storeNames) {
        await new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite')
            const store = transaction.objectStore(storeName)
            const request = store.clear()

            request.onsuccess = () => resolve()
            request.onerror = () => reject(new Error(`Failed to clear ${storeName}: ` + request.error))
        })
    }

    return true
}

/**
 * Import data from backup file
 */
export async function importData(data) {
    const db = await initDatabase()

    if (!data || typeof data !== 'object') {
        throw new Error('Invalid backup file format')
    }

    // Import courses
    if (data.courses && Array.isArray(data.courses)) {
        for (const course of data.courses) {
            await new Promise((resolve, reject) => {
                const transaction = db.transaction(['courses'], 'readwrite')
                const store = transaction.objectStore('courses')
                const request = store.put(course)
                request.onsuccess = () => resolve()
                request.onerror = () => reject(new Error('Failed to import course'))
            })
        }
    }

    // Import modules
    if (data.modules && Array.isArray(data.modules)) {
        for (const module of data.modules) {
            await new Promise((resolve, reject) => {
                const transaction = db.transaction(['modules'], 'readwrite')
                const store = transaction.objectStore('modules')
                const request = store.put(module)
                request.onsuccess = () => resolve()
                request.onerror = () => reject(new Error('Failed to import module'))
            })
        }
    }

    // Import videos
    if (data.videos && Array.isArray(data.videos)) {
        for (const video of data.videos) {
            await new Promise((resolve, reject) => {
                const transaction = db.transaction(['videos'], 'readwrite')
                const store = transaction.objectStore('videos')
                const request = store.put(video)
                request.onsuccess = () => resolve()
                request.onerror = () => reject(new Error('Failed to import video'))
            })
        }
    }

    // Import notes
    if (data.notes && Array.isArray(data.notes)) {
        for (const note of data.notes) {
            await new Promise((resolve, reject) => {
                const transaction = db.transaction(['notes'], 'readwrite')
                const store = transaction.objectStore('notes')
                const request = store.put(note)
                request.onsuccess = () => resolve()
                request.onerror = () => reject(new Error('Failed to import note'))
            })
        }
    }

    return true
}


// ============================================
// NOTES OPERATIONS
// ============================================

/**
 * Add a note for a video at a specific timestamp
 */
export async function addNote(noteData) {
    const db = await initDatabase()

    const note = {
        id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        videoId: noteData.videoId,
        courseId: noteData.courseId,
        timestamp: noteData.timestamp || 0,
        content: noteData.content || '',
        tags: noteData.tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['notes'], 'readwrite')
        const store = transaction.objectStore('notes')
        const request = store.add(note)

        request.onsuccess = () => resolve(note)
        request.onerror = () => reject(new Error('Failed to add note: ' + request.error))
    })
}

/**
 * Get all notes for a video
 */
export async function getNotesByVideo(videoId) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['notes'], 'readonly')
        const store = transaction.objectStore('notes')
        const index = store.index('videoId')
        const request = index.getAll(videoId)

        request.onsuccess = () => {
            const notes = request.result || []
            // Sort by timestamp
            notes.sort((a, b) => a.timestamp - b.timestamp)
            resolve(notes)
        }
        request.onerror = () => reject(new Error('Failed to get notes: ' + request.error))
    })
}

/**
 * Get all notes for a course
 */
export async function getNotesByCourse(courseId) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['notes'], 'readonly')
        const store = transaction.objectStore('notes')
        const index = store.index('courseId')
        const request = index.getAll(courseId)

        request.onsuccess = () => {
            const notes = request.result || []
            notes.sort((a, b) => a.timestamp - b.timestamp)
            resolve(notes)
        }
        request.onerror = () => reject(new Error('Failed to get notes: ' + request.error))
    })
}

/**
 * Update a note
 */
export async function updateNote(noteId, updates) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['notes'], 'readwrite')
        const store = transaction.objectStore('notes')
        const getRequest = store.get(noteId)

        getRequest.onsuccess = () => {
            const note = getRequest.result
            if (!note) {
                reject(new Error('Note not found'))
                return
            }

            const updatedNote = {
                ...note,
                ...updates,
                updatedAt: new Date().toISOString()
            }

            const putRequest = store.put(updatedNote)
            putRequest.onsuccess = () => resolve(updatedNote)
            putRequest.onerror = () => reject(new Error('Failed to update note: ' + putRequest.error))
        }
        getRequest.onerror = () => reject(new Error('Failed to find note: ' + getRequest.error))
    })
}

/**
 * Delete a note
 */
export async function deleteNote(noteId) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['notes'], 'readwrite')
        const store = transaction.objectStore('notes')
        const request = store.delete(noteId)

        request.onsuccess = () => resolve(true)
        request.onerror = () => reject(new Error('Failed to delete note: ' + request.error))
    })
}

/**
 * Get note count for a video
 */
export async function getNoteCountByVideo(videoId) {
    const notes = await getNotesByVideo(videoId)
    return notes.length
}

// ============================================
// BOOKMARKS/FAVORITES OPERATIONS
// ============================================

/**
 * Toggle favorite status for a video
 */
export async function toggleVideoFavorite(videoId) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['videos'], 'readwrite')
        const store = transaction.objectStore('videos')
        const getRequest = store.get(videoId)

        getRequest.onsuccess = () => {
            const video = getRequest.result
            if (!video) {
                reject(new Error('Video not found'))
                return
            }

            const updatedVideo = {
                ...video,
                isFavorite: !video.isFavorite,
                updatedAt: new Date().toISOString()
            }

            const putRequest = store.put(updatedVideo)
            putRequest.onsuccess = () => resolve(updatedVideo)
            putRequest.onerror = () => reject(new Error('Failed to toggle favorite: ' + putRequest.error))
        }
        getRequest.onerror = () => reject(new Error('Failed to find video: ' + getRequest.error))
    })
}

// ============================================
// INSTRUCTOR OPERATIONS
// ============================================

/**
 * Normalize instructor name for storage key
 */
function normalizeInstructorName(name) {
    if (!name) return ''
    return name.toLowerCase().trim().replace(/\s+/g, '_')
}

/**
 * Get instructor avatar from IndexedDB
 */
export async function getInstructorAvatarAsync(instructorName) {
    if (!instructorName) return null
    const db = await initDatabase()
    const normalizedName = normalizeInstructorName(instructorName)

    return new Promise((resolve) => {
        const transaction = db.transaction(['instructors'], 'readonly')
        const store = transaction.objectStore('instructors')
        const index = store.index('name')
        const request = index.get(normalizedName)

        request.onsuccess = () => {
            resolve(request.result?.avatarData || null)
        }
        request.onerror = () => {
            console.error('Failed to get instructor avatar:', request.error)
            resolve(null)
        }
    })
}

/**
 * Synchronous wrapper - returns cached value or null (for initial render)
 * Use getInstructorAvatarAsync for reliable async access
 */
const avatarCache = new Map()

export function getInstructorAvatar(instructorName) {
    if (!instructorName) return null
    const normalizedName = normalizeInstructorName(instructorName)

    // Return cached value if available
    if (avatarCache.has(normalizedName)) {
        return avatarCache.get(normalizedName)
    }

    // Trigger async load for next render
    getInstructorAvatarAsync(instructorName).then(avatar => {
        if (avatar) {
            avatarCache.set(normalizedName, avatar)
        }
    })

    return null
}

/**
 * Set instructor avatar in IndexedDB
 * @param {string} instructorName - Instructor name
 * @param {string} avatarData - Base64 encoded image data
 */
export async function setInstructorAvatar(instructorName, avatarData) {
    if (!instructorName) return false
    const db = await initDatabase()
    const normalizedName = normalizeInstructorName(instructorName)

    return new Promise((resolve) => {
        const transaction = db.transaction(['instructors'], 'readwrite')
        const store = transaction.objectStore('instructors')

        const instructor = {
            id: `instructor_${normalizedName}`,
            name: normalizedName,
            displayName: instructorName,
            avatarData: avatarData,
            updatedAt: new Date().toISOString()
        }

        const request = store.put(instructor)
        request.onsuccess = () => {
            // Update cache
            avatarCache.set(normalizedName, avatarData)
            resolve(true)
        }
        request.onerror = () => {
            console.error('Failed to save instructor avatar:', request.error)
            resolve(false)
        }
    })
}

/**
 * Remove instructor avatar from IndexedDB
 */
export async function removeInstructorAvatar(instructorName) {
    if (!instructorName) return
    const db = await initDatabase()
    const normalizedName = normalizeInstructorName(instructorName)

    return new Promise((resolve) => {
        const transaction = db.transaction(['instructors'], 'readwrite')
        const store = transaction.objectStore('instructors')
        const request = store.delete(`instructor_${normalizedName}`)

        request.onsuccess = () => {
            // Clear cache
            avatarCache.delete(normalizedName)
            resolve(true)
        }
        request.onerror = () => {
            console.error('Failed to remove instructor avatar:', request.error)
            resolve(false)
        }
    })
}

/**
 * Get all courses by a specific instructor
 */
export async function getCoursesByInstructor(instructorName) {
    if (!instructorName) return []
    const courses = await getAllCourses()
    const normalizedName = instructorName.toLowerCase().trim()
    return courses.filter(course =>
        course.instructor?.toLowerCase().trim() === normalizedName
    )
}


/**
 * Batch update course orders
 * @param {Array<{id: string, order: number}>} updates 
 */
export async function updateCoursesOrder(updates) {
    const db = await initDatabase()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['courses'], 'readwrite')
        const store = transaction.objectStore('courses')

        transaction.oncomplete = () => resolve(true)
        transaction.onerror = () => reject(transaction.error)

        updates.forEach(({ id, order }) => {
            const getRequest = store.get(id)
            getRequest.onsuccess = () => {
                const course = getRequest.result
                if (course) {
                    course.order = order
                    store.put(course)
                }
            }
        })
    })
}
