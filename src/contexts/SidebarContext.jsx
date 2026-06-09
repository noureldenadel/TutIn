import { createContext, useContext, useState, useEffect } from 'react'

const SidebarContext = createContext()

export function SidebarProvider({ children }) {
    const [isExpanded, setIsExpanded] = useState(() => {
        // Load from localStorage, default to true on desktop
        const saved = localStorage.getItem('sidebar_expanded')
        if (saved !== null) {
            return JSON.parse(saved)
        }
        // Default: expanded on desktop, collapsed on mobile
        return window.innerWidth >= 1024
    })

    const [isMobileOpen, setIsMobileOpen] = useState(false)

    // Persist sidebar state
    useEffect(() => {
        localStorage.setItem('sidebar_expanded', JSON.stringify(isExpanded))
    }, [isExpanded])

    // Close mobile sidebar on route change or resize
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setIsMobileOpen(false)
            }
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const toggleSidebar = () => {
        if (window.innerWidth < 768) {
            setIsMobileOpen(prev => !prev)
        } else {
            setIsExpanded(prev => !prev)
        }
    }

    const closeMobileSidebar = () => {
        setIsMobileOpen(false)
    }

    const value = {
        isExpanded,
        isMobileOpen,
        toggleSidebar,
        closeMobileSidebar,
        setIsExpanded
    }

    return (
        <SidebarContext.Provider value={value}>
            {children}
        </SidebarContext.Provider>
    )
}

export function useSidebar() {
    const context = useContext(SidebarContext)
    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider')
    }
    return context
}
