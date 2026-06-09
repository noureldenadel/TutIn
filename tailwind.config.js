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
                // ============================================
                // SEMANTIC THEME TOKENS (auto dark/light)
                // Use these for new elements — no dark: prefix needed!
                // ============================================
                theme: {
                    DEFAULT: 'var(--bg-primary)',
                    secondary: 'var(--bg-secondary)',
                },
                surface: {
                    DEFAULT: 'var(--surface)',
                    alt: 'var(--surface-alt)',
                },
                elevated: 'var(--elevated)',
                hover: 'var(--hover)',
                active: 'var(--active)',
                overlay: 'var(--overlay)',

                // Semantic text colors → use as text-theme, text-secondary-theme, etc.
                'theme-text': {
                    DEFAULT: 'var(--text-primary)',
                    secondary: 'var(--text-secondary)',
                    muted: 'var(--text-muted)',
                    inverse: 'var(--text-inverse)',
                    link: 'var(--text-link)',
                    'link-hover': 'var(--text-link-hover)',
                },

                // Semantic border colors → use as border-theme, border-subtle, etc.
                'theme-border': {
                    DEFAULT: 'var(--border)',
                    subtle: 'var(--border-subtle)',
                    strong: 'var(--border-strong)',
                },

                // Semantic ring color
                'theme-ring': 'var(--ring)',

                // Component tokens
                input: {
                    DEFAULT: 'var(--input-bg)',
                    border: 'var(--input-border)',
                    'focus-border': 'var(--input-focus-border)',
                    placeholder: 'var(--input-placeholder)',
                },
                card: {
                    DEFAULT: 'var(--card-bg)',
                    border: 'var(--card-border)',
                    'hover-border': 'var(--card-hover-border)',
                },
                modal: {
                    DEFAULT: 'var(--modal-bg)',
                    border: 'var(--modal-border)',
                },
                badge: {
                    DEFAULT: 'var(--badge-bg)',
                    text: 'var(--badge-text)',
                },
                sidebar: {
                    DEFAULT: 'var(--sidebar-bg)',
                    active: 'var(--sidebar-active)',
                    hover: 'var(--sidebar-hover)',
                },

                // Status with background variants
                success: {
                    DEFAULT: 'var(--success)',
                    bg: 'var(--success-bg)',
                    light: '#34D399',
                },
                warning: {
                    DEFAULT: 'var(--warning)',
                    bg: 'var(--warning-bg)',
                    light: '#FBBF24',
                },
                error: {
                    DEFAULT: 'var(--error)',
                    bg: 'var(--error-bg)',
                    light: '#F87171',
                },
                info: {
                    DEFAULT: 'var(--info)',
                    bg: 'var(--info-bg)',
                },

                // ============================================
                // LEGACY COLORS (kept for backward compatibility)
                // Existing components still use these — migrate gradually
                // ============================================
                dark: {
                    bg: '#050505',
                    surface: '#121212',
                    border: '#262626',
                    text: {
                        primary: '#FAFAFA',
                        secondary: '#A3A3A3',
                        muted: '#525252'
                    }
                },
                light: {
                    bg: '#FFFFFF',
                    surface: '#F8F9FA',
                    border: '#E5E7EB',
                    text: {
                        primary: '#171717',
                        secondary: '#737373'
                    }
                },
                primary: {
                    DEFAULT: 'var(--primary)',
                    hover: 'var(--primary-hover)',
                    content: 'var(--primary-content)',
                    fg: 'var(--primary-fg)',
                },
                secondary: {
                    DEFAULT: '#A3A3A3',
                    hover: '#D4D4D4'
                },
                accent: {
                    DEFAULT: '#38bdf8',
                    glow: 'rgba(56, 189, 248, 0.5)'
                },
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
