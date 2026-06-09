import { Link, useLocation } from 'react-router-dom'
import { Sun, Moon, Settings, Menu, Search, X, FolderOpen, Youtube, HardDrive, ChevronDown, Plus, Link2 } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useSidebar } from '../../contexts/SidebarContext'
import { useSearch } from '../../contexts/SearchContext'
import { useState } from 'react'
import SettingsModal from '../settings/SettingsModal'
import YouTubeImportModal from '../course/YouTubeImportModal'
import GoogleDriveImportModal from '../course/GoogleDriveImportModal'
import ExternalLinkImportModal from '../course/ExternalLinkImportModal'
import { scanCourseFolder, pickFolder } from '../../utils/fileSystem'
import { useSettings } from '../../contexts/SettingsContext'
import { useNotification } from '../../contexts/NotificationContext'

function Header({ onImportData, onYouTubeImport, onGoogleDriveImport }) {
    const { settings } = useSettings()
    const { theme, toggleTheme, isDark } = useTheme()
    const { toggleSidebar } = useSidebar()
    const { searchQuery, setSearchQuery } = useSearch()
    const location = useLocation()
    const [showSettings, setShowSettings] = useState(false)
    const [showAddMenu, setShowAddMenu] = useState(false)
    const [showYouTubeModal, setShowYouTubeModal] = useState(false)
    const [showGoogleDriveModal, setShowGoogleDriveModal] = useState(false)
    const [showExternalLinkModal, setShowExternalLinkModal] = useState(false)
    const { showNotification } = useNotification()

    // Only show search on homepage
    const isHomePage = location.pathname === '/'

    async function handleImportClick() {
        try {
            const handle = await pickFolder()
            if (handle) {
                const courseData = await scanCourseFolder(handle, settings.autoDetectThumbnails)
                if (courseData) {
                    window.__homePageHandlers?.handleImportData?.(courseData)
                }
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Import failed:', err)
                showNotification('Import failed: ' + err.message, 'error')
            }
        }
        setShowAddMenu(false)
    }

    return (
        <>
            <header className="h-16 sticky top-0 z-50 bg-white dark:bg-black/60 backdrop-blur-2xl border-b border-gray-200 dark:border-white/5 transition-all duration-300">
                <div className="h-full px-4 flex items-center">
                    {/* Left: Hamburger + Logo */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                        {/* Hamburger Menu */}
                        <button
                            onClick={toggleSidebar}
                            className="p-2 rounded-full text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all duration-200"
                            aria-label="Toggle sidebar"
                        >
                            <Menu className="w-6 h-6" />
                        </button>

                        {/* Logo */}
                        <Link
                            to="/"
                            className="flex items-center gap-2 group"
                        >
                            <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight group-hover:text-gray-600 dark:group-hover:text-neutral-300 transition-colors">
                                TutIn
                            </span>
                        </Link>
                    </div>

                    {/* Spacer - Left */}
                    <div className="flex-1" />

                    {/* Center: Search Bar (only on homepage) */}
                    {isHomePage && (
                        <div className="w-full max-w-md mx-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                                <input
                                    type="text"
                                    placeholder="Search courses..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-10 py-2 rounded-full border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-neutral-400 focus:border-gray-400 dark:focus:border-white/20 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 transition-all"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full"
                                    >
                                        <X className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Spacer - Right */}
                    <div className="flex-1" />

                    {/* Right: Add Course + Theme + Settings */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Add Course Split Button (only on homepage) */}
                        {isHomePage && (
                            <div className="relative flex">
                                {/* Main button - imports local folder */}
                                <button
                                    onClick={handleImportClick}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-content hover:bg-primary-hover rounded-l-full transition-all duration-200 border-r border-gray-700 dark:border-white/10"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline text-sm font-medium">Add Course</span>
                                </button>
                                {/* Dropdown toggle */}
                                <button
                                    onClick={() => setShowAddMenu(!showAddMenu)}
                                    className="px-2 py-2 bg-primary text-primary-content hover:bg-primary-hover rounded-r-full transition-all duration-200"
                                >
                                    <ChevronDown className="w-4 h-4" />
                                </button>

                                {showAddMenu && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
                                        <div className="absolute right-0 top-full mt-2 w-48 py-2 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-gray-200 dark:border-white/10 z-20">
                                            <button
                                                onClick={handleImportClick}
                                                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2"
                                            >
                                                <FolderOpen className="w-4 h-4" />
                                                Local Folder
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowYouTubeModal(true)
                                                    setShowAddMenu(false)
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2"
                                            >
                                                <Youtube className="w-4 h-4 text-red-500" />
                                                From YouTube
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowGoogleDriveModal(true)
                                                    setShowAddMenu(false)
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2"
                                            >
                                                <HardDrive className="w-4 h-4 text-primary" />
                                                From Google Drive
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowExternalLinkModal(true)
                                                    setShowAddMenu(false)
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2"
                                            >
                                                <Link2 className="w-4 h-4 text-blue-500" />
                                                From External Link
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Theme Toggle */}
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-full text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all duration-200"
                            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            {isDark ? (
                                <Sun className="w-5 h-5" />
                            ) : (
                                <Moon className="w-5 h-5" />
                            )}
                        </button>

                        {/* Settings */}
                        <button
                            onClick={() => setShowSettings(true)}
                            className="p-2 rounded-full text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all duration-200"
                            aria-label="Open settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Settings Modal */}
            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
            />

            {/* YouTube Import Modal */}
            <YouTubeImportModal
                isOpen={showYouTubeModal}
                onClose={() => setShowYouTubeModal(false)}
                onImport={(data) => {
                    setShowYouTubeModal(false)
                    window.__homePageHandlers?.handleYouTubeImport?.(data)
                }}
            />

            {/* Google Drive Import Modal */}
            <GoogleDriveImportModal
                isOpen={showGoogleDriveModal}
                onClose={() => setShowGoogleDriveModal(false)}
                onImport={(data) => {
                    setShowGoogleDriveModal(false)
                    window.__homePageHandlers?.handleGoogleDriveImport?.(data)
                }}
            />

            {/* External Link Import Modal */}
            <ExternalLinkImportModal
                isOpen={showExternalLinkModal}
                onClose={() => setShowExternalLinkModal(false)}
                onImport={(data) => {
                    setShowExternalLinkModal(false)
                    window.__homePageHandlers?.handleExternalLinkImport?.(data)
                }}
            />
        </>
    )
}

export default Header
