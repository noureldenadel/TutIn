import { useState, useRef } from 'react'
import {
    X, Sun, Moon, Monitor, Palette, Layout, Type,
    Play, SkipForward, FastForward, Check, Download, Upload, Database, AlertTriangle, Folder, FolderOpen
} from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { useTheme } from '../../contexts/ThemeContext'
import { exportAllData, clearAllData, importData, recalculateAllCoursesProgress } from '../../utils/db'
import { pickRootFolder, getRootFolderName, hasRootFolderAccess, clearRootFolderHandle, isFileSystemAccessSupported, requestRootFolderPermission, hasStoredRootFolder } from '../../utils/fileSystem'

const accentColors = [
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Orange', value: '#F97316' },
    { name: 'Green', value: '#22C55E' },
    { name: 'Teal', value: '#14B8A6' },
    { name: 'Cyan', value: '#06B6D4' }
]

const densityOptions = [
    { label: 'Comfortable', value: 'comfortable', description: 'More spacing, easier to read' },
    { label: 'Compact', value: 'compact', description: 'Less spacing, more content visible' }
]

const fontSizeOptions = [
    { label: 'Small', value: 'small' },
    { label: 'Medium', value: 'medium' },
    { label: 'Large', value: 'large' }
]

const completionThresholds = [
    { label: '90%', value: 90 },
    { label: '95%', value: 95 },
    { label: '100%', value: 100 }
]

