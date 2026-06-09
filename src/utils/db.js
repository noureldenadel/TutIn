import * as api from './api.js'

/**
 * TutIn Database — Server-only API client (v4)
 * 
 * All data operations go through the TutIn Companion Server (SQLite).
 */

/**
 * Generate a unique ID
 */
export function generateId(prefix = '') {
    return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ============= COURSE OPERATIONS =============

export async function addCourse(courseData) {
    return api.post(`/api/courses`, { id: generateId('course_'), ...courseData })
}

export async function getCourse(courseId) {
    return api.get(`/api/courses/${courseId}`)
}

export async function getAllCourses() {
    return api.get(`/api/courses`)
}

export async function updateCourse(courseId, updates) {
    return api.put(`/api/courses/${courseId}`, updates)
}

export async function deleteCourse(courseId) {
    return api.del(`/api/courses/${courseId}`)
}

export async function updateCoursesOrder(updates) {
    return api.put(`/api/courses/reorder`, { updates })
}

// ============= MODULE OPERATIONS =============

export async function addModule(moduleData) {
    return api.post(`/api/modules`, { id: generateId('module_'), ...moduleData })
}

export function buildModuleTree(flatModules) {
    const byId = new Map(flatModules.map(m => [m.id, { ...m, subModules: [] }]))
    const roots = []

    for (const mod of byId.values()) {
        if (mod.parentModuleId && byId.has(mod.parentModuleId)) {
            byId.get(mod.parentModuleId).subModules.push(mod)
        } else {
            roots.push(mod)
        }
    }

    return roots
}

export async function getModulesByCourse(courseId) {
    return api.get(`/api/modules/by-course/${courseId}`)
}

export async function updateModule(moduleId, updates) {
    return api.put(`/api/modules/${moduleId}`, updates)
}

export async function deleteModule(moduleId) {
    return api.del(`/api/modules/${moduleId}`)
}

// ============= VIDEO OPERATIONS =============

export async function addVideo(videoData) {
    return api.post(`/api/videos`, { id: generateId('video_'), ...videoData })
}

export async function getVideo(videoId) {
    return api.get(`/api/videos/${videoId}`)
}

export async function getVideosByCourse(courseId) {
    return api.get(`/api/videos/by-course/${courseId}`)
}

export async function getVideosByModule(moduleId) {
    return api.get(`/api/videos/by-module/${moduleId}`)
}

export async function updateVideoProgress(videoId, currentTime, duration) {
    const watchProgress = duration > 0 ? currentTime / duration : 0
    return api.put(`/api/videos/${videoId}/progress`, {
        watchProgress,
        lastWatchedPosition: currentTime
    })
}

export async function markVideoComplete(videoId, isCompleted = true) {
    return api.post(`/api/videos/${videoId}/complete`, { isCompleted })
}

export async function updateVideo(videoId, updates) {
    return api.put(`/api/videos/${videoId}`, updates)
}

export async function deleteVideo(videoId) {
    return api.del(`/api/videos/${videoId}`)
}

export async function toggleVideoFavorite(videoId) {
    const video = await getVideo(videoId)
    if (!video) throw new Error('Video not found')
    return api.post(`/api/videos/${videoId}/favorite`, { isFavorite: !video.isFavorite })
}

// ============= NOTE OPERATIONS =============

export async function addNote(noteData) {
    return api.post(`/api/notes`, { id: generateId('note_'), ...noteData })
}

export async function getNotesByVideo(videoId) {
    return api.get(`/api/notes/by-video/${videoId}`)
}

export async function getNotesByCourse(courseId) {
    return api.get(`/api/notes/by-course/${courseId}`)
}

export async function updateNote(noteId, updates) {
    return api.put(`/api/notes/${noteId}`, updates)
}

export async function deleteNote(noteId) {
    return api.del(`/api/notes/${noteId}`)
}

export async function deleteNotesByVideo(videoId) {
    try {
        await api.del(`/api/notes/by-video/${videoId}`)
        return 1
    } catch {
        return 0
    }
}

// ============= INSTRUCTOR OPERATIONS =============

function normalizeInstructorName(name) {
    if (!name) return ''
    return name.toLowerCase().trim().replace(/\s+/g, '_')
}

const avatarCache = new Map()
const pendingAvatarRequests = new Map()

export async function getInstructorAvatarAsync(instructorName) {
    if (!instructorName) return null
    const normalizedName = normalizeInstructorName(instructorName)

    if (avatarCache.has(normalizedName)) {
        return avatarCache.get(normalizedName)
    }

    if (pendingAvatarRequests.has(normalizedName)) {
        return pendingAvatarRequests.get(normalizedName)
    }

    const request = (async () => {
        try {
            const instructor = await api.get(`/api/instructors/instructor_${normalizedName}`)
            const avatar = instructor?.avatarData || null
            if (avatar) avatarCache.set(normalizedName, avatar)
            return avatar
        } catch {
            return null
        } finally {
            pendingAvatarRequests.delete(normalizedName)
        }
    })()

    pendingAvatarRequests.set(normalizedName, request)
    return request
}

export function getInstructorAvatar(instructorName) {
    if (!instructorName) return null
    const normalizedName = normalizeInstructorName(instructorName)

    if (avatarCache.has(normalizedName)) {
        return avatarCache.get(normalizedName)
    }

    getInstructorAvatarAsync(instructorName).then(avatar => {
        if (avatar) {
            avatarCache.set(normalizedName, avatar)
        }
    })

    return null
}

export async function setInstructorAvatar(instructorName, avatarData) {
    if (!instructorName) return false
    const normalizedName = normalizeInstructorName(instructorName)

    try {
        await api.post('/api/instructors', {
            id: `instructor_${normalizedName}`,
            name: normalizedName,
            displayName: instructorName,
            avatarData: avatarData
        })
        avatarCache.set(normalizedName, avatarData)
        return true
    } catch {
        try {
            await api.put(`/api/instructors/instructor_${normalizedName}`, {
                avatarData: avatarData
            })
            avatarCache.set(normalizedName, avatarData)
            return true
        } catch {
            return false
        }
    }
}

export async function removeInstructorAvatar(instructorName) {
    if (!instructorName) return
    const normalizedName = normalizeInstructorName(instructorName)

    try {
        await api.del(`/api/instructors/instructor_${normalizedName}`)
        avatarCache.delete(normalizedName)
        return true
    } catch {
        return false
    }
}

export async function getCoursesByInstructor(instructorName) {
    if (!instructorName) return []
    return api.get(`/api/courses?instructor=${encodeURIComponent(instructorName)}`)
}

// ============= DATA MANAGEMENT =============

export async function clearAllData() {
    return api.del('/api/data/reset')
}

export async function exportAllData() {
    return api.get('/api/data/export')
}

export async function importData(data) {
    return api.post('/api/data/import', data)
}

export async function recalculateAllCoursesProgress(mode) {
    return api.post('/api/courses/recalculate-progress', { mode })
}

export async function detectAllDurations() {
    return api.post('/api/data/detect-durations')
}

export async function getRecentlyWatchedVideos(limit = 10) {
    return api.get(`/api/analytics/history?limit=${limit}`)
}

// ============= UTILITIES =============

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

export function parseISODuration(duration) {
    if (!duration) return 0
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/)
    if (!match) return 0

    const hours = (parseInt(match[1]) || 0)
    const minutes = (parseInt(match[2]) || 0)
    const seconds = (parseInt(match[3]) || 0)

    return hours * 3600 + minutes * 60 + seconds
}

