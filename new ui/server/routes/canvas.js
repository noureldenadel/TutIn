import express from 'express'
import fs from 'fs'
import { getAll, getOne, run, transaction } from '../database.js'
import { saveVaultCanvas } from '../utils/courseAssets.js'

const router = express.Router()

function toEpochMs(value, fallback = Date.now()) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
        const num = Number(value)
        if (Number.isFinite(num) && /^\d+$/.test(value.trim())) return num
        const parsed = Date.parse(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return fallback
}

function toIsoString(value, fallbackIso = new Date().toISOString()) {
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
    return fallbackIso
}

function safeJsonParse(raw, fallback) {
    if (!raw || typeof raw !== 'string') return fallback
    try {
        return JSON.parse(raw)
    } catch {
        return fallback
    }
}

const SQL_CHUNK_SIZE = 400

function deleteCourseRowsNotIn(table, courseId, keepIds) {
    if (!keepIds || keepIds.size === 0) {
        run(`DELETE FROM ${table} WHERE course_id = ?`, [courseId])
        return
    }
    const existing = getAll(`SELECT id FROM ${table} WHERE course_id = ?`, [courseId])
    const toDelete = existing.map(r => r.id).filter(id => !keepIds.has(id))
    for (let i = 0; i < toDelete.length; i += SQL_CHUNK_SIZE) {
        const chunk = toDelete.slice(i, i + SQL_CHUNK_SIZE)
        const ph = chunk.map(() => '?').join(',')
        run(`DELETE FROM ${table} WHERE course_id = ? AND id IN (${ph})`, [courseId, ...chunk])
    }
}

function saveViewportRow(courseId, viewport, updatedAtIso = new Date().toISOString()) {
    const rawX = viewport?.x ?? viewport?.pan?.x ?? 0
    const rawY = viewport?.y ?? viewport?.pan?.y ?? 0
    const rawZoom = viewport?.zoom ?? 1
    const vpX = Number.isFinite(Number(rawX)) ? Number(rawX) : 0
    const vpY = Number.isFinite(Number(rawY)) ? Number(rawY) : 0
    const vpZoom = Number.isFinite(Number(rawZoom)) && Number(rawZoom) > 0 ? Number(rawZoom) : 1
    run(`
        INSERT INTO canvas_viewports (course_id, pan_x, pan_y, zoom, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(course_id) DO UPDATE SET
            pan_x = excluded.pan_x,
            pan_y = excluded.pan_y,
            zoom = excluded.zoom,
            updated_at = excluded.updated_at
    `, [courseId, vpX, vpY, vpZoom, updatedAtIso])
}

/**
 * Delete canvas_nodes linked to deleted note IDs (and any edges attached to them).
 * Returns the number of canvas_nodes deleted so callers know whether to sync canvas.json.
 */
export function deleteLinkedCanvasNodesForNotes(courseId, noteIds) {
    if (!courseId || !Array.isArray(noteIds) || noteIds.length === 0) return 0
    const nodeIds = []
    for (let i = 0; i < noteIds.length; i += SQL_CHUNK_SIZE) {
        const chunk = noteIds.slice(i, i + SQL_CHUNK_SIZE)
        const ph = chunk.map(() => '?').join(',')
        const rows = getAll(
            `SELECT id FROM canvas_nodes WHERE course_id = ? AND note_id IN (${ph})`,
            [courseId, ...chunk]
        )
        for (const row of rows) nodeIds.push(row.id)
    }
    if (nodeIds.length === 0) return 0

    for (let i = 0; i < nodeIds.length; i += SQL_CHUNK_SIZE) {
        const chunk = nodeIds.slice(i, i + SQL_CHUNK_SIZE)
        const ph = chunk.map(() => '?').join(',')
        run(
            `DELETE FROM canvas_edges WHERE course_id = ? AND (from_node_id IN (${ph}) OR to_node_id IN (${ph}))`,
            [courseId, ...chunk, ...chunk]
        )
        run(
            `DELETE FROM canvas_nodes WHERE course_id = ? AND id IN (${ph})`,
            [courseId, ...chunk]
        )
    }
    return nodeIds.length
}

