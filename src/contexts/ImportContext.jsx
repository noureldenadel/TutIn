import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ImportContext = createContext(null)

/**
 * Provides a clean channel for Header → HomePage communication,
 * replacing the fragile window.__homePageHandlers global.
 *
 * The Header calls dispatch functions to push import data.
 * HomePage registers handlers via useImportHandlers() to consume them.
 */
export function ImportProvider({ children }) {
    // Pending import data set by Header, consumed by HomePage
    const [pendingImport, setPendingImport] = useState(null)
    const [pendingYouTube, setPendingYouTube] = useState(null)
    const [pendingGoogleDrive, setPendingGoogleDrive] = useState(null)
    const [pendingExternalLink, setPendingExternalLink] = useState(null)

    // Ref to the loadCourses callback registered by HomePage
    const loadCoursesRef = useRef(null)

    const dispatchImport = useCallback((data) => setPendingImport(data), [])
    const dispatchYouTube = useCallback((data) => setPendingYouTube(data), [])
    const dispatchGoogleDrive = useCallback((data) => setPendingGoogleDrive(data), [])
    const dispatchExternalLink = useCallback((data) => setPendingExternalLink(data), [])
    const dispatchLoadCourses = useCallback(() => loadCoursesRef.current?.(), [])

    const clearImport = useCallback(() => setPendingImport(null), [])
    const clearYouTube = useCallback(() => setPendingYouTube(null), [])
    const clearGoogleDrive = useCallback(() => setPendingGoogleDrive(null), [])
    const clearExternalLink = useCallback(() => setPendingExternalLink(null), [])

    const registerLoadCourses = useCallback((fn) => {
        loadCoursesRef.current = fn
    }, [])

    const value = {
        // For Header (dispatchers)
        dispatchImport,
        dispatchYouTube,
        dispatchGoogleDrive,
        dispatchExternalLink,
        dispatchLoadCourses,

        // For HomePage (consumers)
        pendingImport,
        pendingYouTube,
        pendingGoogleDrive,
        pendingExternalLink,
        clearImport,
        clearYouTube,
        clearGoogleDrive,
        clearExternalLink,
        registerLoadCourses,
    }

    return (
        <ImportContext.Provider value={value}>
            {children}
        </ImportContext.Provider>
    )
}

export function useImport() {
    const context = useContext(ImportContext)
    if (!context) {
        throw new Error('useImport must be used within an ImportProvider')
    }
    return context
}

export default ImportContext
