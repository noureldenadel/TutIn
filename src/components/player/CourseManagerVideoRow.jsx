import { GripVertical, X, Loader2, Play, AlertTriangle, Headphones, Trash2, CheckCircle2, Circle } from 'lucide-react'
import { formatDuration } from '../../utils/db'

// Language-specific color mapping for tags
const LANG_COLORS = {
    'en': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'es': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'ar': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'fr': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    'de': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    'it': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    'pt': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    'ru': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    'zh': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    'ja': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    'ko': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    'default': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
}

export default function CourseManagerVideoRow({ 
    video, 
    isSelected, 
    onToggleSelect, 
    isActive,
    onActivate,
    onDelete,
    onUpdatePrimaryTranscript,
    job, 
    onCancelJob,
    draggableProps 
}) {
    // Extract available languages safely and normalize to lowercase for color mapping
    const transcriptLangs = video.subtitleSources 
        ? [...new Set(video.subtitleSources.map(s => String(s.lang).toLowerCase()))] 
        : video.subtitleFiles 
            ? [...new Set(video.subtitleFiles.map(s => String(s.lang).toLowerCase()))] 
            : []
        
    const dubLangs = video.dubbedTracks 
        ? [...new Set(video.dubbedTracks.map(s => String(s.language || s.lang).toLowerCase()))] 
        : []

    return (
        <div 
            {...draggableProps}
            onClick={onActivate}
            className={`
                flex items-center gap-3 p-3 rounded-lg border transition-colors group cursor-pointer
                ${isActive ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white dark:bg-dark-surface border-light-border dark:border-dark-border hover:border-blue-500/30'}
                ${draggableProps?.isDragging ? 'opacity-50 scale-[0.99]' : ''}
                ${draggableProps?.isDragOver ? 'border-t-2 border-t-primary' : ''}
            `}
        >
            {/* 1. Drag Handle */}
            <div 
                {...draggableProps?.dragHandleProps} 
                className="w-6 shrink-0 cursor-grab text-gray-400 hover:text-primary transition-colors flex justify-center"
                onClick={e => e.stopPropagation()}
            >
                <GripVertical className="w-5 h-5" />
            </div>

            {/* 2. Select Box */}
            <div 
                className="w-6 shrink-0 flex justify-center cursor-pointer text-gray-400 hover:text-primary transition-colors" 
                onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            >
                {isSelected ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                    <Circle className="w-5 h-5" />
                )}
            </div>

            {/* 3. Name (Title) & Duration */}
            <div className="flex-1 min-w-[150px] overflow-hidden flex items-center gap-2">
                <span className={`truncate text-sm font-medium ${isActive ? 'text-blue-500' : ''}`} title={video.title}>
                    {video.title}
                </span>
                {video.duration > 0 && (
                    <span className="text-xs text-gray-500 shrink-0">({formatDuration(video.duration)})</span>
                )}
            </div>

            {/* 4. Transcript Badges */}
            <div className="w-[100px] shrink-0 flex flex-wrap gap-1">
                {transcriptLangs.map(lang => (
                    <span key={lang} className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${LANG_COLORS[lang] || LANG_COLORS['default']}`}>
                        {lang}
                    </span>
                ))}
            </div>

            {/* 5. Dubbed Badges */}
            <div className="w-[100px] shrink-0 flex flex-wrap gap-1">
                {dubLangs.map(lang => (
                    <span key={lang} className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${LANG_COLORS[lang] || LANG_COLORS['default']}`}>
                        {lang} <Headphones className="w-3 h-3" />
                    </span>
                ))}
            </div>

            {/* 6. Process Loading Bar Area */}
            <div className="w-[180px] shrink-0 flex items-center" onClick={e => e.stopPropagation()}>
                {job ? (
                    <div className="w-full flex items-center gap-2 bg-light-bg dark:bg-dark-bg rounded-full p-1 pl-3 pr-1 border border-light-border dark:border-dark-border">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-[10px] mb-0.5">
                                <span className="truncate font-medium capitalize text-primary">{job.type}</span>
                                <span className="text-gray-500">{Math.round(job.progress)}%</span>
                            </div>
                            <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${job.progress}%` }} />
                            </div>
                        </div>
                        {job.status === 'processing' ? (
                            <button 
                                onClick={() => onCancelJob(video.id)}
                                className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full hover:bg-danger/10 text-danger transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        ) : job.status === 'error' ? (
                            <AlertTriangle className="w-4 h-4 text-danger mr-1" title={job.error} />
                        ) : job.status === 'done' ? (
                            <div className="w-4 h-4 rounded-full bg-green-500 mr-1" />
                        ) : null}
                    </div>
                ) : null}
            </div>

            {/* 7. Default Transcript Dropdown */}
            <div className="w-[140px] shrink-0" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-1">
                    <select
                        value={video.primaryTranscript || ''}
                        onChange={(e) => onUpdatePrimaryTranscript(video.id, e.target.value)}
                        className="w-full text-xs border border-light-border dark:border-dark-border px-2 py-1.5 rounded bg-light-bg dark:bg-dark-bg cursor-pointer truncate outline-none focus:border-primary"
                    >
                        <option value="">Auto / Default</option>
                        {video.subtitleSources?.map((src, i) => (
                            <option key={i} value={`${src.lang}:${src.origin}`}>
                                {src.lang.toUpperCase()} ({src.origin})
                            </option>
                        ))}
                    </select>
                    {video.primaryTranscript && !video.subtitleSources?.find(s => `${s.lang}:${s.origin}` === video.primaryTranscript) && (
                        <AlertTriangle className="w-4 h-4 text-warning shrink-0" title="Selected transcript file is missing or deleted" />
                    )}
                </div>
            </div>

            {/* 8. Delete Button */}
            <div className="w-8 shrink-0 flex justify-center" onClick={e => e.stopPropagation()}>
                <button 
                    onClick={onDelete}
                    className="p-1.5 text-gray-400 hover:text-danger hover:bg-danger/10 rounded transition-colors"
                    title="Delete Video"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

