import { Loader2 } from 'lucide-react'

function LoadingSpinner({ size = 'medium', message = 'Loading...' }) {
    const sizeClasses = {
        small: 'w-4 h-4',
        medium: 'w-8 h-8',
        large: 'w-12 h-12'
    }

    return (
        <div className="flex flex-col items-center justify-center p-8 gap-3">
            <Loader2
                className={`${sizeClasses[size]} text-primary animate-spin`}
            />
            {message && (
                <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm">
                    {message}
                </p>
            )}
        </div>
    )
}

export default LoadingSpinner
