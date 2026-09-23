import express from 'express'
import fs from 'fs'
import { getAll, getOne, run, transaction } from '../database.js'
import { saveVaultCanvas } from '../utils/courseAssets.js'

const router = express.Router()

/**
 * Synchronize canvas whiteboard data to <courseFolder>/.tutin/canvas.json
 */
function syncCourseCanvasToVault(courseId) {
    if (!courseId) return
    try {
        const course = getOne('SELECT folder_path FROM courses WHERE id = ?', [courseId])
        if (!course || !course.folder_path || !fs.existsSync(course.folder_path)) return

        const rawNodes = getAll('SELECT * FROM canvas_nodes WHERE course_id = ?', [courseId])
        const rawEdges = getAll('SELECT * FROM canvas_edges WHERE course_id = ?', [courseId])
        const vp = getAll('SELECT * FROM canvas_viewports WHERE course_id = ?', [courseId])

        const viewport = vp[0] ? {
            pan: { x: Number(vp[0].pan_x) || 0, y: Number(vp[0].pan_y) || 0 },
            zoom: Number(vp[0].zoom) || 1
        } : { pan: { x: 0, y: 0 }, zoom: 1 }

        const canvasData = {
            nodes: rawNodes.map(n => ({
                id: n.id,
                noteId: n.note_id,
                type: n.type || 'note',
                content: n.content,
                title: n.title,
                x: Number(n.x) || 0,
                y: Number(n.y) || 0,
                width: Number(n.width) || 280,
                height: Number(n.height) || 180,
                color: n.color || '',
                parentGroupId: n.parent_group_id || null,
                collapsed: Boolean(n.collapsed),
                createdAt: n.created_at,
                updatedAt: n.updated_at
            })),
            edges: rawEdges.map(e => ({
                id: e.id,
                fromNodeId: e.from_node_id,
                toNodeId: e.to_node_id,
                createdAt: e.created_at
            })),
            viewport
        }

        saveVaultCanvas(course.folder_path, canvasData)
    } catch (err) {
        console.error('[VaultCanvas] Failed to sync canvas to vault:', err)
    }
}

