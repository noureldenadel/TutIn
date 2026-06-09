import { useState, useEffect } from 'react'
import {
    FolderOpen, Youtube, HardDrive, Link2, Brain, Mic, Languages,
    BarChart3, Map, NotebookPen, Flame, ChevronLeft, ChevronRight,
    X, ArrowRight, Sparkles
} from 'lucide-react'

const slides = [
    {
        title: 'Welcome to TutIn',
        description: 'Your offline-first, AI-enhanced video course management system. Organize, track, and master courses from any source — all locally and privately.',
        items: [
            { icon: FolderOpen, text: 'Import from local folders, YouTube, Google Drive, or external links' },
            { icon: Brain, text: 'AI transcription, summaries, and voice dubbing' },
            { icon: BarChart3, text: 'Smart progress tracking and analytics' },
        ]
    },
    {
        title: 'Import Your Courses',
        description: 'Bring all your learning content into one library. TutIn auto-detects modules and organizes your videos instantly.',
        items: [
            { icon: FolderOpen, text: 'Local folders with automatic structure detection' },
            { icon: Youtube, text: 'YouTube playlists with metadata and thumbnails' },
            { icon: HardDrive, text: 'Google Drive videos and shared folders' },
            { icon: Link2, text: 'External links from other course sites' },
        ]
    },
    {
        title: 'AI-Powered Learning',
        description: 'Transcribe, summarize, and dub your videos using built-in AI that runs entirely on your machine.',
        items: [
            { icon: Mic, text: 'Whisper AI transcription — completely offline' },
            { icon: Sparkles, text: 'AI-powered summaries with key takeaways' },
            { icon: Languages, text: 'Voice-cloned dubbing in 16+ languages' },
        ]
    },
    {
        title: 'Track & Organize',
        description: 'Stay motivated with visual analytics, timestamped notes, learning streaks, and interactive roadmaps.',
        items: [
            { icon: Flame, text: 'Daily streaks and activity heatmaps' },
            { icon: NotebookPen, text: 'Rich notes with images anchored to timestamps' },
            { icon: Map, text: 'Visual roadmap builder for learning paths' },
        ]
    },
]

function WelcomeGuide({ isOpen, onClose }) {
    const [current, setCurrent] = useState(0)
    const [fading, setFading] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setCurrent(0)
            setFading(false)
        }
    }, [isOpen])

    if (!isOpen) return null

    const slide = slides[current]
    const isLast = current === slides.length - 1

    function goTo(i) {
        if (i === current || fading) return
        setFading(true)
        setTimeout(() => {
            setCurrent(i)
            setFading(false)
        }, 120)
    }

    function handleClose() {
        localStorage.setItem('tutin_welcome_seen', 'true')
        onClose()
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

            {/* Modal — matches app's glass style */}
            <div className="relative w-full max-w-md bg-white dark:bg-black/60 backdrop-blur-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 animate-scale-in overflow-hidden">

                {/* Close */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 z-10 p-1.5 rounded-full text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                    aria-label="Close"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Content */}
                <div className={`p-8 transition-opacity duration-120 ${fading ? 'opacity-0' : 'opacity-100'}`}>

                    {/* Step indicator */}
                    <div className="flex items-center gap-1.5 mb-6">
                        {slides.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => goTo(i)}
                                className={`h-1 rounded-full transition-all duration-300 ${i === current
                                    ? 'w-8 bg-primary-fg'
                                    : 'w-4 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20'
                                    }`}
                                aria-label={`Step ${i + 1}`}
                            />
                        ))}
                    </div>

                    {/* Title */}
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
                        {slide.title}
                    </h2>

                    {/* Description */}
                    <p className="text-sm text-gray-500 dark:text-neutral-400 leading-relaxed mb-6">
                        {slide.description}
                    </p>

                    {/* Feature items */}
                    <div className="space-y-3">
                        {slide.items.map((item, i) => {
                            const Icon = item.icon
                            return (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5"
                                >
                                    <Icon className="w-4.5 h-4.5 text-gray-500 dark:text-neutral-400 flex-shrink-0" />
                                    <span className="text-sm text-gray-700 dark:text-neutral-300">{item.text}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-8 pb-6">
                    {/* Back / Skip */}
                    {current === 0 ? (
                        <button
                            onClick={handleClose}
                            className="text-sm text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300 transition-colors"
                        >
                            Skip
                        </button>
                    ) : (
                        <button
                            onClick={() => goTo(current - 1)}
                            className="flex items-center gap-1 text-sm text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back
                        </button>
                    )}

                    {/* Next / Get Started */}
                    {isLast ? (
                        <button
                            onClick={handleClose}
                            className="flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-primary-content hover:bg-primary-hover text-sm font-medium transition-all duration-200"
                        >
                            Get Started
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            onClick={() => goTo(current + 1)}
                            className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-primary text-primary-content hover:bg-primary-hover text-sm font-medium transition-all duration-200"
                        >
                            Next
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default WelcomeGuide
