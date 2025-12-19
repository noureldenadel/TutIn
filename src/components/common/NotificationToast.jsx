import { useState, useEffect, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info
}

const colors = {
    success: 'bg-success text-white',
    error: 'bg-error text-white',
    warning: 'bg-warning text-white',
    info: 'bg-primary text-white'
}

function NotificationToast({
    message,
    type = 'info',
    duration = 5000,
    onClose,
    action
}) {
    const [isVisible, setIsVisible] = useState(true)
    const Icon = icons[type]

    const handleClose = useCallback(() => {
        setIsVisible(false)
        setTimeout(() => {
            onClose?.()
        }, 200)
    }, [onClose])

    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(handleClose, duration)
            return () => clearTimeout(timer)
        }
    }, [duration, handleClose])

    if (!isVisible) return null

    return (
        <div
            className={`
        fixed bottom-4 right-4 z-50 
        flex items-center gap-3 
        px-4 py-3 rounded-lg shadow-lg
        ${colors[type]}
        animate-slide-up
        transition-all duration-200
        ${!isVisible ? 'opacity-0 translate-y-2' : 'opacity-100'}
      `}
            role="alert"
        >
            <Icon className="w-5 h-5 flex-shrink-0" />

            <p className="text-sm font-medium">{message}</p>

            {action && (
                <button
                    onClick={action.onClick}
                    className="ml-2 text-sm underline hover:no-underline"
                >
                    {action.label}
                </button>
            )}

            <button
                onClick={handleClose}
                className="ml-2 p-1 hover:bg-white/20 rounded transition-colors"
                aria-label="Close notification"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}

export default NotificationToast
