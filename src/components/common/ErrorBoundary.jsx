import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo })
        console.error('ErrorBoundary caught an error:', error, errorInfo)
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null })
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg p-4">
                    <div className="max-w-md w-full bg-white dark:bg-dark-surface rounded-lg shadow-lg p-6 text-center">
                        <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="w-8 h-8 text-error" />
                        </div>

                        <h1 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
                            Something went wrong
                        </h1>

                        <p className="text-light-text-secondary dark:text-dark-text-secondary mb-4">
                            An unexpected error occurred. Please try refreshing the page.
                        </p>

                        {this.state.error && (
                            <div className="bg-light-surface dark:bg-dark-bg rounded p-3 mb-4 text-left">
                                <code className="text-sm text-error break-all">
                                    {this.state.error.toString()}
                                </code>
                            </div>
                        )}

                        <button
                            onClick={this.handleReset}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Try Again
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
