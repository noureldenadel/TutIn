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
                    bg-white dark:bg-black/60 backdrop-blur-2xl
                    border-r border-gray-200 dark:border-white/5
                    transition-all duration-300 ease-in-out
                    flex flex-col
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                    ${isExpanded ? 'w-64' : 'w-20'}
                `}
            >
                {/* Navigation Items */}
                <nav className="flex-1 py-4 overflow-y-auto scrollbar-hide">
                    <ul className="space-y-1 px-3">
                        {navItems.map(({ path, icon: Icon, label }) => (
                            <li key={path}>
                                <NavLink
                                    to={path}
                                    onClick={handleNavClick}
                                    className={`
                                        flex items-center gap-4 px-3 py-3 rounded-full
                                        transition-all duration-300 group
                                        ${isActive(path)
                                            ? 'bg-blue-100 text-blue-700 dark:bg-white/10 dark:text-white'
                                            : 'text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
                                        }
                                        ${!isExpanded ? 'justify-center' : ''}
                                    `}
                                    title={!isExpanded ? label : undefined}
                                >
                                    <Icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${isActive(path) ? 'scale-110' : 'group-hover:scale-110'}`} />
                                    {isExpanded && (
                                        <span className="font-medium truncate tracking-wide">{label}</span>
                                    )}
                                </NavLink>
                            </li>
                        ))}
                    </ul>

                    {/* Instructors Section (when expanded) */}
                    {isExpanded && instructors.length > 0 && (
                        <div className="mt-8 px-3">
                            <h3 className="px-3 mb-3 text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em]">
                                Instructors
                            </h3>
                            <ul className="space-y-1">
                                {instructors.map((instructor) => (
                                    <li key={instructor.name}>
                                        <NavLink
                                            to={`/instructors?filter=${encodeURIComponent(instructor.name)}`}
                                            onClick={handleNavClick}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-full text-sm
                                                text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white
                                                hover:bg-gray-100 dark:hover:bg-white/5
                                                transition-all duration-200"
                                        >
                                            {instructor.avatar ? (
                                                <img
                                                    src={instructor.avatar}
                                                    alt={instructor.name}
                                                    className="w-6 h-6 rounded-full object-cover ring-2 ring-white/10"
                                                />
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center ring-2 ring-white/10">
                                                    <span className="text-[10px] font-bold text-white">
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
                                                text-white/70 hover:text-white
                                                transition-colors duration-200 mt-2"
                                        >
                                            <span className="text-xs">View all instructors →</span>
                                        </NavLink>
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </nav>

                {/* Bottom Section - Profile & Collapse Toggle */}
                <div className="border-t border-gray-200 dark:border-white/5 p-3 bg-gray-50 dark:bg-black/20">
                    {/* Profile Link */}
                    <NavLink
                        to="/profile"
                        onClick={handleNavClick}
                        className={`
                            flex items-center gap-4 px-3 py-3 rounded-full mb-2
                            transition-all duration-300
                            ${isActive('/profile')
                                ? 'bg-primary/10 text-primary dark:bg-white/10 dark:text-white'
                                : 'text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
                            }
                            ${!isExpanded ? 'justify-center' : ''}
                        `}
                        title={!isExpanded ? 'Profile' : undefined}
                    >
                        <User className="w-5 h-5 flex-shrink-0" />
                        {isExpanded && <span className="font-medium tracking-wide">Profile</span>}
                    </NavLink>

                    {/* Collapse Toggle (desktop only) */}
                    <button
                        onClick={() => setIsExpanded(prev => !prev)}
                        className={`
                            hidden md:flex items-center gap-4 px-3 py-3 rounded-full w-full
                            text-gray-500 dark:text-neutral-500 hover:text-gray-900 dark:hover:text-white
                            hover:bg-gray-100 dark:hover:bg-white/5
                            transition-all duration-200
                            ${!isExpanded ? 'justify-center' : ''}
                        `}
                        title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
                    >
                        {isExpanded ? (
                            <>
                                <ChevronLeft className="w-5 h-5" />
                                <span className="font-medium text-sm">Collapse</span>
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
