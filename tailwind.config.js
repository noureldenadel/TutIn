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
                // Grayscale / True Dark Theme
                dark: {
                    bg: '#050505', // Pure Black
                    surface: '#121212', // Dark Grey
                    border: '#262626', // Subtle Grey
                    text: {
                        primary: '#FAFAFA', // White
                        secondary: '#A3A3A3', // Metallic Grey
                        muted: '#525252'
                    }
                },
                // Light Theme (Optional/Fallback - keeping minimal)
                light: {
                    bg: '#FFFFFF',
                    surface: '#F8F9FA',
                    border: '#E5E7EB',
                    text: {
                        primary: '#171717',
                        secondary: '#737373'
                    }
                },
                // Brand Colors - High Contrast
                primary: {
                    DEFAULT: '#FFFFFF', // White for futuristic contrast
                    hover: '#E5E5E5',
                    content: '#000000'
                },
                secondary: {
                    DEFAULT: '#A3A3A3', // Metallic
                    hover: '#D4D4D4'
                },
                accent: {
                    DEFAULT: '#38bdf8', // Subtle Neon for micro-interactions if needed
                    glow: 'rgba(56, 189, 248, 0.5)'
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
            },
            boxShadow: {
                'glass': '0 0 15px rgba(255, 255, 255, 0.1)',
                'glass-hover': '0 0 20px rgba(255, 255, 255, 0.2)',
                'glass-strong': '0 8px 30px rgba(0, 0, 0, 0.5)',
                'neon': '0 0 10px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)',
            }
        },
    },
    plugins: [],
}
