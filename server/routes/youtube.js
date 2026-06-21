import express from 'express'
import { YoutubeTranscript } from 'youtube-transcript'

const router = express.Router()

router.get('/transcript', async (req, res) => {
    try {
        const { videoId, lang } = req.query

        if (!videoId) {
            return res.status(400).json({ error: 'videoId is required' })
        }

        // Fetch transcript using youtube-transcript
        // Optional: specify lang if provided, otherwise defaults to english or video default
        let transcriptList
        try {
            if (lang && lang !== 'none') {
                transcriptList = await YoutubeTranscript.fetchTranscript(videoId, { lang })
            } else {
                transcriptList = await YoutubeTranscript.fetchTranscript(videoId)
            }
        } catch (fetchErr) {
            console.error('[YouTube API] Failed to fetch transcript:', fetchErr.message)
            return res.status(404).json({ error: 'Transcript not available for this video or language' })
        }

        // Format into our standard chunk format: [{ text, timestamp: [start, end] }]
        const chunks = transcriptList.map(item => ({
            text: item.text,
            timestamp: [
                item.offset / 1000, 
                (item.offset + item.duration) / 1000
            ]
        }))

        res.json({ chunks })

    } catch (err) {
        console.error('[YouTube API] Route error:', err)
        res.status(500).json({ error: err.message })
    }
})

export default router
