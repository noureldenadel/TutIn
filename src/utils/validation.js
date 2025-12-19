/**
 * Validation and Sanitization Utilities
 * 
 * Provides:
 * - Input validation for courses, videos, timestamps
 * - XSS sanitization for user-generated content
 * - JSON schema validation for imports
 */

// HTML entities map for sanitization
const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
}

/**
 * Sanitize HTML to prevent XSS attacks
 * @param {string} text - Raw text to sanitize
 * @returns {string} Sanitized text with HTML entities escaped
 */
export function sanitizeHTML(text) {
    if (typeof text !== 'string') return ''
    return text.replace(/[&<>"'`=/]/g, char => HTML_ENTITIES[char] || char)
}

/**
 * Validate course title
 * @param {string} title - Course title to validate
 * @returns {{ valid: boolean, error?: string, sanitized: string }}
 */
export function validateCourseTitle(title) {
    if (typeof title !== 'string') {
        return { valid: false, error: 'Course title must be a string', sanitized: '' }
    }

    const trimmed = title.trim()

    if (trimmed.length === 0) {
        return { valid: false, error: 'Course title cannot be empty', sanitized: '' }
    }

    if (trimmed.length > 200) {
        return { valid: false, error: 'Course title must be 200 characters or less', sanitized: trimmed.slice(0, 200) }
    }

    return { valid: true, sanitized: sanitizeHTML(trimmed) }
}

/**
 * Validate module title
 * @param {string} title - Module title to validate
 * @returns {{ valid: boolean, error?: string, sanitized: string }}
 */
export function validateModuleTitle(title) {
    if (typeof title !== 'string') {
        return { valid: false, error: 'Module title must be a string', sanitized: '' }
    }

    const trimmed = title.trim()

    if (trimmed.length === 0) {
        return { valid: false, error: 'Module title cannot be empty', sanitized: 'Untitled Module' }
    }

    if (trimmed.length > 200) {
        return { valid: false, error: 'Module title must be 200 characters or less', sanitized: trimmed.slice(0, 200) }
    }

    return { valid: true, sanitized: sanitizeHTML(trimmed) }
}

/**
 * Validate video duration
 * @param {number} duration - Duration in seconds
 * @returns {{ valid: boolean, value: number }}
 */
export function validateDuration(duration) {
    if (typeof duration !== 'number' || isNaN(duration) || duration < 0) {
        return { valid: false, value: 0 }
    }
    return { valid: true, value: Math.round(duration) }
}

/**
 * Validate timestamp is within video duration
 * @param {number} timestamp - Timestamp in seconds
 * @param {number} duration - Video duration in seconds
 * @returns {{ valid: boolean, value: number }}
 */
export function validateTimestamp(timestamp, duration) {
    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
        return { valid: false, value: 0 }
    }

    const safeDuration = Math.max(0, duration || 0)

    if (timestamp < 0) {
        return { valid: false, value: 0 }
    }

    if (timestamp > safeDuration) {
        return { valid: false, value: safeDuration }
    }

    return { valid: true, value: timestamp }
}

/**
 * Supported video file extensions
 */
export const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'ogg', 'avi', 'mkv']

/**
 * Validate video file by extension
 * @param {string} fileName - File name to check
 * @returns {{ valid: boolean, extension?: string, error?: string }}
 */
export function validateVideoFile(fileName) {
    if (typeof fileName !== 'string' || !fileName) {
        return { valid: false, error: 'Invalid file name' }
    }

    const extension = fileName.split('.').pop()?.toLowerCase() || ''

    if (!SUPPORTED_VIDEO_EXTENSIONS.includes(extension)) {
        return {
            valid: false,
            extension,
            error: `Unsupported format: .${extension}. Supported: ${SUPPORTED_VIDEO_EXTENSIONS.join(', ')}`
        }
    }

    return { valid: true, extension }
}

/**
 * Validate file size
 * @param {number} sizeBytes - File size in bytes
 * @param {number} maxSizeBytes - Maximum allowed size (default: 10GB)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFileSize(sizeBytes, maxSizeBytes = 10 * 1024 * 1024 * 1024) {
    if (typeof sizeBytes !== 'number' || sizeBytes < 0) {
        return { valid: false, error: 'Invalid file size' }
    }

    if (sizeBytes > maxSizeBytes) {
        const maxGB = (maxSizeBytes / (1024 * 1024 * 1024)).toFixed(1)
        return { valid: false, error: `File exceeds maximum size of ${maxGB}GB` }
    }

    return { valid: true }
}

/**
 * Validate imported course JSON structure
 * @param {object} data - Imported JSON data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCourseImportJSON(data) {
    const errors = []

    if (!data || typeof data !== 'object') {
        return { valid: false, errors: ['Invalid JSON: must be an object'] }
    }

    // Required fields
    if (!data.title || typeof data.title !== 'string') {
        errors.push('Missing or invalid course title')
    }

    // Validate modules array
    if (data.modules) {
        if (!Array.isArray(data.modules)) {
            errors.push('Modules must be an array')
        } else {
            data.modules.forEach((module, i) => {
                if (!module.title) {
                    errors.push(`Module ${i + 1}: missing title`)
                }
                if (module.videos && !Array.isArray(module.videos)) {
                    errors.push(`Module ${i + 1}: videos must be an array`)
                }
            })
        }
    }

    return { valid: errors.length === 0, errors }
}

/**
 * Sanitize user notes content
 * @param {string} notes - User notes text
 * @returns {string} Sanitized notes
 */
export function sanitizeNotes(notes) {
    if (typeof notes !== 'string') return ''

    // Preserve line breaks but sanitize HTML
    return notes
        .split('\n')
        .map(line => sanitizeHTML(line))
        .join('\n')
        .slice(0, 10000) // Max 10k characters
}

/**
 * Sanitize and validate description
 * @param {string} description - Description text
 * @returns {{ valid: boolean, sanitized: string }}
 */
export function validateDescription(description) {
    if (typeof description !== 'string') {
        return { valid: true, sanitized: '' }
    }

    const sanitized = sanitizeHTML(description.trim()).slice(0, 5000)
    return { valid: true, sanitized }
}

/**
 * Generate safe error message (hide sensitive paths)
 * @param {Error} error - Original error
 * @param {string} context - Error context for user
 * @returns {string} Safe error message
 */
export function getSafeErrorMessage(error, context = 'Operation') {
    // Don't expose file paths or system details
    const message = error.message || 'Unknown error'

    // Remove any file paths (Windows or Unix style)
    const sanitized = message
        .replace(/[A-Za-z]:\\[^\s]+/g, '[file]') // Windows paths
        .replace(/\/[^\s]+/g, '[path]') // Unix paths
        .replace(/file:\/\/[^\s]+/g, '[file]') // File URLs

    return `${context} failed: ${sanitized}`
}

export default {
    sanitizeHTML,
    validateCourseTitle,
    validateModuleTitle,
    validateDuration,
    validateTimestamp,
    validateVideoFile,
    validateFileSize,
    validateCourseImportJSON,
    sanitizeNotes,
    validateDescription,
    getSafeErrorMessage,
    SUPPORTED_VIDEO_EXTENSIONS
}
