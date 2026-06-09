import * as api from './api.js'

/**
 * Roadmap Database (v4 Server-Only)
 * 
 * In v4, roadmaps are stored in the TutIn Companion Server (SQLite).
 * LocalStorage fallback has been removed.
 */

export async function getRoadmaps() {
    return api.get('/api/roadmaps')
}

export async function addRoadmap(roadmap) {
    return api.post('/api/roadmaps', roadmap)
}

export async function updateRoadmap(roadmap) {
    return api.put(`/api/roadmaps/${roadmap.id}`, roadmap)
}

export async function deleteRoadmap(id) {
    return api.del(`/api/roadmaps/${id}`)
}
