import { Routes, Route } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import Header from './components/layout/Header'
import LoadingSpinner from './components/common/LoadingSpinner'
import ErrorBoundary from './components/common/ErrorBoundary'

// Lazy load pages for better performance
const HomePage = lazy(() => import('./pages/HomePage'))
const CoursePlayerPage = lazy(() => import('./pages/CoursePlayerPage'))

function App() {
    return (
        <ErrorBoundary>
            <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text-primary dark:text-dark-text-primary">
                <Header />
                <main className="container mx-auto px-4 py-6">
                    <Suspense fallback={<LoadingSpinner />}>
                        <Routes>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/course/:courseId" element={<CoursePlayerPage />} />
                        </Routes>
                    </Suspense>
                </main>
            </div>
        </ErrorBoundary>
    )
}

export default App
