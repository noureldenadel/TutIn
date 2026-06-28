import { Router } from 'express'

const router = Router()

// ──────────────────────────────────────────────
// Web3Forms Config
// ──────────────────────────────────────────────
// Get your free access key at: https://web3forms.com
// This key is safe to include in public code — it only allows
// sending emails TO the registered address, nothing else.
const WEB3FORMS_KEY = 'e2f84663-9cfe-4a0c-b262-26570569f8ea'

/**
 * POST /api/feedback
 * Sends user feedback via Web3Forms (delivered to developer's email).
 * Body: { category: string, message: string, email?: string }
 */
router.post('/', async (req, res) => {
    try {
        const { category, message, email } = req.body

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Message is required' })
        }

        if (!WEB3FORMS_KEY) {
            return res.status(500).json({ error: 'Feedback service not configured.' })
        }

        const categoryLabel = category || 'General'

        // Build the submission payload
        const payload = {
            access_key: WEB3FORMS_KEY,
            subject: `[TutIn Feedback - ${categoryLabel}] ${message.slice(0, 60)}${message.length > 60 ? '...' : ''}`,
            from_name: 'TutIn App',
            message: message,
            category: categoryLabel,
            app_version: '4.0.0',
            submitted_at: new Date().toISOString(),
        }

        // Include user's email if provided
        if (email && email.trim()) {
            payload.email = email.trim()
            payload.replyto = email.trim()
        }

        const response = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        const data = await response.json()

        if (!response.ok || !data.success) {
            console.error('[Feedback] Web3Forms error:', data)
            return res.status(502).json({ error: 'Failed to submit feedback' })
        }

        console.log(`[Feedback] Sent: [${categoryLabel}] ${message.slice(0, 50)}...`)
        res.json({ success: true })
    } catch (err) {
        console.error('[Feedback] Error:', err.message)
        res.status(500).json({ error: 'Failed to submit feedback' })
    }
})

export default router
