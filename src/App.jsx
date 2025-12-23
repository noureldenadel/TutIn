import { Routes, Route } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import LoadingSpinner from './components/common/LoadingSpinner'
import ErrorBoundary from './components/common/ErrorBoundary'
import { loadPersistedRootFolder } from './utils/fileSystem'
import { migrateInstructorAvatars } from './utils/db'
import { SidebarProvider, useSidebar } from './contexts/SidebarContext'
import { SearchProvider } from './contexts/SearchContext'

// Lazy load pages for better performance
const HomePage = lazy(() => import('./pages/HomePage'))
const CoursePlayerPage = lazy(() => import('./pages/CoursePlayerPage'))
const InstructorsPage = lazy(() => import('./pages/InstructorsPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const StatisticsPage = lazy(() => import('./pages/StatisticsPage'))
const RoadmapPage = lazy(() => import('./pages/RoadmapPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

function AppContent() {
    const { isExpanded } = useSidebar()

    // On startup, try to restore persisted folder access and run migrations
    useEffect(() => {
        // Migrate legacy instructor avatars from courses to instructors store
        migrateInstructorAvatars()

        loadPersistedRootFolder().then(success => {
            if (success) {
                console.log('[App] Folder access restored automatically')
            }
        }).catch(err => {
            console.log('[App] Could not restore folder access:', err.message)
        })
    }, [])

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
                <div className="max-w-7xl mx-auto">
                    <Suspense fallback={<LoadingSpinner />}>
                        <Routes>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/course/:courseId" element={<CoursePlayerPage />} />
                            <Route path="/instructors" element={<InstructorsPage />} />
                            <Route path="/history" element={<HistoryPage />} />
                            <Route path="/statistics" element={<StatisticsPage />} />
                            <Route path="/roadmap" element={<RoadmapPage />} />
                            <Route path="/profile" element={<ProfilePage />} />
                        </Routes>
                    </Suspense>
                </div>
            </main>
        </div>
    )
}

function App() {
    return (
        <ErrorBoundary>
            <SidebarProvider>
                <SearchProvider>
                    <AppContent />
                </SearchProvider>
            </SidebarProvider>
        </ErrorBoundary>
    )
}

export default App

