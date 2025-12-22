import { NavLink, useLocation } from 'react-router-dom'
import {
    Home,
    Users,
    History,
    BarChart3,
    Map,
    User,
    ChevronLeft,
    ChevronRight
} from 'lucide-react'
import { useSidebar } from '../../contexts/SidebarContext'
import { useState, useEffect } from 'react'
import { getAllCourses, getInstructorAvatarAsync } from '../../utils/db'

function Sidebar() {
    const { isExpanded, isMobileOpen, closeMobileSidebar, setIsExpanded } = useSidebar()
    const location = useLocation()
    const [instructors, setInstructors] = useState([])

    // Load unique instructors for the sidebar
    useEffect(() => {
        async function loadInstructors() {
            try {
                const courses = await getAllCourses()
                const uniqueInstructors = [...new Set(courses.map(c => c.instructor).filter(Boolean))]

                // Get instructor data with avatars from instructors store
                const instructorData = await Promise.all(
                    uniqueInstructors.slice(0, 5).map(async (name) => {
                        const avatar = await getInstructorAvatarAsync(name)
                        return {
                            name,
                            avatar: avatar || null,
                            courseCount: courses.filter(c => c.instructor === name).length
                        }
                    })
                )
                setInstructors(instructorData)
            } catch (err) {
                console.error('Failed to load instructors:', err)
            }
        }
        loadInstructors()
    }, [location.pathname]) // Reload when navigating

    const navItems = [
        { path: '/', icon: Home, label: 'Home' },
        { path: '/instructors', icon: Users, label: 'Instructors' },
        { path: '/history', icon: History, label: 'History' },
        { path: '/statistics', icon: BarChart3, label: 'Statistics' },
        { path: '/roadmap', icon: Map, label: 'Roadmap' },
    ]

    const isActive = (path) => {
        if (path === '/') return location.pathname === '/'
        return location.pathname.startsWith(path)
    }

    // Close mobile sidebar when clicking a link
    const handleNavClick = () => {
        if (isMobileOpen) {
            closeMobileSidebar()
        }
    }

    return (
        <>
            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={closeMobileSidebar}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed top-16 left-0 h-[calc(100vh-4rem)] z-50
                    bg-white dark:bg-dark-surface
                    border-r border-light-border dark:border-dark-border
                    transition-all duration-300 ease-in-out
                    flex flex-col
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                    ${isExpanded ? 'w-64' : 'w-20'}
                `}
            >
                {/* Navigation Items */}
                <nav className="flex-1 py-4 overflow-y-auto">
                    <ul className="space-y-1 px-3">
                        {navItems.map(({ path, icon: Icon, label }) => (
                            <li key={path}>
                                <NavLink
                                    to={path}
                                    onClick={handleNavClick}
                                    className={`
                                        flex items-center gap-4 px-3 py-3 rounded-lg
                                        transition-colors duration-200
                                        ${isActive(path)
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-bg'
                                        }
                                        ${!isExpanded ? 'justify-center' : ''}
                                    `}
                                    title={!isExpanded ? label : undefined}
                                >
                                    <Icon className="w-5 h-5 flex-shrink-0" />
                                    {isExpanded && (
                                        <span className="font-medium truncate">{label}</span>
                                    )}
                                </NavLink>
                            </li>
                        ))}
                    </ul>

                    {/* Instructors Section (when expanded) */}
                    {isExpanded && instructors.length > 0 && (
                        <div className="mt-6 px-3">
                            <h3 className="px-3 mb-2 text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">
                                Instructors
                            </h3>
                            <ul className="space-y-1">
                                {instructors.map((instructor) => (
                                    <li key={instructor.name}>
                                        <NavLink
                                            to={`/instructors?filter=${encodeURIComponent(instructor.name)}`}
                                            onClick={handleNavClick}
                                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                                                text-light-text-secondary dark:text-dark-text-secondary
                                                hover:bg-light-surface dark:hover:bg-dark-bg
                                                transition-colors duration-200"
                                        >
                                            {instructor.avatar ? (
                                                <img
                                                    src={instructor.avatar}
                                                    alt={instructor.name}
                                                    className="w-6 h-6 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                                                    <span className="text-xs font-medium text-primary">
                                                        {instructor.name.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            <span className="truncate">{instructor.name}</span>
                                        </NavLink>
                                    </li>
                                ))}
                                {instructors.length >= 5 && (
                                    <li>
                                        <NavLink
                                            to="/instructors"
                                            onClick={handleNavClick}
                                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                                                text-primary hover:bg-primary/10
                                                transition-colors duration-200"
                                        >
                                            <span>View all instructors</span>
                                        </NavLink>
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </nav>

                {/* Bottom Section - Profile & Collapse Toggle */}
                <div className="border-t border-light-border dark:border-dark-border p-3">
                    {/* Profile Link */}
                    <NavLink
                        to="/profile"
                        onClick={handleNavClick}
                        className={`
                            flex items-center gap-4 px-3 py-3 rounded-lg mb-2
                            transition-colors duration-200
                            ${isActive('/profile')
                                ? 'bg-primary/10 text-primary'
                                : 'text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-bg'
                            }
                            ${!isExpanded ? 'justify-center' : ''}
                        `}
                        title={!isExpanded ? 'Profile' : undefined}
                    >
                        <User className="w-5 h-5 flex-shrink-0" />
                        {isExpanded && <span className="font-medium">Profile</span>}
                    </NavLink>

                    {/* Collapse Toggle (desktop only) */}
                    <button
                        onClick={() => setIsExpanded(prev => !prev)}
                        className={`
                            hidden md:flex items-center gap-4 px-3 py-3 rounded-lg w-full
                            text-light-text-secondary dark:text-dark-text-secondary
                            hover:bg-light-surface dark:hover:bg-dark-bg
                            transition-colors duration-200
                            ${!isExpanded ? 'justify-center' : ''}
                        `}
                        title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
                    >
                        {isExpanded ? (
                            <>
                                <ChevronLeft className="w-5 h-5" />
                                <span className="font-medium">Collapse</span>
                            </>
                        ) : (
                            <ChevronRight className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </aside>
        </>
    )
}

export default Sidebar
