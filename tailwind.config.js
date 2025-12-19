/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Light Theme Colors
                light: {
                    bg: '#FFFFFF',
                    surface: '#F8F9FA',
                    border: '#E5E7EB',
                    text: {
                        primary: '#1F2937',
                        secondary: '#6B7280'
                    }
                },
                // Dark Theme Colors (Pure Black/Grey)
                dark: {
                    bg: '#0A0A0A',
                    surface: '#141414',
                    border: '#262626',
                    text: {
                        primary: '#FAFAFA',
                        secondary: '#A1A1A1'
                    }
                },
                // Brand Colors
                primary: {
                    DEFAULT: '#3B82F6',
                    light: '#60A5FA',
                    dark: '#2563EB'
                },
                success: {
                    DEFAULT: '#10B981',
                    light: '#34D399'
                },
                warning: {
                    DEFAULT: '#F59E0B',
                    light: '#FBBF24'
                },
                error: {
                    DEFAULT: '#EF4444',
                    light: '#F87171'
                }
            },
            fontFamily: {
                sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif']
            },
            animation: {
                'fade-in': 'fadeIn 200ms ease-in-out',
                'slide-in': 'slideIn 250ms ease-in-out',
                'scale-in': 'scaleIn 200ms ease-in-out'
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' }
                },
                slideIn: {
                    '0%': { transform: 'translateX(100%)' },
                    '100%': { transform: 'translateX(0)' }
                },
                scaleIn: {
                    '0%': { transform: 'scale(0.95)', opacity: '0' },
                    '100%': { transform: 'scale(1)', opacity: '1' }
                }
            }
        },
    },
    plugins: [],
}
