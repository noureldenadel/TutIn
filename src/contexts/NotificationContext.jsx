import { createContext, useContext, useState, useCallback } from 'react'
import NotificationToast from '../components/common/NotificationToast'

const NotificationContext = createContext(null)

let nextId = 0

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([])

    const showNotification = useCallback((message, type = 'info', duration = 5000) => {
        const id = nextId++
        setNotifications(prev => [...prev, { id, message, type, duration }])
    }, [])

    const removeNotification = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id))
    }, [])

    return (
        <NotificationContext.Provider value={{ showNotification }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
                {notifications.map((n, i) => (
                    <div key={n.id} style={{ transform: `translateY(-${i * 4}px)` }}>
                        <NotificationToast
                            message={n.message}
                            type={n.type}
                            duration={n.duration}
                            onClose={() => removeNotification(n.id)}
                        />
                    </div>
                ))}
            </div>
        </NotificationContext.Provider>
    )
}

export function useNotification() {
    const context = useContext(NotificationContext)
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider')
    }
    return context
}
