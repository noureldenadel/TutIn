import { Link } from 'react-router-dom'
import { Sun, Moon, Settings, Menu } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useSidebar } from '../../contexts/SidebarContext'
import { useState } from 'react'
import SettingsModal from '../settings/SettingsModal'

function Header() {
    const { theme, toggleTheme, isDark } = useTheme()
    const { toggleSidebar } = useSidebar()
    const [showSettings, setShowSettings] = useState(false)

    return (
        <>
            <header className="h-16 sticky top-0 z-50 bg-black/60 backdrop-blur-2xl border-b border-white/5 transition-all duration-300">
                <div className="h-full px-4 flex items-center justify-between">
                    {/* Left: Hamburger + Logo */}
                    <div className="flex items-center gap-4">
                        {/* Hamburger Menu */}
                        <button
                            onClick={toggleSidebar}
                            className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-all duration-200"
                            aria-label="Toggle sidebar"
                        >
                            <Menu className="w-6 h-6" />
                        </button>

                        {/* Logo */}
                        <Link
                            to="/"
                            className="flex items-center gap-2 group"
                        >
                            <span className="text-xl font-bold text-white tracking-tight group-hover:text-neutral-300 transition-colors">
                                TutIn
                            </span>
                        </Link>
                    </div>

                    {/* Spacer for centering actions */}
                    <div className="flex-1" />

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {/* Theme Toggle */}
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-all duration-200"
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
                            className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-all duration-200"
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
        </>
    )
}

export default Header

