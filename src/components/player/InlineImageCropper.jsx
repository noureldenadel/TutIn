import { useState, useRef, useEffect } from 'react'
import { Check, X, Crop } from 'lucide-react'

const MAX_CROP_WIDTH = 1200
const MAX_CROP_HEIGHT = 800

/**
 * InlineImageCropper
 * 
 * In-place click-and-drag image cropper.
 * Users click and drag across the image to freely draw their desired crop rectangle.
 * No modals, no overlays on the video player.
 */
function InlineImageCropper({ imageSrc, onApplyCrop, onCancel }) {
    const imgRef = useRef(null)
    const imgWrapperRef = useRef(null)
    const [isLoaded, setIsLoaded] = useState(false)
    
    // Crop box in percentage of image display area (0 to 100), null if not drawn yet
    const [crop, setCrop] = useState(null)
    const isDrawingRef = useRef(false)
    const startPointRef = useRef({ x: 0, y: 0 })

    // Pointer down handler on the exact image wrapper
    function handlePointerDown(e) {
        if (e.button !== 0 && e.pointerType === 'mouse') return
        if (!imgRef.current) return

        const rect = imgRef.current.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return

        const startX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
        const startY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))

        isDrawingRef.current = true
        startPointRef.current = { x: startX, y: startY }

        setCrop({
            x: startX,
            y: startY,
            width: 0,
            height: 0
        })

        if (e.currentTarget.setPointerCapture && e.pointerId !== undefined) {
            try {
                e.currentTarget.setPointerCapture(e.pointerId)
            } catch (err) {
                // ignore
            }
        }
    }

    // Pointer move listener to resize crop box during drag
    function handlePointerMove(e) {
        if (!isDrawingRef.current || !imgRef.current) return

        const rect = imgRef.current.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return

        const currentX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
        const currentY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))

        const start = startPointRef.current
        const left = Math.min(start.x, currentX)
        const top = Math.min(start.y, currentY)
        const width = Math.abs(currentX - start.x)
        const height = Math.abs(currentY - start.y)

        setCrop({
            x: left,
            y: top,
            width: width,
            height: height
        })
    }

    function handlePointerUp(e) {
        if (isDrawingRef.current) {
            isDrawingRef.current = false
            if (e.currentTarget.releasePointerCapture && e.pointerId !== undefined) {
                try {
                    e.currentTarget.releasePointerCapture(e.pointerId)
                } catch (err) {
                    // ignore
                }
            }
            // If drawn area is negligible (e.g. simple click without drag), clear selection
            setCrop(prev => {
                if (!prev || prev.width < 2 || prev.height < 2) {
                    return null
                }
                return prev
            })
        }
    }

    // Perform canvas crop
    function handleApply() {
        if (!imgRef.current) return
        const img = imgRef.current
        const nw = img.naturalWidth
        const nh = img.naturalHeight

        if (!nw || !nh) return

        // If no crop drawn, use full image
        const hasDrawnCrop = crop && crop.width >= 2 && crop.height >= 2
        const currentCrop = hasDrawnCrop ? crop : { x: 0, y: 0, width: 100, height: 100 }

        // Source pixel coordinates on original resolution image
        const srcX = Math.max(0, Math.round((currentCrop.x / 100) * nw))
        const srcY = Math.max(0, Math.round((currentCrop.y / 100) * nh))
        const srcW = Math.min(nw - srcX, Math.max(1, Math.round((currentCrop.width / 100) * nw)))
        const srcH = Math.min(nh - srcY, Math.max(1, Math.round((currentCrop.height / 100) * nh)))

        if (srcW <= 0 || srcH <= 0) return

        // Compute optimized dimensions
        const scale = Math.min(1, MAX_CROP_WIDTH / srcW, MAX_CROP_HEIGHT / srcH)
        const destW = Math.max(1, Math.round(srcW * scale))
        const destH = Math.max(1, Math.round(srcH * scale))

        const canvas = document.createElement('canvas')
        canvas.width = destW
        canvas.height = destH
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, destW, destH)

        let quality = 0.85
        let result = canvas.toDataURL('image/jpeg', quality)
        while (result.length > 1.2 * 1024 * 1024 && quality > 0.4) {
            quality -= 0.1
            result = canvas.toDataURL('image/jpeg', quality)
        }

        onApplyCrop(result)
    }

    const hasActiveCrop = crop && crop.width >= 2 && crop.height >= 2

    return (
        <div className="bg-light-surface dark:bg-dark-bg/95 border border-primary/40 rounded-xl overflow-hidden p-3 space-y-2.5 animate-fade-in shadow-md">
            {/* Header */}
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-medium text-light-text-secondary dark:text-dark-text-secondary">
                    <Crop className="w-3.5 h-3.5 text-primary-fg" />
                    <span>Click & drag across image to crop</span>
                </div>
                {hasActiveCrop && (
                    <button
                        type="button"
                        onClick={() => setCrop(null)}
                        className="text-[11px] text-primary-fg hover:underline cursor-pointer"
                    >
                        Clear crop
                    </button>
                )}
            </div>

            {/* Viewport container */}
            <div className="flex justify-center items-center bg-black/95 rounded-lg overflow-hidden p-1 min-h-[160px] max-h-[280px]">
                {/* Exact Image-Fit Box */}
                <div
                    ref={imgWrapperRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className="relative inline-block select-none cursor-crosshair touch-none"
                    style={{ maxHeight: '260px' }}
                >
                    <img
                        ref={imgRef}
                        src={imageSrc}
                        crossOrigin="anonymous"
                        alt="Crop target"
                        onLoad={() => setIsLoaded(true)}
                        className="max-h-[260px] w-auto max-w-full object-contain pointer-events-none block rounded-sm select-none"
                        draggable={false}
                    />

                    {isLoaded && hasActiveCrop && (
                        <>
                            {/* Darkened Overlay Masks Outside Drawn Box */}
                            <div
                                className="absolute bg-black/65 pointer-events-none"
                                style={{ top: 0, left: 0, right: 0, height: `${crop.y}%` }}
                            />
                            <div
                                className="absolute bg-black/65 pointer-events-none"
                                style={{ bottom: 0, left: 0, right: 0, height: `${100 - (crop.y + crop.height)}%` }}
                            />
                            <div
                                className="absolute bg-black/65 pointer-events-none"
                                style={{ top: `${crop.y}%`, left: 0, width: `${crop.x}%`, height: `${crop.height}%` }}
                            />
                            <div
                                className="absolute bg-black/65 pointer-events-none"
                                style={{ top: `${crop.y}%`, right: 0, width: `${100 - (crop.x + crop.width)}%`, height: `${crop.height}%` }}
                            />

                            {/* Drawn Selection Box */}
                            <div
                                className="absolute border-2 border-primary ring-1 ring-white/80 pointer-events-none"
                                style={{
                                    top: `${crop.y}%`,
                                    left: `${crop.x}%`,
                                    width: `${crop.width}%`,
                                    height: `${crop.height}%`
                                }}
                            >
                                {/* Grid Lines */}
                                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-35 pointer-events-none">
                                    <div className="border-r border-b border-white" />
                                    <div className="border-r border-b border-white" />
                                    <div className="border-b border-white" />
                                    <div className="border-r border-b border-white" />
                                    <div className="border-r border-b border-white" />
                                    <div className="border-b border-white" />
                                    <div className="border-r border-white" />
                                    <div className="border-r border-white" />
                                    <div />
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-3 py-1 text-xs border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg transition-colors cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleApply}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs bg-primary text-primary-content hover:bg-primary-hover rounded-lg font-medium shadow-sm transition-colors cursor-pointer"
                >
                    <Check className="w-3.5 h-3.5" />
                    <span>{hasActiveCrop ? 'Apply Crop' : 'Keep Full'}</span>
                </button>
            </div>
        </div>
    )
}

export default InlineImageCropper
