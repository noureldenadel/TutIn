import { Routes, Route } from 'react-router-dom'
import { Suspense, lazy, useState } from 'react'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import LoadingSpinner from './components/common/LoadingSpinner'
import ErrorBoundary from './components/common/ErrorBoundary'
import WelcomeGuide from './components/common/WelcomeGuide'
import { SidebarProvider, useSidebar } from './contexts/SidebarContext'
import { SearchProvider } from './contexts/SearchContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { ImportProvider } from './contexts/ImportContext'

// Lazy load pages for better performance
const HomePage = lazy(() => import('./pages/HomePage'))
const CoursePlayerPage = lazy(() => import('./pages/CoursePlayerPage'))
const InstructorsPage = lazy(() => import('./pages/InstructorsPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const StatisticsPage = lazy(() => import('./pages/StatisticsPage'))
const RoadmapPage = lazy(() => import('./pages/RoadmapPage'))

function AppContent() {
    const { isExpanded } = useSidebar()
    const [showWelcome, setShowWelcome] = useState(() => {
        return !localStorage.getItem('tutin_welcome_seen')
    })

    return (
        <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text-primary dark:text-dark-text-primary transition-colors duration-300">
            <Header />
            <Sidebar />
            <main
                className={`
                    pt-6 pb-6 px-4
                    transition-all duration-300
                    md:ml-20
                    ${isExpanded ? 'md:ml-64' : 'md:ml-20'}
                `}
            >
                <Suspense fallback={<LoadingSpinner />}>
                    <Routes>
                        <Route path="/" element={<div className="max-w-7xl mx-auto w-full"><HomePage /></div>} />
                        <Route path="/course/:courseId" element={<CoursePlayerPage />} />
                        <Route path="/instructors" element={<div className="max-w-7xl mx-auto w-full"><InstructorsPage /></div>} />
                        <Route path="/history" element={<div className="max-w-7xl mx-auto w-full"><HistoryPage /></div>} />
                        <Route path="/statistics" element={<div className="max-w-7xl mx-auto w-full"><StatisticsPage /></div>} />
                        <Route path="/roadmap" element={<div className="max-w-7xl mx-auto w-full"><RoadmapPage /></div>} />
                    </Routes>
                </Suspense>
            </main>

            {/* First-launch Welcome Guide */}
            <WelcomeGuide
                isOpen={showWelcome}
                onClose={() => setShowWelcome(false)}
            />
        </div>
    )
}

function App() {
    return (
        <ErrorBoundary>
            <NotificationProvider>
                <ImportProvider>
                    <SidebarProvider>
                        <SearchProvider>
                            <AppContent />
                        </SearchProvider>
                    </SidebarProvider>
                </ImportProvider>
            </NotificationProvider>
        </ErrorBoundary>
    )
}

export default App