/**
 * Read Canvas v2 state for a course from SQLite (with automatic v1 fallback).
 */
export function readCanvasStateFromDb(courseId) {
    const rawGroups = getAll(
        `SELECT * FROM canvas_groups WHERE course_id = ? ORDER BY sort_order ASC, created_at ASC`,
        [courseId]
    )

    const rawNodes = getAll(`
        SELECT 
            n.id, n.course_id, n.note_id, n.type, n.content, n.title,
            n.x, n.y, n.width, n.height, n.color, n.parent_group_id, n.collapsed,
            n.origin_lesson_idx, n.origin_video_id, n.timestamp,
            n.membership_state, n.is_canvas_only, n.image_src, n.caption, n.accent_index,
            n.created_at, n.updated_at,
            orig_note.content as original_note_content,
            orig_note.timestamp as note_timestamp,
            orig_note.video_id as note_video_id
        FROM canvas_nodes n
        LEFT JOIN notes orig_note ON n.note_id = orig_note.id
        WHERE n.course_id = ?
        ORDER BY n.created_at ASC
    `, [courseId])

    const groups = rawGroups.map((g, idx) => ({
        id: g.id,
        type: g.type === 'video-artboard' ? 'video-artboard' : 'custom-artboard',
        lessonIdx: g.lesson_idx !== null && g.lesson_idx !== undefined ? Number(g.lesson_idx) : undefined,
        videoId: g.video_id || undefined,
        title: g.title || '',
        subtitle: g.subtitle || undefined,
        x: Number(g.x) || 0,
        y: Number(g.y) || 0,
        width: Number(g.width) || 340,
        height: Number(g.height) || 240,
        tintIndex: g.tint_index !== null && g.tint_index !== undefined && g.tint_index !== ''
            ? Number(g.tint_index)
            : (idx % 6),
        layoutMode: g.layout_mode === 'auto' ? 'auto' : 'custom',
        collapsed: Boolean(g.collapsed),
    }))

    const cards = []
    for (const node of rawNodes) {
        // Legacy v1 rows could store group frames inside canvas_nodes with type = 'group'
        if (node.type === 'group') {
            if (!groups.some(g => g.id === node.id)) {
                groups.push({
                    id: node.id,
                    type: 'custom-artboard',
                    title: node.title || 'Group',
                    x: Number(node.x) || 0,
                    y: Number(node.y) || 0,
                    width: Number(node.width) || 340,
                    height: Number(node.height) || 240,
                    tintIndex: groups.length % 6,
                    layoutMode: 'custom',
                    collapsed: Boolean(node.collapsed),
                })
            }
            continue
        }

        const hasNoteLink = Boolean(node.note_id)
        const isVideoNote = node.type === 'video-note' || hasNoteLink
        const cardType = ['video-note', 'canvas-note', 'image', 'text'].includes(node.type)
            ? node.type
            : (isVideoNote ? 'video-note' : 'canvas-note')

        const htmlContent = node.note_id && node.original_note_content !== null && node.original_note_content !== undefined
            ? node.original_note_content
            : (node.content || '')

        const timestampVal = node.note_timestamp !== null && node.note_timestamp !== undefined
            ? Number(node.note_timestamp)
            : (node.timestamp !== null && node.timestamp !== undefined ? Number(node.timestamp) : undefined)

        const rawMembership = node.membership_state
        const membershipState =
            hasNoteLink && (!rawMembership || rawMembership === 'canvas-only')
                ? (node.parent_group_id
                    ? (String(node.parent_group_id).startsWith('vgroup-') ? 'auto' : 'reassigned')
                    : 'detached')
                : (rawMembership || (node.parent_group_id ? 'reassigned' : 'canvas-only'))

        cards.push({
            id: node.id,
            type: cardType,
            noteId: node.note_id || undefined,
            originLessonIdx: node.origin_lesson_idx !== null && node.origin_lesson_idx !== undefined
                ? Number(node.origin_lesson_idx)
                : undefined,
            originVideoId: node.origin_video_id || node.note_video_id || undefined,
            timestamp: timestampVal,
            groupId: node.parent_group_id || null,
            membershipState,
            isCanvasOnly: hasNoteLink
                ? false
                : (node.is_canvas_only !== null && node.is_canvas_only !== undefined
                    ? Boolean(node.is_canvas_only)
                    : true),
            x: Number(node.x) || 0,
            y: Number(node.y) || 0,
            width: Number(node.width) || 304,
            height: Number(node.height) || 140,
            htmlContent,
            imageSrc: node.image_src || undefined,
            caption: node.caption || undefined,
            accentIndex: node.accent_index !== null && node.accent_index !== undefined ? Number(node.accent_index) : undefined,
            createdAt: toEpochMs(node.created_at),
            updatedAt: toEpochMs(node.updated_at),
        })
    }

    const rawEdges = getAll(`SELECT * FROM canvas_edges WHERE course_id = ? ORDER BY created_at ASC`, [courseId])
    const edges = rawEdges.map(edge => ({
        id: edge.id,
        edgeKind: edge.edge_kind === 'auto-chrono' ? 'auto-chrono' : 'manual',
        fromId: edge.from_node_id,
        toId: edge.to_node_id,
        fromSide: edge.from_side || undefined,
        toSide: edge.to_side || undefined,
        style: edge.style === 'dashed' ? 'dashed' : 'solid',
        label: edge.label || undefined,
        createdAt: toEpochMs(edge.created_at),
    }))

    const rawStrokes = getAll(
        `SELECT * FROM canvas_strokes WHERE course_id = ? ORDER BY sort_order ASC, created_at ASC`,
        [courseId]
    )
    const strokes = rawStrokes.map(s => ({
        id: s.id,
        tool: s.tool === 'highlighter' ? 'highlighter' : 'pen',
        points: safeJsonParse(s.points, []),
        colorToken: s.color_token || 'ink',
        size: Number(s.size) || 3,
        parentGroupId: s.parent_group_id || null,
    }))

    const vp = getOne(`SELECT pan_x, pan_y, zoom, updated_at FROM canvas_viewports WHERE course_id = ?`, [courseId])
    const viewport = vp ? {
        x: Number.isFinite(Number(vp.pan_x)) ? Number(vp.pan_x) : 0,
        y: Number.isFinite(Number(vp.pan_y)) ? Number(vp.pan_y) : 0,
        zoom: Number.isFinite(Number(vp.zoom)) && Number(vp.zoom) > 0 ? Number(vp.zoom) : 1,
    } : { x: 0, y: 0, zoom: 1 }

    const meta = getOne(`SELECT dismissed_note_ids, last_sync_revision, updated_at FROM canvas_course_meta WHERE course_id = ?`, [courseId])

    return {
        version: 2,
        courseId,
        groups,
        cards,
        edges,
        strokes,
        dismissedNoteIds: safeJsonParse(meta?.dismissed_note_ids, []),
        viewport,
        lastSyncRevision: Number(meta?.last_sync_revision) || 0,
        updatedAt: toEpochMs(meta?.updated_at || vp?.updated_at, Date.now()),
    }
}

