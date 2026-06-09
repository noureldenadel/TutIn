/**
 * Validation and sanitization utilities
 */

/**
 * Validates and sanitizes a module title.
 * @returns {{ valid: boolean, error?: string, sanitized?: string }}
 */
export function validateCourseTitle(title) {
    if (!title || !title.trim()) {
        return { valid: false, error: 'Course title cannot be empty.' }
    }

    const trimmed = title.trim()

    if (trimmed.length > 200) {
        return { valid: false, error: 'Course title must be 200 characters or less.' }
    }

    const sanitized = sanitizeHTML(trimmed)

    if (!sanitized) {
        return { valid: false, error: 'Course title cannot be empty after sanitization.' }
    }

    return { valid: true, sanitized }
}

/**
 * Validates and sanitizes a module title.
 * @param {string} title - The module title to validate
 * @returns {{ valid: boolean, error?: string, sanitized?: string }}
 */
export function validateModuleTitle(title) {
    if (!title || !title.trim()) {
        return { valid: false, error: 'Module title cannot be empty.' }
    }

    const trimmed = title.trim()

    if (trimmed.length > 200) {
        return { valid: false, error: 'Module title must be 200 characters or less.' }
    }

    const sanitized = sanitizeHTML(trimmed)

    if (!sanitized) {
        return { valid: false, error: 'Module title cannot be empty after sanitization.' }
    }

    return { valid: true, sanitized }
}

/**
 * Strips HTML tags from a string to prevent XSS.
 * @param {string} text - The text to sanitize
 * @returns {string} The sanitized text with HTML tags removed
 */
export function sanitizeHTML(text) {
    if (typeof text !== 'string') return ''
    return text.replace(/<[^>]*>/g, '')
}
