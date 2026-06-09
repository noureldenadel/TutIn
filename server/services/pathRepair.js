/**
 * TutIn Server — Path Repair Service
 * 
 * Automatically backfills file_path and folder_path for courses and videos
 * that were migrated from IndexedDB (browser) and are missing filesystem paths.
 * 
 * Strategy:
 * 1. Find all courses with null folder_path
 * 2. Look for a matching folder in known root directories by original_title
 * 3. If found, update the course folder_path
 * 4. For each video with null file_path, walk the matched folder to find the file by file_name
 * 5. Update video file_path entries
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getAll, getOne, run } from '../database.js'
import { addAllowedRoot } from './videoStreamer.js'

/**
 * Find the root directory where courses are stored.
 * Checks settings first, then derives from .TutIn location.
 */
function findRootDirectories() {
    const roots = []

    // 1. Check the saved root_folder_path from settings
    try {
        const row = getOne('SELECT value FROM settings WHERE key = ?', ['root_folder_path'])
        if (row?.value) {
            const rootPath = JSON.parse(row.value)
            if (fs.existsSync(rootPath)) {
                roots.push(rootPath)
            }
        }
    } catch { /* ignore */ }

    // 2. Check any existing course folder_paths to derive parent dirs
    try {
        const courses = getAll('SELECT DISTINCT folder_path FROM courses WHERE folder_path IS NOT NULL')
        for (const course of courses) {
            if (course.folder_path) {
                const parent = path.dirname(course.folder_path)
                if (fs.existsSync(parent) && !roots.includes(parent)) {
                    roots.push(parent)
                }
            }
        }
    } catch { /* ignore */ }

    // 3. Detect from the app's own location
    // The server runs from .TutIn/server/services/pathRepair.js
    // So .TutIn is 2 levels up, and the courses root is .TutIn's parent
    try {
        const thisFile = fileURLToPath(import.meta.url)
        const servicesDir = path.dirname(thisFile) // .TutIn/server/services
        const tutinDir = path.resolve(servicesDir, '../..') // .TutIn
        const masterRoot = path.dirname(tutinDir) // D:\Master Classes

        if (path.basename(tutinDir) === '.TutIn' && fs.existsSync(masterRoot) && !roots.includes(masterRoot)) {
            roots.push(masterRoot)
        }
    } catch { /* ignore */ }

    return roots
}

/**
 * Recursively find a file by name within a directory
 */
function findFileRecursive(dirPath, fileName, maxDepth = 5) {
    if (maxDepth <= 0) return null
    
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        
        // Check direct children first
        for (const entry of entries) {
            if (entry.isFile() && entry.name === fileName) {
                return path.join(dirPath, entry.name)
            }
        }
        
        // Then recurse into subdirectories
        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                const found = findFileRecursive(path.join(dirPath, entry.name), fileName, maxDepth - 1)
                if (found) return found
            }
        }
    } catch {
        // Permission errors, etc.
    }
    
    return null
}

/**
 * Try to find a course folder in root directories by matching original_title
 */
function findCourseFolderPath(originalTitle, roots) {
    if (!originalTitle) return null
    
    for (const root of roots) {
        // Try exact match first
        const exactPath = path.join(root, originalTitle)
        if (fs.existsSync(exactPath) && fs.statSync(exactPath).isDirectory()) {
            return exactPath
        }
        
        // Try case-insensitive match
        try {
            const entries = fs.readdirSync(root, { withFileTypes: true })
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name.toLowerCase() === originalTitle.toLowerCase()) {
                    return path.join(root, entry.name)
                }
            }
        } catch { /* ignore */ }
    }
    
    return null
}

/**
 * Run the path repair for all courses and videos.
 * Safe to call multiple times — only updates null paths.
 * 
 * @returns {{ coursesRepaired: number, videosRepaired: number }}
 */
export function repairPaths() {
    const roots = findRootDirectories()
    
    if (roots.length === 0) {
        console.log('[PathRepair] No root directories found — skipping')
        return { coursesRepaired: 0, videosRepaired: 0 }
    }
    
    console.log(`[PathRepair] Searching in: ${roots.join(', ')}`)
    
    let coursesRepaired = 0
    let videosRepaired = 0
    
    // Get all courses that need path repair
    const courses = getAll('SELECT id, title, original_title FROM courses WHERE folder_path IS NULL')
    
    if (courses.length === 0) {
        console.log('[PathRepair] All courses already have paths — nothing to repair')
        return { coursesRepaired: 0, videosRepaired: 0 }
    }
    
    console.log(`[PathRepair] Found ${courses.length} course(s) without folder_path`)
    
    for (const course of courses) {
        const originalTitle = course.original_title || course.title
        const folderPath = findCourseFolderPath(originalTitle, roots)
        
        if (!folderPath) {
            console.log(`[PathRepair] ⚠ Could not find folder for: "${originalTitle}"`)
            continue
        }
        
        // Update course folder_path
        run('UPDATE courses SET folder_path = ? WHERE id = ?', [folderPath, course.id])
        addAllowedRoot(folderPath)
        addAllowedRoot(path.dirname(folderPath))
        coursesRepaired++
        console.log(`[PathRepair] ✓ Course: "${originalTitle}" → ${folderPath}`)
        
        // Now repair video paths for this course
        const videos = getAll(
            'SELECT id, file_name, original_title FROM videos WHERE course_id = ? AND file_path IS NULL',
            [course.id]
        )
        
        for (const video of videos) {
            const fileName = video.file_name || video.original_title
            if (!fileName) continue
            
            const filePath = findFileRecursive(folderPath, fileName)
            if (filePath) {
                run('UPDATE videos SET file_path = ? WHERE id = ?', [filePath, video.id])
                videosRepaired++
            } else {
                console.log(`[PathRepair]   ⚠ Video not found: "${fileName}"`)
            }
        }
    }
    
    console.log(`[PathRepair] Done — ${coursesRepaired} course(s), ${videosRepaired} video(s) repaired`)
    return { coursesRepaired, videosRepaired }
}