// GET /api/canvas/:courseId
router.get('/:courseId', (req, res) => {
    const { courseId } = req.params
    try {
        // Fetch nodes with joined note and video metadata
        const rawNodes = getAll(`
            SELECT 
                n.id, n.course_id, n.note_id, n.type, n.content, n.title,
                n.x, n.y, n.width, n.height, n.color, n.parent_group_id, n.collapsed,
                n.created_at, n.updated_at,
                orig_note.content as original_note_content,
                orig_note.timestamp as note_timestamp,
                orig_note.images as note_images,
                v.id as video_id,
                v.title as video_title,
                v.module_id as module_id
            FROM canvas_nodes n
            LEFT JOIN notes orig_note ON n.note_id = orig_note.id
            LEFT JOIN videos v ON orig_note.video_id = v.id
            WHERE n.course_id = ?
            ORDER BY n.created_at ASC
        `, [courseId])

        const nodes = rawNodes.map(node => {
            let noteImages = []
            try {
                if (node.note_images) noteImages = JSON.parse(node.note_images)
            } catch { /* ignore */ }

            return {
                id: node.id,
                courseId: node.course_id,
                noteId: node.note_id,
                type: node.type || 'note',
                // If linked to video note, live note content takes precedence if present
                content: node.note_id && node.original_note_content !== null ? node.original_note_content : (node.content || ''),
                title: node.title || '',
                x: Number(node.x) || 0,
                y: Number(node.y) || 0,
                width: Number(node.width) || 280,
                height: Number(node.height) || 180,
                color: node.color || '',
                parentGroupId: node.parent_group_id || null,
                collapsed: Boolean(node.collapsed),
                createdAt: node.created_at,
                updatedAt: node.updated_at,
                // Joined metadata for video notes
                videoTitle: node.video_title || null,
                videoId: node.video_id || null,
                moduleId: node.module_id || null,
                timestamp: node.note_timestamp !== null && node.note_timestamp !== undefined ? Number(node.note_timestamp) : null,
                images: noteImages
            }
        })

        // Fetch edges
        const rawEdges = getAll(`
            SELECT id, course_id, from_node_id, to_node_id, created_at
            FROM canvas_edges
            WHERE course_id = ?
        `, [courseId])

        const edges = rawEdges.map(edge => ({
            id: edge.id,
            courseId: edge.course_id,
            fromNodeId: edge.from_node_id,
            toNodeId: edge.to_node_id,
            createdAt: edge.created_at
        }))

        // Fetch viewport
        const vp = getOne(`
            SELECT pan_x, pan_y, zoom, updated_at
            FROM canvas_viewports
            WHERE course_id = ?
        `, [courseId])

        const viewport = vp ? {
            pan: { x: Number(vp.pan_x) || 0, y: Number(vp.pan_y) || 0 },
            zoom: Number(vp.zoom) || 1
        } : {
            pan: { x: 0, y: 0 },
            zoom: 1
        }

        res.json({ nodes, edges, viewport })
    } catch (err) {
        console.error('Failed to get canvas data:', err)
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/canvas/:courseId — bulk save nodes, edges, viewport
router.put('/:courseId', (req, res) => {
    const { courseId } = req.params
    const { nodes, edges, viewport } = req.body

    try {
        const now = new Date().toISOString()
        transaction(() => {
            // 1. Save viewport
            if (viewport) {
                const panX = viewport.pan?.x ?? 0
                const panY = viewport.pan?.y ?? 0
                const zoom = viewport.zoom ?? 1
                run(`
                    INSERT INTO canvas_viewports (course_id, pan_x, pan_y, zoom, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(course_id) DO UPDATE SET
                        pan_x = excluded.pan_x,
                        pan_y = excluded.pan_y,
                        zoom = excluded.zoom,
                        updated_at = excluded.updated_at
                `, [courseId, panX, panY, zoom, now])
            }

            // 2. Sync nodes if provided
            if (Array.isArray(nodes)) {
                // Delete existing nodes not present in the new set
                const currentIds = nodes.map(n => n.id)
                if (currentIds.length > 0) {
                    const placeholders = currentIds.map(() => '?').join(',')
                    run(`DELETE FROM canvas_nodes WHERE course_id = ? AND id NOT IN (${placeholders})`, [courseId, ...currentIds])
                } else {
                    run(`DELETE FROM canvas_nodes WHERE course_id = ?`, [courseId])
                }

                // Upsert each node
                for (const node of nodes) {
                    run(`
                        INSERT INTO canvas_nodes (
                            id, course_id, note_id, type, content, title,
                            x, y, width, height, color, parent_group_id, collapsed,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            note_id = excluded.note_id,
                            type = excluded.type,
                            content = excluded.content,
                            title = excluded.title,
                            x = excluded.x,
                            y = excluded.y,
                            width = excluded.width,
                            height = excluded.height,
                            color = excluded.color,
                            parent_group_id = excluded.parent_group_id,
                            collapsed = excluded.collapsed,
                            updated_at = excluded.updated_at
                    `, [
                        node.id,
                        courseId,
                        node.noteId || null,
                        node.type || 'note',
                        node.content || '',
                        node.title || '',
                        node.x || 0,
                        node.y || 0,
                        node.width || 280,
                        node.height || 180,
                        node.color || '',
                        node.parentGroupId || null,
                        node.collapsed ? 1 : 0,
                        node.createdAt || now,
                        now
                    ])
                }
            }

            // 3. Sync edges if provided
            if (Array.isArray(edges)) {
                const edgeIds = edges.map(e => e.id)
                if (edgeIds.length > 0) {
                    const placeholders = edgeIds.map(() => '?').join(',')
                    run(`DELETE FROM canvas_edges WHERE course_id = ? AND id NOT IN (${placeholders})`, [courseId, ...edgeIds])
                } else {
                    run(`DELETE FROM canvas_edges WHERE course_id = ?`, [courseId])
                }

                for (const edge of edges) {
                    run(`
                        INSERT INTO canvas_edges (id, course_id, from_node_id, to_node_id, created_at)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            from_node_id = excluded.from_node_id,
                            to_node_id = excluded.to_node_id
                    `, [
                        edge.id,
                        courseId,
                        edge.fromNodeId,
                        edge.toNodeId,
                        edge.createdAt || now
                    ])
                }
            }
        })

        syncCourseCanvasToVault(courseId)
        res.json({ success: true })
    } catch (err) {
        console.error('Failed to save canvas data:', err)
        res.status(500).json({ error: err.message })
    }
})

// POST /api/canvas/:courseId/nodes
router.post('/:courseId/nodes', (req, res) => {
    const { courseId } = req.params
    const data = req.body
    if (!data.id) {
        return res.status(400).json({ error: 'Missing node ID' })
    }

    try {
        const now = new Date().toISOString()
        run(`
            INSERT INTO canvas_nodes (
                id, course_id, note_id, type, content, title,
                x, y, width, height, color, parent_group_id, collapsed,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.id,
            courseId,
            data.noteId || null,
            data.type || 'note',
            data.content || '',
            data.title || '',
            data.x || 0,
            data.y || 0,
            data.width || 280,
            data.height || 180,
            data.color || '',
            data.parentGroupId || null,
            data.collapsed ? 1 : 0,
            data.createdAt || now,
            now
        ])

        syncCourseCanvasToVault(courseId)
        res.status(201).json({ success: true, id: data.id })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/canvas/:courseId/nodes/:nodeId
router.put('/:courseId/nodes/:nodeId', (req, res) => {
    const { courseId, nodeId } = req.params
    const updates = req.body

    try {
        const node = getOne('SELECT * FROM canvas_nodes WHERE id = ? AND course_id = ?', [nodeId, courseId])
        if (!node) return res.status(404).json({ error: 'Node not found' })

        const now = new Date().toISOString()
        const fields = []
        const params = []

        const columnMap = {
            noteId: 'note_id',
            type: 'type',
            content: 'content',
            title: 'title',
            x: 'x',
            y: 'y',
            width: 'width',
            height: 'height',
            color: 'color',
            parentGroupId: 'parent_group_id',
            collapsed: 'collapsed'
        }

        for (const [key, col] of Object.entries(columnMap)) {
            if (updates[key] !== undefined) {
                fields.push(`${col} = ?`)
                if (key === 'collapsed') {
                    params.push(updates[key] ? 1 : 0)
                } else {
                    params.push(updates[key])
                }
            }
        }

        fields.push('updated_at = ?')
        params.push(now)
        params.push(nodeId)
        params.push(courseId)

        run(`UPDATE canvas_nodes SET ${fields.join(', ')} WHERE id = ? AND course_id = ?`, params)

        // If this node is linked to a video note and content was modified, update original note as well
        if (node.note_id && updates.content !== undefined) {
            run('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?', [updates.content, now, node.note_id])
        }

        syncCourseCanvasToVault(courseId)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/canvas/:courseId/nodes/:nodeId
router.delete('/:courseId/nodes/:nodeId', (req, res) => {
    const { courseId, nodeId } = req.params
    try {
        transaction(() => {
            run('DELETE FROM canvas_edges WHERE (from_node_id = ? OR to_node_id = ?) AND course_id = ?', [nodeId, nodeId, courseId])
            run('DELETE FROM canvas_nodes WHERE id = ? AND course_id = ?', [nodeId, courseId])
        })

        syncCourseCanvasToVault(courseId)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// POST /api/canvas/:courseId/edges
router.post('/:courseId/edges', (req, res) => {
    const { courseId } = req.params
    const data = req.body
    if (!data.id || !data.fromNodeId || !data.toNodeId) {
        return res.status(400).json({ error: 'Missing required edge fields' })
    }

    try {
        const now = new Date().toISOString()
        run(`
            INSERT INTO canvas_edges (id, course_id, from_node_id, to_node_id, created_at)
            VALUES (?, ?, ?, ?, ?)
        `, [data.id, courseId, data.fromNodeId, data.toNodeId, data.createdAt || now])

        syncCourseCanvasToVault(courseId)
        res.status(201).json({ success: true, id: data.id })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /api/canvas/:courseId/edges/:edgeId
router.delete('/:courseId/edges/:edgeId', (req, res) => {
    const { courseId, edgeId } = req.params
    try {
        run('DELETE FROM canvas_edges WHERE id = ? AND course_id = ?', [edgeId, courseId])

        syncCourseCanvasToVault(courseId)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router
