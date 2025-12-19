import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { SettingsProvider } from './contexts/SettingsContext.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <ThemeProvider>
                <SettingsProvider>
                    <App />
                </SettingsProvider>
            </ThemeProvider>
        </BrowserRouter>
    </StrictMode>,
)