/**
 * Normalize v1 or v2 canvas payload and persist into SQLite inside an active or new transaction.
 */
export function writeCanvasPayloadToDb(courseId, payload, { insideTransaction = false } = {}) {
    const nowIso = new Date().toISOString()

    // Support both v2 (groups/cards/strokes/viewport.{x,y,zoom}) and legacy v1 (nodes/viewport.pan)
    const isV2Payload = payload?.version === 2 || Array.isArray(payload?.cards) || Array.isArray(payload?.groups)
    const rawInputGroups = Array.isArray(payload?.groups) ? payload.groups : []
    const remappedGroupIds = new Map()
    const groups = rawInputGroups.map(g => {
        if (g && typeof g.id === 'string' && /^vgroup-\d+$/.test(g.id)) {
            const scopedId = `vgroup-${courseId}-${g.id.slice('vgroup-'.length)}`
            remappedGroupIds.set(g.id, scopedId)
            return { ...g, id: scopedId }
        }
        return g
    })
    const rawCards = (Array.isArray(payload?.cards)
        ? payload.cards
        : (Array.isArray(payload?.nodes)
            ? payload.nodes.filter(n => n.type !== 'group').map(n => ({
                id: n.id,
                type: n.noteId ? 'video-note' : (n.type || 'canvas-note'),
                noteId: n.noteId || undefined,
                originLessonIdx: n.originLessonIdx,
                originVideoId: n.originVideoId || n.videoId,
                timestamp: n.timestamp,
                groupId: n.parentGroupId ?? null,
                membershipState: n.membershipState || (n.parentGroupId ? 'reassigned' : 'canvas-only'),
                isCanvasOnly: n.isCanvasOnly !== undefined ? n.isCanvasOnly : !n.noteId,
                x: n.x || 0,
                y: n.y || 0,
                width: n.width || 304,
                height: n.height || 140,
                htmlContent: n.htmlContent ?? n.content ?? '',
                imageSrc: n.imageSrc,
                caption: n.caption,
                accentIndex: n.accentIndex,
                createdAt: n.createdAt,
                updatedAt: n.updatedAt,
            }))
            : [])).map(c => (c && c.groupId && remappedGroupIds.has(c.groupId)
        ? { ...c, groupId: remappedGroupIds.get(c.groupId) }
        : c))

    // Also promote any legacy type==='group' entries from v1 nodes arrays
    if (!isV2Payload && Array.isArray(payload?.nodes)) {
        payload.nodes.filter(n => n.type === 'group').forEach((g, idx) => {
            groups.push({
                id: g.id,
                type: 'custom-artboard',
                title: g.title || 'Group',
                x: g.x || 0,
                y: g.y || 0,
                width: g.width || 340,
                height: g.height || 240,
                tintIndex: idx % 6,
                layoutMode: 'custom',
                collapsed: Boolean(g.collapsed),
            })
        })
    }

    const execute = () => {
        // 1. Viewport
        if (payload?.viewport) {
            saveViewportRow(courseId, payload.viewport, nowIso)
        }

        // 2. Groups (Artboards)
        if (Array.isArray(payload?.groups) || !isV2Payload) {
            deleteCourseRowsNotIn('canvas_groups', courseId, new Set(groups.map(g => g.id)))

            groups.forEach((g, idx) => {
                run(`
                    INSERT INTO canvas_groups (
                        id, course_id, type, lesson_idx, video_id, title, subtitle,
                        x, y, width, height, tint_index, layout_mode, collapsed, sort_order,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        type = excluded.type,
                        lesson_idx = excluded.lesson_idx,
                        video_id = excluded.video_id,
                        title = excluded.title,
                        subtitle = excluded.subtitle,
                        x = excluded.x,
                        y = excluded.y,
                        width = excluded.width,
                        height = excluded.height,
                        tint_index = excluded.tint_index,
                        layout_mode = excluded.layout_mode,
                        collapsed = excluded.collapsed,
                        sort_order = excluded.sort_order,
                        updated_at = excluded.updated_at
                    WHERE canvas_groups.course_id = excluded.course_id
                `, [
                    g.id,
                    courseId,
                    g.type || 'custom-artboard',
                    g.lessonIdx ?? null,
                    g.videoId ?? null,
                    g.title || '',
                    g.subtitle ?? null,
                    g.x || 0,
                    g.y || 0,
                    g.width || 340,
                    g.height || 240,
                    g.tintIndex ?? 0,
                    g.layoutMode || 'custom',
                    g.collapsed ? 1 : 0,
                    idx,
                    nowIso,
                    nowIso,
                ])
            })
        }

        // 3. Cards -> canvas_nodes
        const savedCardIdSet = new Set()
        if (Array.isArray(payload?.cards) || Array.isArray(payload?.nodes)) {
            deleteCourseRowsNotIn('canvas_nodes', courseId, new Set(rawCards.map(c => c.id)))
            const validCourseNoteIds = new Set(
                getAll('SELECT id FROM notes WHERE course_id = ?', [courseId]).map(r => r.id)
            )

            for (const card of rawCards) {
                savedCardIdSet.add(card.id)
                const verifiedNoteId = card.noteId && validCourseNoteIds.has(card.noteId) ? card.noteId : null

                run(`
                    INSERT INTO canvas_nodes (
                        id, course_id, note_id, type, content, title,
                        x, y, width, height, color, parent_group_id, collapsed,
                        origin_lesson_idx, origin_video_id, timestamp,
                        membership_state, is_canvas_only, image_src, caption, accent_index,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        origin_lesson_idx = excluded.origin_lesson_idx,
                        origin_video_id = excluded.origin_video_id,
                        timestamp = excluded.timestamp,
                        membership_state = excluded.membership_state,
                        is_canvas_only = excluded.is_canvas_only,
                        image_src = excluded.image_src,
                        caption = excluded.caption,
                        accent_index = excluded.accent_index,
                        updated_at = excluded.updated_at
                    WHERE canvas_nodes.course_id = excluded.course_id
                `, [
                    card.id,
                    courseId,
                    verifiedNoteId,
                    card.type || 'canvas-note',
                    card.htmlContent ?? card.content ?? '',
                    card.caption || '',
                    card.x || 0,
                    card.y || 0,
                    card.width || 304,
                    card.height || 140,
                    '',
                    card.groupId ?? null,
                    0,
                    card.originLessonIdx ?? null,
                    card.originVideoId ?? null,
                    card.timestamp ?? null,
                    card.membershipState || 'canvas-only',
                    card.isCanvasOnly ? 1 : 0,
                    card.imageSrc ?? null,
                    card.caption ?? null,
                    card.accentIndex ?? null,
                    toIsoString(card.createdAt, nowIso),
                    toIsoString(card.updatedAt, nowIso),
                ])
            }
        } else {
            getAll('SELECT id FROM canvas_nodes WHERE course_id = ?', [courseId]).forEach(r => savedCardIdSet.add(r.id))
        }

        // 4. Edges
        if (Array.isArray(payload?.edges)) {
            const validEdges = payload.edges.filter(e => {
                const fromId = e.fromId || e.fromNodeId
                const toId = e.toId || e.toNodeId
                return fromId && toId && savedCardIdSet.has(fromId) && savedCardIdSet.has(toId)
            })
            deleteCourseRowsNotIn('canvas_edges', courseId, new Set(validEdges.map(e => e.id)))

            for (const edge of validEdges) {
                const fromId = edge.fromId || edge.fromNodeId
                const toId = edge.toId || edge.toNodeId
                run(`
                    INSERT INTO canvas_edges (
                        id, course_id, from_node_id, to_node_id,
                        edge_kind, from_side, to_side, style, label, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        from_node_id = excluded.from_node_id,
                        to_node_id = excluded.to_node_id,
                        edge_kind = excluded.edge_kind,
                        from_side = excluded.from_side,
                        to_side = excluded.to_side,
                        style = excluded.style,
                        label = excluded.label
                    WHERE canvas_edges.course_id = excluded.course_id
                `, [
                    edge.id,
                    courseId,
                    fromId,
                    toId,
                    edge.edgeKind || 'manual',
                    edge.fromSide ?? null,
                    edge.toSide ?? null,
                    edge.style || 'solid',
                    edge.label ?? null,
                    toIsoString(edge.createdAt, nowIso),
                ])
            }
        }

        // 5. Strokes — avoid destructive delete + re-insert when stroke rows are unchanged
        if (Array.isArray(payload?.strokes)) {
            const nextStrokes = payload.strokes.map(stroke => ({
                id: stroke.id,
                tool: stroke.tool === 'highlighter' ? 'highlighter' : 'pen',
                pointsJson: JSON.stringify(stroke.points || []),
                colorToken: stroke.colorToken || 'ink',
                size: Number(stroke.size ?? 3),
                parentGroupId: stroke.parentGroupId && remappedGroupIds.has(stroke.parentGroupId)
                    ? remappedGroupIds.get(stroke.parentGroupId)
                    : (stroke.parentGroupId ?? null),
            }))

            const existingStrokes = getAll(
                `SELECT id, tool, points, color_token, size, parent_group_id FROM canvas_strokes WHERE course_id = ? ORDER BY sort_order ASC, created_at ASC`,
                [courseId]
            )
            const strokesUnchanged =
                existingStrokes.length === nextStrokes.length &&
                nextStrokes.every((s, idx) => {
                    const prev = existingStrokes[idx]
                    return (
                        prev.id === s.id &&
                        prev.tool === s.tool &&
                        prev.points === s.pointsJson &&
                        prev.color_token === s.colorToken &&
                        Number(prev.size) === s.size &&
                        (prev.parent_group_id ?? null) === s.parentGroupId
                    )
                })

            if (!strokesUnchanged) {
                run(`DELETE FROM canvas_strokes WHERE course_id = ?`, [courseId])
                nextStrokes.forEach((stroke, idx) => {
                    run(`
                        INSERT INTO canvas_strokes (
                            id, course_id, tool, points, color_token, size, parent_group_id, sort_order, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        stroke.id,
                        courseId,
                        stroke.tool,
                        stroke.pointsJson,
                        stroke.colorToken,
                        stroke.size,
                        stroke.parentGroupId,
                        idx,
                        nowIso,
                    ])
                })
            }
        }

        // 6. Meta (dismissedNoteIds, revision, updatedAt)
        const dismissedJson = JSON.stringify(Array.isArray(payload?.dismissedNoteIds) ? payload.dismissedNoteIds : [])
        const syncRev = Number(payload?.lastSyncRevision) || 0
        const updatedIso = toIsoString(payload?.updatedAt, nowIso)
        run(`
            INSERT INTO canvas_course_meta (course_id, dismissed_note_ids, last_sync_revision, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(course_id) DO UPDATE SET
                dismissed_note_ids = excluded.dismissed_note_ids,
                last_sync_revision = excluded.last_sync_revision,
                updated_at = excluded.updated_at
        `, [courseId, dismissedJson, syncRev, updatedIso])
    }

    if (insideTransaction) {
        execute()
    } else {
        transaction(execute)
    }
}

/**
 * Synchronize Canvas v2 state to <courseFolder>/.tutin/canvas.json
 */
export function syncCourseCanvasToVault(courseId) {
    if (!courseId) return
    try {
        const course = getOne('SELECT folder_path FROM courses WHERE id = ?', [courseId])
        if (!course || !course.folder_path || !fs.existsSync(course.folder_path)) return

        const state = readCanvasStateFromDb(courseId)
        saveVaultCanvas(course.folder_path, state)
    } catch (err) {
        console.error('[VaultCanvas] Failed to sync canvas to vault:', err)
    }
}

// GET /api/canvas/:courseId
router.get('/:courseId', (req, res) => {
    const { courseId } = req.params
    try {
        res.json(readCanvasStateFromDb(courseId))
    } catch (err) {
        console.error('Failed to get canvas data:', err)
        res.status(500).json({ error: err.message })
    }
})

// PUT /api/canvas/:courseId — bulk save Canvas v2 state (groups, cards, edges, strokes, meta, viewport)
router.put('/:courseId', (req, res) => {
    const { courseId } = req.params
    try {
        writeCanvasPayloadToDb(courseId, req.body)
        syncCourseCanvasToVault(courseId)
        res.json({ success: true })
    } catch (err) {
        console.error('Failed to save canvas data:', err)
        res.status(500).json({ error: err.message })
    }
})

// PATCH /api/canvas/:courseId/viewport — lightweight pan/zoom persistence without rewriting nodes/strokes/vault
router.patch('/:courseId/viewport', (req, res) => {
    const { courseId } = req.params
    try {
        saveViewportRow(courseId, req.body)
        res.json({ success: true })
    } catch (err) {
        console.error('Failed to save canvas viewport:', err)
        res.status(500).json({ error: err.message })
    }
})

export default router
