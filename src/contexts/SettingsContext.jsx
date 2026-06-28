import { createContext, useContext, useState, useEffect, useRef } from 'react'

const defaultSettings = {
    // Appearance
    theme: 'auto', // light, dark, auto
    accentColor: '#3B82F6',

    // Playback
    autoPlayNext: true,
    resumePlayback: true,
    playbackSpeed: 1,
    volume: 0.75,
    captionsEnabled: false,
    captionPosition: { x: 50, y: 85 },
    captionFontSize: 'medium', // small, medium, large
    captionBackground: true,
    captionLanguage: 'source',
    autoMarkCompleteAt: 95, // percentage
    progressCalculationMode: 'videos', // 'videos' = count completed videos, 'duration' = total time watched
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
    viewMode: 'grid', // grid, list
    autoDetectThumbnails: false,

    // API Keys
    googleApiKey: '', // Covers both YouTube and Google Drive APIs
    openRouterApiKey: '',
    openRouterModel: 'google/gemini-2.0-flash-exp:free',
    aiDevice: 'auto', // 'auto', 'gpu', 'cpu'
    dubbingEnabled: false,
    dubbingDevice: 'auto', // 'auto', 'gpu', 'cpu'
}

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState(() => {
        try {
            const saved = localStorage.getItem('tutin_settings')
            let merged = defaultSettings
            if (saved) {
                merged = { ...defaultSettings, ...JSON.parse(saved) }
            }

            // Migration: Move old separate keys to consolidated googleApiKey
            const oldYoutubeKey = localStorage.getItem('youtube_api_key')
            if (oldYoutubeKey && !merged.googleApiKey) {
                merged.googleApiKey = oldYoutubeKey
                localStorage.removeItem('youtube_api_key')
            }
            if (saved) {
                const parsed = JSON.parse(saved)
                if (parsed.youtubeApiKey && !merged.googleApiKey) {
                    merged.googleApiKey = parsed.youtubeApiKey
                }
                if (parsed.googleDriveApiKey && !merged.googleApiKey) {
                    merged.googleApiKey = parsed.googleDriveApiKey
                }
                // Cleanup old keys from the merged object
                delete merged.youtubeApiKey
                delete merged.googleDriveApiKey
            }

            // One-time migration: move old .env OpenRouter key if user had one
            const envKey = import.meta.env.VITE_OPENROUTER_API_KEY
            if (envKey && !merged.openRouterApiKey) {
                merged.openRouterApiKey = envKey
            }

            // Migration: volume
            const oldVolume = localStorage.getItem('tutin_volume')
            if (oldVolume && !merged.volume) {
                merged.volume = parseFloat(oldVolume)
                localStorage.removeItem('tutin_volume')
            }

            // Migration: playback speed
            const oldSpeed = localStorage.getItem('tutin_playback_speed')
            if (oldSpeed && !merged.playbackSpeed) {
                merged.playbackSpeed = parseFloat(oldSpeed)
                localStorage.removeItem('tutin_playback_speed')
            }

            // Migration: captions
            const oldCaptions = localStorage.getItem('tutin_captions_enabled')
            if (oldCaptions && merged.captionsEnabled === false) {
                merged.captionsEnabled = oldCaptions === 'true'
                localStorage.removeItem('tutin_captions_enabled')
            }

            // Migration: caption position
            const oldPosition = localStorage.getItem('tutin_caption_position')
            if (oldPosition && !merged.captionPosition) {
                merged.captionPosition = JSON.parse(oldPosition)
                localStorage.removeItem('tutin_caption_position')
            }

            return merged
        } catch (e) {
            console.error('Failed to load settings:', e)
        }
        return defaultSettings
    })

    // Track whether the initial server load has completed
    const isInitializedRef = useRef(false)

    // Save settings to localStorage and server
    useEffect(() => {
        try {
            localStorage.setItem('tutin_settings', JSON.stringify(settings))
            
            // Don't sync to server during initial load to avoid a feedback loop
            if (!isInitializedRef.current) return

            // Sync with backend
            import('../utils/api.js').then(api => {
                api.put('/api/settings', settings).catch(err => {
                    console.warn('Settings sync to server delayed:', err.message)
                })
            })
        } catch (e) {
            console.error('Failed to save settings:', e)
        }
    }, [settings])

    // Initial load from server
    useEffect(() => {
        import('../utils/api.js').then(api => {
            api.get('/api/settings').then(serverSettings => {
                if (serverSettings && Object.keys(serverSettings).length > 0) {
                    setSettings(prev => ({ ...prev, ...serverSettings }))
                }
            }).catch(err => {
                console.warn('Initial settings load from server failed:', err.message)
            }).finally(() => {
                isInitializedRef.current = true
            })
        })
    }, [])

    // Track dark mode state to re-apply accent colors when theme changes
    const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'))
    useEffect(() => {
        const observer = new MutationObserver(() => {
            setDarkMode(document.documentElement.classList.contains('dark'))
        })
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        return () => observer.disconnect()
    }, [])

    // Apply appearance settings as CSS variables
    useEffect(() => {
        const root = document.documentElement

        // Apply accent color
        const isDark = root.classList.contains('dark')
        if (settings.accentColor === 'classic') {
            root.style.setProperty('--primary', 'var(--classic-primary)')
            root.style.setProperty('--color-primary', 'var(--classic-primary)')
            root.style.setProperty('--primary-content', 'var(--classic-content)')
            root.style.setProperty('--primary-hover', 'var(--classic-hover)')
            // --primary-fg: visible color for text, icons, and progress bars
            root.style.setProperty('--primary-fg', isDark ? 'rgba(255, 255, 255, 0.85)' : 'var(--classic-primary)')
        } else if (settings.accentColor) {
            root.style.setProperty('--primary', settings.accentColor)
            root.style.setProperty('--color-primary', settings.accentColor)
            root.style.setProperty('--primary-content', '#FFFFFF')
            root.style.setProperty('--primary-fg', settings.accentColor)
            // Calculate hover variant: lighten in dark mode, darken in light mode
            root.style.setProperty('--primary-hover', isDark
                ? `color-mix(in srgb, ${settings.accentColor}, white 20%)`
                : `color-mix(in srgb, ${settings.accentColor}, black 15%)`)
        }
    }, [settings.accentColor, darkMode])


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
