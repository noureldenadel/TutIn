import { createContext, useContext, useState, useEffect } from 'react'

const defaultSettings = {
    // Appearance
    theme: 'auto', // light, dark, auto
    accentColor: '#3B82F6',
    sidebarPosition: 'right',
    density: 'comfortable', // comfortable, compact
    fontSize: 'medium', // small, medium, large

    // Playback
    defaultSpeed: 1.0,
    autoPlayNext: true,
    resumePlayback: true,
    autoMarkCompleteAt: 95, // percentage
    skipIntro: 0, // seconds
    skipOutro: 0, // seconds
    keyboardShortcuts: true,

    // Goals
    dailyVideoGoal: 3,
    weeklyHoursGoal: 10,
    reminders: false,
    streakTracking: true,

    // UI
    sidebarCollapsed: false,
    gridColumns: 3,
    showCompletedVideos: true,
    viewMode: 'grid' // grid, list
}

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState(() => {
        try {
            const saved = localStorage.getItem('mearn_settings')
            if (saved) {
                return { ...defaultSettings, ...JSON.parse(saved) }
            }
        } catch (e) {
            console.error('Failed to load settings:', e)
        }
        return defaultSettings
    })

    useEffect(() => {
        try {
            localStorage.setItem('mearn_settings', JSON.stringify(settings))
        } catch (e) {
            console.error('Failed to save settings:', e)
        }
    }, [settings])

    const updateSettings = (updates) => {
        setSettings(prev => ({ ...prev, ...updates }))
    }

    const resetSettings = () => {
        setSettings(defaultSettings)
    }

    const getSetting = (key) => {
        return settings[key]
    }

    const value = {
        settings,
        updateSettings,
        resetSettings,
        getSetting
    }

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    )
}

export function useSettings() {
    const context = useContext(SettingsContext)
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider')
    }
    return context
}

export default SettingsContext
