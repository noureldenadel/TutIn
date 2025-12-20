import { useState, useEffect } from 'react'
import { X, Youtube, Save, AlertTriangle, PlayCircle, List, Loader } from 'lucide-react'
import { formatDuration } from '../../utils/db'

function YouTubeImportModal({ isOpen, onClose, onImport }) {
    const [url, setUrl] = useState('')
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('youtube_api_key') || '')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)
    const [previewData, setPreviewData] = useState(null)
    const [importType, setImportType] = useState(null) // 'video' or 'playlist'

    // Reset when opened
    useEffect(() => {
        if (isOpen) {
            setUrl('')
            setError(null)
            setPreviewData(null)
            setImportType(null)
        }
    }, [isOpen])

    if (!isOpen) return null

    function handleApiKeyChange(e) {
        const key = e.target.value
        setApiKey(key)
        localStorage.setItem('youtube_api_key', key)
    }

    async function handleFetchInfo() {
        if (!url) return
        setIsLoading(true)
        setError(null)
        setPreviewData(null)

        try {
            // Detect Type
            let type = 'video'
            let id = ''

            const urlObj = new URL(url)
            if (urlObj.searchParams.has('list')) {
                type = 'playlist'
                id = urlObj.searchParams.get('list')
            } else if (urlObj.searchParams.has('v')) {
                type = 'video'
                id = urlObj.searchParams.get('v')
            } else if (urlObj.hostname === 'youtu.be') {
                type = 'video'
                id = urlObj.pathname.slice(1)
            }

            if (!id) throw new Error('Invalid YouTube URL')
            setImportType(type)

            if (type === 'video') {
                // Use noembed for single videos (no key needed)
                const res = await fetch(`https://noembed.com/embed?url=${url}`)
                const data = await res.json()
                if (data.error) throw new Error(data.error)

                setPreviewData({
                    title: data.title,
                    author: data.author_name,
                    thumbnail: data.thumbnail_url,
                    videos: [{
                        title: data.title,
                        youtubeId: id,
                        url: url,
                        duration: 0 // Noembed doesn't give duration :(
                    }]
                })
            } else {
                // Playlist - Requires API Key
                if (!apiKey) {
                    throw new Error('API Key is required for playlists')
                }

                // Fetch Playlist Details
                const playlistRes = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${id}&key=${apiKey}`)
                if (!playlistRes.ok) throw new Error('Failed to fetch playlist. Check API Key.')
                const playlistData = await playlistRes.json()
                if (!playlistData.items?.length) throw new Error('Playlist not found')

                const playlistInfo = playlistData.items[0].snippet
                const channelId = playlistInfo.channelId

                // Fetch Channel Info (for avatar)
                let channelAvatar = null
                if (channelId) {
                    try {
                        const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`)
                        const channelData = await channelRes.json()
                        if (channelData.items?.length) {
                            channelAvatar = channelData.items[0].snippet?.thumbnails?.default?.url ||
                                channelData.items[0].snippet?.thumbnails?.medium?.url
                        }
                    } catch (e) {
                        console.warn('Failed to fetch channel avatar:', e)
                    }
                }

                // Fetch Playlist Items
                let videos = []
                let nextPageToken = ''

                do {
                    const itemsRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${id}&key=${apiKey}&pageToken=${nextPageToken}`)
                    const itemsData = await itemsRes.json()

                    const validItems = itemsData.items.filter(item => item.snippet.title !== 'Private video')
                    videos = [...videos, ...validItems.map(item => ({
                        title: item.snippet.title,
                        youtubeId: item.snippet.resourceId.videoId,
                        url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
                        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                        description: item.snippet.description
                    }))]

                    nextPageToken = itemsData.nextPageToken
                } while (nextPageToken && videos.length < 200) // Limit to 200 for sanity

                setPreviewData({
                    title: playlistInfo.title,
                    author: playlistInfo.channelTitle,
                    thumbnail: playlistInfo.thumbnails?.high?.url,
                    channelAvatar: channelAvatar,
                    videos: videos
                })
            }

        } catch (err) {
            console.error(err)
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    function handleConfirm() {
        if (!previewData) return
        onImport({
            title: previewData.title,
            instructor: previewData.author,
            instructorAvatar: previewData.channelAvatar,
            thumbnailData: previewData.thumbnail,
            description: `Imported from YouTube (${importType})`,
            modules: [{
                title: 'Videos',
                videos: previewData.videos.map((v, i) => ({
                    title: v.title,
                    originalTitle: v.title,
                    youtubeId: v.youtubeId,
                    url: v.url,
                    duration: v.duration || 0,
                    order: i
                }))
            }]
        })
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Youtube className="w-6 h-6 text-red-600" />
                        Import from YouTube
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* URL Input */}
                    <div>
                        <label className="block text-sm font-medium mb-2">YouTube URL</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="Paste video or playlist link (e.g., https://www.youtube.com/playlist?list=...)"
                                className="flex-1 px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-red-500 outline-none"
                            />
                            <button
                                onClick={handleFetchInfo}
                                disabled={!url || isLoading}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {isLoading ? <Loader className="w-5 h-5 animate-spin" /> : 'Fetch'}
                            </button>
                        </div>
                    </div>

                    {/* API Key (Conditional) */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium">YouTube Data API Key</label>
                            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Get Key</a>
                        </div>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={handleApiKeyChange}
                            placeholder="Required for playlists..."
                            className="w-full px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:ring-2 focus:ring-red-500 outline-none"
                        />
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                            Stored locally in your browser.
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-4 bg-error/10 text-error rounded-lg flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            {error}
                        </div>
                    )}

                    {/* Preview */}
                    {previewData && (
                        <div className="border border-light-border dark:border-dark-border rounded-lg overflow-hidden">
                            <div className="p-4 bg-light-surface dark:bg-dark-bg flex gap-4">
                                <img src={previewData.thumbnail} alt="Thumbnail" className="w-32 h-20 object-cover rounded" />
                                <div>
                                    <h3 className="font-semibold text-lg">{previewData.title}</h3>
                                    <p className="text-light-text-secondary dark:text-dark-text-secondary">{previewData.author}</p>
                                    <p className="text-sm mt-1">{previewData.videos.length} videos found</p>
                                </div>
                            </div>

                            <div className="max-h-48 overflow-y-auto divide-y divide-light-border dark:divide-dark-border">
                                {previewData.videos.map((v, i) => (
                                    <div key={i} className="p-2 px-4 text-sm flex items-center gap-2">
                                        <span className="text-light-text-secondary dark:text-dark-text-secondary w-6">{i + 1}.</span>
                                        <span className="truncate flex-1">{v.title}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t border-light-border dark:border-dark-border">
                    <button onClick={onClose} className="px-4 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg">
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!previewData}
                        className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        Import Course
                    </button>
                </div>
            </div>
        </div>
    )
}

export default YouTubeImportModal
