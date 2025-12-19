/**
 * Time utilities for formatting dates and durations
 */

/**
 * Get relative time string from timestamp
 * @param {string|Date|number} timestamp - The timestamp to convert
 * @returns {string} Relative time string like "2 hours ago"
 */
export function getRelativeTime(timestamp) {
    if (!timestamp) return ''

    const now = new Date()
    const date = new Date(timestamp)
    const diffMs = now - date
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)
    const diffWeek = Math.floor(diffDay / 7)
    const diffMonth = Math.floor(diffDay / 30)

    if (diffSec < 60) {
        return 'just now'
    } else if (diffMin < 60) {
        return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`
    } else if (diffHour < 24) {
        return `${diffHour} ${diffHour === 1 ? 'hour' : 'hours'} ago`
    } else if (diffDay === 1) {
        return 'yesterday'
    } else if (diffDay < 7) {
        return `${diffDay} days ago`
    } else if (diffWeek < 4) {
        return `${diffWeek} ${diffWeek === 1 ? 'week' : 'weeks'} ago`
    } else if (diffMonth < 12) {
        return `${diffMonth} ${diffMonth === 1 ? 'month' : 'months'} ago`
    } else {
        return date.toLocaleDateString()
    }
}

/**
 * Format a date to a readable string
 * @param {string|Date|number} timestamp - The timestamp to format
 * @returns {string} Formatted date string
 */
export function formatDate(timestamp) {
    if (!timestamp) return ''

    const date = new Date(timestamp)
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
}

/**
 * Format a date with time
 * @param {string|Date|number} timestamp - The timestamp to format
 * @returns {string} Formatted date and time string
 */
export function formatDateTime(timestamp) {
    if (!timestamp) return ''

    const date = new Date(timestamp)
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}
