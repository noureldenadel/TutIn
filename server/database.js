/**
 * TutIn Server — Database Layer
 * 
 * SQLite database using sql.js (pure JavaScript, no native deps).
 * Auto-saves to disk after write operations.
 * 
 * Data directory: %APPDATA%/TutIn/ (Windows) or ~/.config/TutIn/ (Linux/Mac)
 */

import initSqlJs from 'sql.js'
import path from 'path'
import fs from 'fs'
import os from 'os'

let db = null
let dbPath = null
let saveTimer = null

/**
 * Get the application data directory
 */
export function getDataDir() {
    const platform = os.platform()
    let baseDir

    if (platform === 'win32') {
        baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    } else if (platform === 'darwin') {
        baseDir = path.join(os.homedir(), 'Library', 'Application Support')
    } else {
        baseDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    }

    return path.join(baseDir, 'TutIn')
}

/**
 * Ensure all data directories exist
 */
function ensureDirectories() {
    const dataDir = getDataDir()
    const dirs = [
        dataDir,
        path.join(dataDir, 'transcripts'),
        path.join(dataDir, 'summaries'),
        path.join(dataDir, 'backups', 'auto'),
        path.join(dataDir, 'backups', 'manual'),
    ]

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
    }

    return dataDir
}

/**
 * Write the in-memory database to disk
 */
function writeToDisk() {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(dbPath, buffer)
}

/**
 * Save database to disk (debounced)
 */
export function saveDatabase() {
    if (!db || !dbPath) return

    // Debounce: save after 100ms of no writes
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
        try {
            writeToDisk()
        } catch (err) {
            console.error('[Database] Save failed:', err.message)
        }
    }, 100)
}

/**
 * Force save database to disk immediately
 */
export function saveDatabaseSync() {
    if (!db || !dbPath) return
    if (saveTimer) clearTimeout(saveTimer)
    try {
        writeToDisk()
    } catch (err) {
        console.error('[Database] Save failed:', err.message)
    }
}

/**
 * Initialize the database and run migrations
 */
export async function initDatabase() {
    if (db) return db

    const dataDir = ensureDirectories()
    dbPath = path.join(dataDir, 'tutin.db')

    console.log(`[Database] Opening: ${dbPath}`)

    const SQL = await initSqlJs()

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath)
        db = new SQL.Database(fileBuffer)
        console.log('[Database] Loaded existing database')
    } else {
        db = new SQL.Database()
        console.log('[Database] Created new database')
    }

    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON')

    // Run schema migration
    runMigrations()

    // Save after migration
    saveDatabaseSync()

    console.log('[Database] Ready')
    return db
}

/**
 * Get the database instance
 */
export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.')
    }
    return db
}

/**
 * Close the database connection and save
 */