function SettingsModal({ isOpen, onClose }) {
    const { settings, updateSettings, resetSettings } = useSettings()
    const { theme, setTheme } = useTheme()
    const [activeTab, setActiveTab] = useState('appearance')

    if (!isOpen) return null

    const tabs = [
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'playback', label: 'Playback', icon: Play },
        { id: 'shortcuts', label: 'Shortcuts', icon: FastForward },
        { id: 'data', label: 'Data', icon: Database }
    ]

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                        Settings
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Tabs Sidebar */}
                    <div className="w-48 border-r border-light-border dark:border-dark-border p-2 flex-shrink-0">
                        {tabs.map(tab => {
                            const Icon = tab.icon
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                    w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm
                    transition-colors mb-1
                    ${activeTab === tab.id
                                            ? 'bg-primary/10 text-primary font-medium'
                                            : 'hover:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary'
                                        }
                  `}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {/* Appearance Tab */}
                        {activeTab === 'appearance' && (
                            <div className="space-y-6">
                                {/* Theme */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">Theme</label>
                                    <div className="flex gap-3">
                                        {[
                                            { value: 'light', label: 'Light', icon: Sun },
                                            { value: 'dark', label: 'Dark', icon: Moon },
                                            { value: 'auto', label: 'System', icon: Monitor }
                                        ].map(option => {
                                            const Icon = option.icon
                                            const isSelected = theme === option.value ||
                                                (option.value === 'auto' && settings.theme === 'auto')
                                            return (
                                                <button
                                                    key={option.value}
                                                    onClick={() => {
                                                        if (option.value === 'auto') {
                                                            updateSettings({ theme: 'auto' })
                                                            // Let system preference take over
                                                            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
                                                            setTheme(prefersDark ? 'dark' : 'light')
                                                        } else {
                                                            updateSettings({ theme: option.value })
                                                            setTheme(option.value)
                                                        }
                                                    }}
                                                    className={`
                            flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all
                            ${isSelected
                                                            ? 'border-primary bg-primary/5'
                                                            : 'border-light-border dark:border-dark-border hover:border-primary/50'
                                                        }
                          `}
                                                >
                                                    <Icon className={`w-5 h-5 ${isSelected ? 'text-primary' : ''}`} />
                                                    <span className="text-sm">{option.label}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Accent Color */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">Accent Color</label>
                                    <div className="flex flex-wrap gap-2">
                                        {accentColors.map(color => (
                                            <button
                                                key={color.value}
                                                onClick={() => updateSettings({ accentColor: color.value })}
                                                className={`
                          w-10 h-10 rounded-full transition-all flex items-center justify-center
                          ${settings.accentColor === color.value
                                                        ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-dark-surface'
                                                        : 'hover:scale-110'
                                                    }
                        `}
                                                style={{ backgroundColor: color.value }}
                                                title={color.name}
                                            >
                                                {settings.accentColor === color.value && (
                                                    <Check className="w-5 h-5 text-white" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>



                                {/* Density */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">Density</label>
                                    <div className="space-y-2">
                                        {densityOptions.map(option => (
                                            <button
                                                key={option.value}
                                                onClick={() => updateSettings({ density: option.value })}
                                                className={`
                          w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left
                          ${settings.density === option.value
                                                        ? 'border-primary bg-primary/5'
                                                        : 'border-light-border dark:border-dark-border hover:border-primary/50'
                                                    }
                        `}
                                            >
                                                <div>
                                                    <div className="font-medium text-sm">{option.label}</div>
                                                    <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                        {option.description}
                                                    </div>
                                                </div>
                                                {settings.density === option.value && (
                                                    <Check className="w-5 h-5 text-primary" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Font Size */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">Font Size</label>
                                    <div className="flex gap-3">
                                        {fontSizeOptions.map(option => (
                                            <button
                                                key={option.value}
                                                onClick={() => updateSettings({ fontSize: option.value })}
                                                className={`
                          flex-1 p-3 rounded-lg border-2 transition-all
                          ${settings.fontSize === option.value
                                                        ? 'border-primary bg-primary/5'
                                                        : 'border-light-border dark:border-dark-border hover:border-primary/50'
                                                    }
                        `}
                                            >
                                                <Type className={`w-4 h-4 mx-auto mb-1 ${option.value === 'small' ? 'scale-75' :
                                                    option.value === 'large' ? 'scale-125' : ''
                                                    }`} />
                                                <span className="text-sm">{option.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Playback Tab */}
                        {activeTab === 'playback' && (
                            <div className="space-y-6">

                                {/* Resume Playback */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium text-sm">Resume Playback</div>
                                        <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            Continue from where you left off
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => updateSettings({ resumePlayback: !settings.resumePlayback })}
                                        className={`
                      w-12 h-6 rounded-full transition-colors relative
                      ${settings.resumePlayback ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}
                    `}
                                    >
                                        <div className={`
                      absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                      ${settings.resumePlayback ? 'translate-x-7' : 'translate-x-1'}
                    `} />
                                    </button>
                                </div>

                                {/* Auto-mark Complete Threshold */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">
                                        Mark Complete When Watched
                                    </label>
                                    <div className="flex gap-3">
                                        {completionThresholds.map(option => (
                                            <button
                                                key={option.value}
                                                onClick={() => updateSettings({ autoMarkCompleteAt: option.value })}
                                                className={`
                          flex-1 p-3 rounded-lg border-2 transition-all text-center
                          ${settings.autoMarkCompleteAt === option.value
                                                        ? 'border-primary bg-primary/5'
                                                        : 'border-light-border dark:border-dark-border hover:border-primary/50'
                                                    }
                        `}
                                            >
                                                <span className="text-sm font-medium">{option.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Progress Calculation Mode */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">
                                        Progress Calculation
                                    </label>
                                    <div className="space-y-2">
                                        {[
                                            { value: 'videos', label: 'By Videos Completed', description: 'Count of completed videos ÷ total videos' },
                                            { value: 'duration', label: 'By Time Watched', description: 'Total time watched ÷ total course duration' }
                                        ].map(option => (
                                            <button
                                                key={option.value}
                                                onClick={async () => {
                                                    updateSettings({ progressCalculationMode: option.value })
                                                    // Recalculate all courses with the new mode
                                                    await recalculateAllCoursesProgress(option.value)
                                                }}
                                                className={`
                          w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left
                          ${settings.progressCalculationMode === option.value
                                                        ? 'border-primary bg-primary/5'
                                                        : 'border-light-border dark:border-dark-border hover:border-primary/50'
                                                    }
                        `}
                                            >
                                                <div>
                                                    <div className="font-medium text-sm">{option.label}</div>
                                                    <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                                        {option.description}
                                                    </div>
                                                </div>
                                                {settings.progressCalculationMode === option.value && (
                                                    <Check className="w-5 h-5 text-primary" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Default Playback Speed */}
                                <div>
                                    <label className="block text-sm font-medium mb-3">Default Playback Speed</label>
                                    <select
                                        value={settings.defaultSpeed}
                                        onChange={(e) => updateSettings({ defaultSpeed: parseFloat(e.target.value) })}
                                        className="w-full p-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary outline-none"
                                    >
                                        {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                                            <option key={speed} value={speed}>{speed}x</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Skip Intro */}
                                <div>
                                    <label className="block text-sm font-medium mb-2">Skip Intro (seconds)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="60"
                                        value={settings.skipIntro}
                                        onChange={(e) => updateSettings({ skipIntro: parseInt(e.target.value) || 0 })}
                                        className="w-full p-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary outline-none"
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                        Skip this many seconds at the start of each video
                                    </p>
                                </div>

                                {/* Skip Outro */}
                                <div>
                                    <label className="block text-sm font-medium mb-2">Skip Outro (seconds)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="60"
                                        value={settings.skipOutro}
                                        onChange={(e) => updateSettings({ skipOutro: parseInt(e.target.value) || 0 })}
                                        className="w-full p-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-primary outline-none"
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                        Consider video complete this many seconds before the end
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Shortcuts Tab */}
                        {activeTab === 'shortcuts' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <div className="font-medium text-sm">Enable Keyboard Shortcuts</div>
                                        <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            Use keyboard to control video playback
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => updateSettings({ keyboardShortcuts: !settings.keyboardShortcuts })}
                                        className={`
                      w-12 h-6 rounded-full transition-colors relative
                      ${settings.keyboardShortcuts ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}
                    `}
                                    >
                                        <div className={`
                      absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                      ${settings.keyboardShortcuts ? 'translate-x-7' : 'translate-x-1'}
                    `} />
                                    </button>
                                </div>

                                <div className="border border-light-border dark:border-dark-border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-light-surface dark:bg-dark-bg">
                                            <tr>
                                                <th className="text-left p-3 font-medium">Action</th>
                                                <th className="text-left p-3 font-medium">Shortcut</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[
                                                { action: 'Play / Pause', key: 'Space or K' },
                                                { action: 'Seek Back 5s', key: '← Arrow' },
                                                { action: 'Seek Forward 5s', key: '→ Arrow' },
                                                { action: 'Seek Back 10s', key: 'J' },
                                                { action: 'Seek Forward 10s', key: 'L' },
                                                { action: 'Jump to 0%-90%', key: '0-9' },
                                                { action: 'Volume Up', key: '↑ Arrow' },
                                                { action: 'Volume Down', key: '↓ Arrow' },
                                                { action: 'Mute / Unmute', key: 'M' },
                                                { action: 'Decrease Speed', key: '< or ,' },
                                                { action: 'Increase Speed', key: '> or .' },
                                                { action: 'Toggle Auto-play', key: 'A' },
                                                { action: 'Fullscreen', key: 'F' },
                                                { action: 'Picture-in-Picture', key: 'P' },
                                                { action: 'Next Video', key: 'Shift + N' }
                                            ].map((shortcut, i) => (
                                                <tr key={i} className="border-t border-light-border dark:border-dark-border">
                                                    <td className="p-3">{shortcut.action}</td>
                                                    <td className="p-3">
                                                        <kbd className="px-2 py-1 bg-light-surface dark:bg-dark-bg rounded text-xs font-mono">
                                                            {shortcut.key}
                                                        </kbd>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Data Tab */}
                        {activeTab === 'data' && (
                            <div className="space-y-6">
                                {/* Courses Folder */}
                                <div>
                                    <h3 className="text-lg font-medium text-light-text-primary dark:text-dark-text-primary mb-4 flex items-center gap-2">
                                        <Folder className="w-5 h-5" />
                                        Courses Folder
                                    </h3>
                                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
                                        Set a root folder containing all your courses. This way you only need to grant access once per browser session.
                                    </p>

                                    {isFileSystemAccessSupported() ? (
                                        <>
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="flex-1 px-3 py-2 bg-light-surface dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border">
                                                    {hasRootFolderAccess() ? (
                                                        <div className="flex items-center gap-2 text-success">
                                                            <FolderOpen className="w-4 h-4" />
                                                            <span className="font-medium">{getRootFolderName()}</span>
                                                            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">(Access granted)</span>
                                                        </div>
                                                    ) : getRootFolderName() ? (
                                                        <div className="flex items-center gap-2 text-warning">
                                                            <Folder className="w-4 h-4" />
                                                            <span>{getRootFolderName()}</span>
                                                            <span className="text-xs">(Click to grant access this session)</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                                            No folder selected
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex gap-2 flex-wrap">
                                                {/* Restore Access button - shows when folder is stored but access expired */}
                                                {!hasRootFolderAccess() && hasStoredRootFolder() && (
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const success = await requestRootFolderPermission()
                                                                if (success) {
                                                                    // Force re-render
                                                                    setActiveTab('data')
                                                                } else {
                                                                    alert('Permission denied. Please try selecting the folder again.')
                                                                }
                                                            } catch (err) {
                                                                alert('Failed to restore access: ' + err.message)
                                                            }
                                                        }}
                                                        className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors border border-success/20"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                        Restore Access
                                                    </button>
                                                )}
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const result = await pickRootFolder()
                                                            if (result) {
                                                                // Force re-render
                                                                setActiveTab('data')
                                                            }
                                                        } catch (err) {
                                                            alert('Failed to select folder: ' + err.message)
                                                        }
                                                    }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-white/10 text-primary dark:text-white rounded-lg hover:bg-white/20 transition-colors border border-white/10"
                                                >
                                                    <FolderOpen className="w-4 h-4" />
                                                    {hasRootFolderAccess() ? 'Change Folder' : hasStoredRootFolder() ? 'Pick Different Folder' : 'Select Folder'}
                                                </button>
                                                {getRootFolderName() && (
                                                    <button
                                                        onClick={async () => {
                                                            await clearRootFolderHandle()
                                                            setActiveTab('data')
                                                        }}
                                                        className="px-4 py-2 bg-white/5 dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg hover:bg-white/10 transition-colors"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="px-4 py-3 bg-warning/10 text-warning rounded-lg text-sm">
                                            File System Access API is not supported in this browser.
                                            Please use Chrome, Edge, or Opera for this feature.
                                        </div>
                                    )}
                                </div>

                                {/* Export Data */}
                                <div className="pt-4 border-t border-light-border dark:border-dark-border">
                                    <h3 className="text-lg font-medium text-light-text-primary dark:text-dark-text-primary mb-4">
                                        Export Data
                                    </h3>
                                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
                                        Download all your courses, progress, notes, and settings as a backup file.
                                    </p>
                                    <button
                                        onClick={async () => {
                                            try {
                                                const data = await exportAllData()
                                                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                                                const url = URL.createObjectURL(blob)
                                                const a = document.createElement('a')
                                                a.href = url
                                                a.download = `mearn_backup_${new Date().toISOString().split('T')[0]}.json`
                                                a.click()
                                                URL.revokeObjectURL(url)
                                            } catch (err) {
                                                alert('Failed to export data: ' + err.message)
                                            }
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-white/10 text-primary dark:text-white rounded-lg hover:bg-white/20 transition-colors border border-white/10"
                                    >
                                        <Download className="w-4 h-4" />
                                        Export Backup
                                    </button>
                                </div>

                                {/* Import Data */}
                                <div className="pt-4 border-t border-light-border dark:border-dark-border">
                                    <h3 className="text-lg font-medium text-light-text-primary dark:text-dark-text-primary mb-4">
                                        Import Data
                                    </h3>
                                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
                                        Restore your data from a backup file. This will merge with existing data.
                                    </p>
                                    <input
                                        type="file"
                                        id="import-file"
                                        accept=".json"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0]
                                            if (!file) return

                                            try {
                                                const text = await file.text()
                                                const data = JSON.parse(text)
                                                await importData(data)
                                                alert('Data imported successfully! Please refresh the page.')
                                                window.location.reload()
                                            } catch (err) {
                                                alert('Failed to import data: ' + err.message)
                                            }
                                            e.target.value = ''
                                        }}
                                    />
                                    <button
                                        onClick={() => document.getElementById('import-file')?.click()}
                                        className="flex items-center gap-2 px-4 py-2 bg-white/5 dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg hover:bg-white/10 transition-colors"
                                    >
                                        <Upload className="w-4 h-4" />
                                        Import Backup
                                    </button>
                                </div>

                                {/* Reset App */}
                                <div className="pt-4 border-t border-light-border dark:border-dark-border">
                                    <h3 className="text-lg font-medium text-danger mb-4 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5" />
                                        Danger Zone
                                    </h3>
                                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4">
                                        This will permanently delete all your courses, progress, notes, and settings.
                                        This action cannot be undone.
                                    </p>
                                    <button
                                        onClick={async () => {
                                            const confirmed = confirm(
                                                'Are you absolutely sure you want to delete all data?\n\n' +
                                                'This will permanently remove:\n' +
                                                '• All courses\n' +
                                                '• All watch progress\n' +
                                                '• All notes\n' +
                                                '• All settings\n\n' +
                                                'This action CANNOT be undone!'
                                            )
                                            if (!confirmed) return

                                            const doubleConfirm = confirm(
                                                'Last chance! Type OK to confirm deletion.'
                                            )
                                            if (!doubleConfirm) return

                                            try {
                                                await clearAllData()
                                                localStorage.clear()
                                                alert('All data has been deleted. The app will now reload.')
                                                window.location.reload()
                                            } catch (err) {
                                                alert('Failed to reset app: ' + err.message)
                                            }
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors border border-error/20"
                                    >
                                        <AlertTriangle className="w-4 h-4" />
                                        Reset App - Delete All Data
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-light-border dark:border-dark-border">
                    <button
                        onClick={resetSettings}
                        className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-error transition-colors"
                    >
                        Reset to Defaults
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-lg bg-white/10 text-primary dark:text-white hover:bg-white/20 transition-colors text-sm font-medium border border-white/10"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    )
}

export default SettingsModal
