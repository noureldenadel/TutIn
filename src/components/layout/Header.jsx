import { Link } from 'react-router-dom'
import { Sun, Moon, Settings, GraduationCap } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useState } from 'react'
import SettingsModal from '../settings/SettingsModal'

function Header() {
    const { theme, toggleTheme, isDark } = useTheme()
    const [showSettings, setShowSettings] = useState(false)

    return (
        <>
            <header className="h-16 bg-white dark:bg-dark-surface border-b border-light-border dark:border-dark-border sticky top-0 z-40">
                <div className="container mx-auto px-4 h-full flex items-center justify-between">
                    {/* Logo */}
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-xl font-bold text-primary hover:opacity-80 transition-opacity"
                    >
                        <span>TutIn</span>
                    </Link>

                    {/* Spacer for centering actions */}
                    <div className="flex-1" />

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {/* Theme Toggle */}
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            {isDark ? (
                                <Sun className="w-5 h-5 text-dark-text-primary" />
                            ) : (
                                <Moon className="w-5 h-5 text-light-text-primary" />
                            )}
                        </button>

                        {/* Settings */}
                        <button
                            onClick={() => setShowSettings(true)}
                            className="p-2 rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            aria-label="Open settings"
                        >
                            <Settings className="w-5 h-5 text-light-text-primary dark:text-dark-text-primary" />
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