export function closeDatabase() {
    if (db) {
        saveDatabaseSync()
        db.close()
        db = null
        console.log('[Database] Closed')
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Run a query that modifies data (INSERT, UPDATE, DELETE)
 * Auto-saves after write.
 */
export function run(sql, params = []) {
    db.run(sql, params)
    saveDatabase()
}

/**
 * Get a single row
 */
export function getOne(sql, params = []) {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    let result = null
    if (stmt.step()) {
        result = stmt.getAsObject()
    }
    stmt.free()
    return result
}

/**
 * Get all rows
 */
export function getAll(sql, params = []) {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const results = []
    while (stmt.step()) {
        results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
}

/**
 * Run multiple statements in a transaction
 */
export function transaction(fn) {
    db.run('BEGIN TRANSACTION')
    try {
        fn()
        db.run('COMMIT')
        saveDatabase()
    } catch (err) {
        db.run('ROLLBACK')
        throw err
    }
}

// ============================================
// MIGRATIONS
// ============================================

function runMigrations() {
    // Create migrations tracking table
    db.run(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
    `)

    const applied = new Set(
        getAll('SELECT name FROM _migrations').map(r => r.name)
    )

    const migrations = [
        { name: '001_initial_schema', fn: migration001 },
        { name: '002_subtitles_dubbing_schema', fn: migration002 },
    ]

    for (const migration of migrations) {
        if (!applied.has(migration.name)) {
            console.log(`[Database] Running migration: ${migration.name}`)
            migration.fn()
            run(
                'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
                [migration.name, new Date().toISOString()]
            )
            console.log(`[Database] Migration complete: ${migration.name}`)
        }
    }
}

/**
 * Migration 001: Initial schema — all tables
 */
function migration001() {
    const statements = [
        // COURSES
        `CREATE TABLE courses (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            original_title TEXT,
            description TEXT DEFAULT '',
            instructor TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            thumbnail_data TEXT,
            folder_path TEXT,
            source_type TEXT DEFAULT 'local',
            course_url TEXT,
            date_added TEXT,
            date_modified TEXT,
            last_accessed TEXT,
            last_accessed_click_time TEXT,
            total_duration REAL DEFAULT 0,
            total_videos INTEGER DEFAULT 0,
            completed_videos INTEGER DEFAULT 0,
            completion_percentage REAL DEFAULT 0,
            custom_metadata TEXT DEFAULT '{}',
            "order" INTEGER
        )`,

        // MODULES
        `CREATE TABLE modules (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL,
            parent_module_id TEXT,
            title TEXT NOT NULL,
            original_title TEXT,
            description TEXT DEFAULT '',
            thumbnail_data TEXT,
            folder_path TEXT,
            "order" INTEGER DEFAULT 0,
            total_duration REAL DEFAULT 0,
            total_videos INTEGER DEFAULT 0,
            completed_videos INTEGER DEFAULT 0,
            date_added TEXT,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_module_id) REFERENCES modules(id) ON DELETE SET NULL
        )`,
        `CREATE INDEX idx_modules_course ON modules(course_id)`,
        `CREATE INDEX idx_modules_parent ON modules(parent_module_id)`,

        // VIDEOS
        `CREATE TABLE videos (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL,
            module_id TEXT NOT NULL,
            title TEXT NOT NULL,
            original_title TEXT,
            description TEXT DEFAULT '',
            file_name TEXT DEFAULT '',
            file_path TEXT,
            file_size INTEGER DEFAULT 0,
            duration REAL DEFAULT 0,
            thumbnail_data TEXT,
            "order" INTEGER DEFAULT 0,
            is_required INTEGER DEFAULT 1,
            is_completed INTEGER DEFAULT 0,
            is_favorite INTEGER DEFAULT 0,
            watch_progress REAL DEFAULT 0,
            last_watched_position REAL DEFAULT 0,
            last_watched_at TEXT,
            completed_at TEXT,
            watch_count INTEGER DEFAULT 0,
            tags TEXT DEFAULT '[]',
            bookmarks TEXT DEFAULT '[]',
            youtube_id TEXT,
            url TEXT,
            has_transcript INTEGER DEFAULT 0,
            has_summary INTEGER DEFAULT 0,
            transcript_generated_at TEXT,
            summary_generated_at TEXT,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX idx_videos_course ON videos(course_id)`,
        `CREATE INDEX idx_videos_module ON videos(module_id)`,
        `CREATE INDEX idx_videos_last_watched ON videos(last_watched_at)`,

        // NOTES
        `CREATE TABLE notes (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            course_id TEXT NOT NULL,
            timestamp REAL DEFAULT 0,
            content TEXT DEFAULT '',
            images TEXT DEFAULT '[]',
            tags TEXT DEFAULT '[]',
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX idx_notes_video ON notes(video_id)`,
        `CREATE INDEX idx_notes_course ON notes(course_id)`,

        // ANALYTICS
        `CREATE TABLE analytics (
            id TEXT PRIMARY KEY,
            date TEXT UNIQUE NOT NULL,
            watch_time_seconds REAL DEFAULT 0,
            videos_watched INTEGER DEFAULT 0,
            videos_completed INTEGER DEFAULT 0,
            courses_accessed TEXT DEFAULT '[]',
            sessions_count INTEGER DEFAULT 0
        )`,

        // WATCH SESSIONS
        `CREATE TABLE watch_sessions (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            course_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            duration_seconds REAL DEFAULT 0,
            start_position REAL DEFAULT 0,
            end_position REAL DEFAULT 0,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX idx_sessions_video ON watch_sessions(video_id)`,
        `CREATE INDEX idx_sessions_date ON watch_sessions(started_at)`,

        // INSTRUCTORS
        `CREATE TABLE instructors (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            display_name TEXT,
            avatar_data TEXT,
            updated_at TEXT
        )`,

        // ROADMAPS
        `CREATE TABLE roadmaps (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            nodes TEXT DEFAULT '[]',
            connections TEXT DEFAULT '[]',
            viewport TEXT DEFAULT '{}',
            is_active INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )`,

        // SETTINGS
        `CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT
        )`,

        // Note: Full-text search will use LIKE queries for now.
        // FTS5 requires a custom sql.js build.
    ]

    for (const sql of statements) {
        db.run(sql)
    }
}

/**
 * Migration 002: Subtitles and Dubbing Schema
 */
function migration002() {
    const statements = [
        // Add subtitle_sources column to videos (SQLite doesn't support IF NOT EXISTS for columns, so we try/catch)
        // We do this by checking if the column exists first using PRAGMA
        `
        CREATE TABLE IF NOT EXISTS dub_jobs (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            language TEXT NOT NULL,
            status TEXT DEFAULT 'queued',
            step TEXT,
            progress INTEGER DEFAULT 0,
            audio_path TEXT,
            file_size INTEGER,
            error_message TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
        );
        `
    ]

    for (const stmt of statements) {
        db.run(stmt)
    }

    // Add subtitle_sources to videos if it doesn't exist
    const columns = getAll("PRAGMA table_info(videos)")
    const hasSubtitleSources = columns.some(col => col.name === 'subtitle_sources')
    if (!hasSubtitleSources) {
        db.run("ALTER TABLE videos ADD COLUMN subtitle_sources TEXT DEFAULT '[]'")
    }
}
