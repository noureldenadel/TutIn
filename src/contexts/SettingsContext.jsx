import { createContext, useContext, useState, useEffect } from 'react'

const defaultSettings = {
    // Appearance
    theme: 'auto', // light, dark, auto
    accentColor: '#3B82F6',

    density: 'comfortable', // comfortable, compact
    fontSize: 'medium', // small, medium, large

    // Playback
    defaultSpeed: 1.0,
    autoPlayNext: true,
    resumePlayback: true,
    autoMarkCompleteAt: 95, // percentage
    progressCalculationMode: 'videos', // 'videos' = count completed videos, 'duration' = total time watched
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

    // Save settings to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('mearn_settings', JSON.stringify(settings))
        } catch (e) {
            console.error('Failed to save settings:', e)
        }
    }, [settings])

    // Apply appearance settings as CSS variables
    useEffect(() => {
        const root = document.documentElement

        // Apply accent color
        if (settings.accentColor) {
            root.style.setProperty('--primary', settings.accentColor)
            root.style.setProperty('--color-primary', settings.accentColor)
            // Calculate a darker variant (simple approach)
            root.style.setProperty('--primary-hover', settings.accentColor)
        }

        // Apply font size
        const fontSizeMap = {
            small: '14px',
            medium: '16px',
            large: '18px'
        }
        root.style.setProperty('--base-font-size', fontSizeMap[settings.fontSize] || '16px')
        document.body.style.fontSize = fontSizeMap[settings.fontSize] || '16px'

        // Apply density (padding/spacing multiplier)
        const densityScale = settings.density === 'compact' ? '0.75' : '1'
        root.style.setProperty('--density-scale', densityScale)

        // Apply density class to body
        if (settings.density === 'compact') {
            document.body.classList.add('compact-mode')
        } else {
            document.body.classList.remove('compact-mode')
        }
    }, [settings.accentColor, settings.fontSize, settings.density])

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
