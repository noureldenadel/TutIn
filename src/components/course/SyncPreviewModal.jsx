import { useState } from 'react'
import {
    X, Plus, Minus, ArrowRight, CheckCircle2, AlertTriangle,
    FolderSync, Video, FolderOpen, RefreshCw, Mic, FileText,
    Sparkles, LayoutGrid, BookOpen, ShieldCheck, HardDrive,
    Layers, ChevronRight, FileCheck, Check
} from 'lucide-react'
import { formatDuration } from '../../utils/db'

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function SyncPreviewModal({ preview, isOpen, onConfirm, onCancel, isApplying }) {
    const [activeTab, setActiveTab] = useState('summary')

    if (!isOpen || !preview) return null

    const vaultStats = preview.vaultStats || {
        hasVault: false,
        totalSizeBytes: 0,
        totalFileCount: 0,
        dubs: { diskCount: 0, newCount: 0, languages: [] },
        transcripts: { diskCount: 0, newCount: 0, languages: [] },
        summaries: { diskCount: 0, newCount: 0 },
        canvas: { exists: false, nodeCount: 0, edgeCount: 0 },
        notes: { count: 0, screenshotsCount: 0 }
    }

    const hasVideoChanges = (preview.added?.length || 0) > 0 ||
        (preview.removed?.length || 0) > 0 ||
        (preview.moved?.length || 0) > 0 ||
        (preview.updated?.length || 0) > 0 ||
        (preview.newModules?.length || 0) > 0 ||
        (preview.removedModules?.length || 0) > 0 ||
        preview.thumbnailChanged

    const hasAssetChanges = (preview.assetUpdates?.length || 0) > 0 ||
        (vaultStats.dubs?.newCount || 0) > 0 ||
        (vaultStats.transcripts?.newCount || 0) > 0 ||
        (vaultStats.summaries?.newCount || 0) > 0

    const hasChanges = hasVideoChanges || hasAssetChanges

    const tabs = [
        { id: 'summary', label: 'Summary' },
        (preview.assetUpdates?.length || 0) > 0 && { id: 'assets', label: `New Assets (${preview.assetUpdates.length})` },
        vaultStats.totalFileCount > 0 && { id: 'vault', label: `Vault (${vaultStats.totalFileCount})` },
        (preview.added?.length || 0) > 0 && { id: 'added', label: `Added (${preview.added.length})` },
        (preview.removed?.length || 0) > 0 && { id: 'removed', label: `Removed (${preview.removed.length})` },
        (preview.moved?.length || 0) > 0 && { id: 'moved', label: `Moved (${preview.moved.length})` },
        (preview.updated?.length || 0) > 0 && { id: 'updated', label: `Updated (${preview.updated.length})` },
    ].filter(Boolean)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

            <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-2xl border border-light-border dark:border-dark-border w-full max-w-2xl max-h-[88vh] flex flex-col animate-scale-in overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 px-6 border-b border-light-border dark:border-dark-border bg-light-surface/60 dark:bg-dark-bg/40">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary dark:text-primary-fg flex items-center justify-center flex-shrink-0">
                            <FolderSync className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold truncate tracking-tight text-gray-900 dark:text-white">
                                Course &amp; Vault Sync
                            </h2>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate">
                                {preview.course.title}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg text-light-text-secondary hover:text-light-text dark:hover:text-dark-text transition-colors"
                        disabled={isApplying}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Vault Status Banner */}
                <div className="px-6 py-2.5 bg-gradient-to-r from-primary/5 via-primary/10 to-transparent border-b border-light-border dark:border-dark-border flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-2">
                        {vaultStats.hasVault ? (
                            <>
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <ShieldCheck className="w-3.5 h-3.5 inline" />
                                    .tutin Vault Active
                                </span>
                                <span className="text-light-text-secondary dark:text-dark-text-secondary">•</span>
                                <span className="text-light-text-secondary dark:text-dark-text-secondary font-medium">
                                    {vaultStats.totalFileCount} asset files ({formatBytes(vaultStats.totalSizeBytes)})
                                </span>
                            </>
                        ) : (
                            <span className="text-amber-500 flex items-center gap-1 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                .tutin Vault will initialize on first asset generation
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary hidden sm:block truncate max-w-[260px]">
                        {vaultStats.vaultPath || preview.course.folderPath || 'Local course'}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1.5 px-6 pt-3 pb-1 overflow-x-auto scrollbar-hide border-b border-light-border/60 dark:border-dark-border/60">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                                activeTab === tab.id
                                    ? 'bg-primary text-primary-content shadow-sm'
                                    : 'text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-bg'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {activeTab === 'summary' && (
                        <div className="space-y-5">
                            {/* 5 Asset Indicator Cards */}
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                    Vault Assets Status
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                    {/* 1. Dubs Card */}
                                    <div className="p-3 rounded-xl bg-light-surface dark:bg-dark-bg/60 border border-light-border dark:border-dark-border relative overflow-hidden group hover:border-primary/40 transition-colors">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                                <Mic className="w-3.5 h-3.5 text-violet-500" />
                                                <span>Voice Dubs</span>
                                            </div>
                                            {vaultStats.dubs.newCount > 0 && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                    +{vaultStats.dubs.newCount} new
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                                            {vaultStats.dubs.diskCount} <span className="text-xs font-normal text-light-text-secondary">tracks</span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-1 text-[11px] text-light-text-secondary dark:text-dark-text-secondary truncate">
                                            {vaultStats.dubs.languages?.length > 0 ? (
                                                <div className="flex gap-1 flex-wrap">
                                                    {vaultStats.dubs.languages.map(l => (
                                                        <span key={l} className="px-1 py-0.2 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded text-[9px] uppercase font-mono font-bold">
                                                            {l}
                                                        </span>
                                                    ))}
                                                    <span className="text-[10px] opacity-75">({formatBytes(vaultStats.dubs.sizeBytes)})</span>
                                                </div>
                                            ) : (
                                                <span>None generated</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 2. Transcripts Card */}
                                    <div className="p-3 rounded-xl bg-light-surface dark:bg-dark-bg/60 border border-light-border dark:border-dark-border relative overflow-hidden group hover:border-primary/40 transition-colors">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                                <FileText className="w-3.5 h-3.5 text-sky-500" />
                                                <span>Transcripts &amp; CC</span>
                                            </div>
                                            {vaultStats.transcripts.newCount > 0 && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                    +{vaultStats.transcripts.newCount} new
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                                            {vaultStats.transcripts.diskCount} <span className="text-xs font-normal text-light-text-secondary">files</span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-1 text-[11px] text-light-text-secondary dark:text-dark-text-secondary truncate">
                                            {vaultStats.transcripts.languages?.length > 0 ? (
                                                <div className="flex gap-1 flex-wrap">
                                                    {vaultStats.transcripts.languages.map(l => (
                                                        <span key={l} className="px-1 py-0.2 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded text-[9px] uppercase font-mono font-bold">
                                                            {l}
                                                        </span>
                                                    ))}
                                                    <span className="text-[10px] opacity-75">({vaultStats.transcripts.generatedCount} AI)</span>
                                                </div>
                                            ) : (
                                                <span>None detected</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 3. Summaries Card */}
                                    <div className="p-3 rounded-xl bg-light-surface dark:bg-dark-bg/60 border border-light-border dark:border-dark-border relative overflow-hidden group hover:border-primary/40 transition-colors">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                                <span>AI Summaries</span>
                                            </div>
                                            {vaultStats.summaries.newCount > 0 && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                    +{vaultStats.summaries.newCount} new
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                                            {vaultStats.summaries.diskCount} <span className="text-xs font-normal text-light-text-secondary">summaries</span>
                                        </div>
                                        <div className="mt-1 text-[11px] text-light-text-secondary dark:text-dark-text-secondary truncate">
                                            {vaultStats.summaries.diskCount > 0 ? 'Stored in .tutin/summaries' : 'None generated'}
                                        </div>
                                    </div>

                                    {/* 4. Canvas Whiteboard Card */}
                                    <div className="p-3 rounded-xl bg-light-surface dark:bg-dark-bg/60 border border-light-border dark:border-dark-border relative overflow-hidden group hover:border-primary/40 transition-colors">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                                <LayoutGrid className="w-3.5 h-3.5 text-emerald-500" />
                                                <span>Course Canvas</span>
                                            </div>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                                vaultStats.canvas.exists
                                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                    : 'bg-neutral-500/10 text-neutral-500'
                                            }`}>
                                                {vaultStats.canvas.exists ? 'Active' : 'Empty'}
                                            </span>
                                        </div>
                                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                                            {vaultStats.canvas.nodeCount} <span className="text-xs font-normal text-light-text-secondary">nodes</span>
                                        </div>
                                        <div className="mt-1 text-[11px] text-light-text-secondary dark:text-dark-text-secondary truncate">
                                            {vaultStats.canvas.edgeCount} connectors linked
                                        </div>
                                    </div>

                                    {/* 5. Notes & Screenshots Card */}
                                    <div className="p-3 rounded-xl bg-light-surface dark:bg-dark-bg/60 border border-light-border dark:border-dark-border relative overflow-hidden group hover:border-primary/40 transition-colors col-span-2 sm:col-span-2">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                                                <span>Notes &amp; Media Vault</span>
                                            </div>
                                            <span className="text-[10px] font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                                .tutin/notes/
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-lg font-bold text-gray-900 dark:text-white">
                                                {vaultStats.notes.count} <span className="text-xs font-normal text-light-text-secondary">markdown notes</span>
                                            </div>
                                            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">•</span>
                                            <div className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                                {vaultStats.notes.screenshotsCount} screenshots
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Video & File Structure Changes */}
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                    Video &amp; Structure Changes
                                </h3>

                                {!hasChanges ? (
                                    <div className="text-center py-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                                        <p className="font-semibold text-sm text-gray-900 dark:text-white">All in sync!</p>
                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                                            Database, video files, dubs, transcripts, canvas, and summaries are up to date.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Videos count compare */}
                                        <div className="grid grid-cols-2 gap-2.5">
                                            <div className="p-2.5 bg-light-surface dark:bg-dark-bg/60 rounded-xl border border-light-border dark:border-dark-border text-center">
                                                <p className="text-xl font-bold text-gray-900 dark:text-white">{preview.totalBefore}</p>
                                                <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">Videos in DB</p>
                                            </div>
                                            <div className="p-2.5 bg-light-surface dark:bg-dark-bg/60 rounded-xl border border-light-border dark:border-dark-border text-center">
                                                <p className="text-xl font-bold text-gray-900 dark:text-white">{preview.totalAfter}</p>
                                                <p className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">Videos on Disk</p>
                                            </div>
                                        </div>

                                        {/* Summary rows */}
                                        {preview.assetUpdates?.length > 0 && (
                                            <SummaryRow
                                                icon={<Sparkles className="w-4 h-4" />}
                                                color="text-violet-500"
                                                bgColor="bg-violet-500/10"
                                                label="New vault assets to attach"
                                                count={preview.assetUpdates.length}
                                                detail="dubs / transcripts / summaries"
                                                onClick={() => setActiveTab('assets')}
                                            />
                                        )}
                                        {preview.added.length > 0 && (
                                            <SummaryRow
                                                icon={<Plus className="w-4 h-4" />}
                                                color="text-emerald-500"
                                                bgColor="bg-emerald-500/10"
                                                label="New videos discovered"
                                                count={preview.added.length}
                                                onClick={() => setActiveTab('added')}
                                            />
                                        )}
                                        {preview.removed.length > 0 && (
                                            <SummaryRow
                                                icon={<Minus className="w-4 h-4" />}
                                                color="text-rose-500"
                                                bgColor="bg-rose-500/10"
                                                label="Removed videos"
                                                count={preview.removed.length}
                                                detail={
                                                    preview.removed.some(v => v.isCompleted)
                                                        ? `${preview.removed.filter(v => v.isCompleted).length} completed`
                                                        : null
                                                }
                                                onClick={() => setActiveTab('removed')}
                                            />
                                        )}
                                        {preview.moved.length > 0 && (
                                            <SummaryRow
                                                icon={<ArrowRight className="w-4 h-4" />}
                                                color="text-sky-500"
                                                bgColor="bg-sky-500/10"
                                                label="Moved to different modules"
                                                count={preview.moved.length}
                                                onClick={() => setActiveTab('moved')}
                                            />
                                        )}
                                        {preview.newModules.length > 0 && (
                                            <SummaryRow
                                                icon={<FolderOpen className="w-4 h-4" />}
                                                color="text-emerald-500"
                                                bgColor="bg-emerald-500/10"
                                                label="New modules / sections"
                                                count={preview.newModules.length}
                                            />
                                        )}
                                        {preview.removedModules.length > 0 && (
                                            <SummaryRow
                                                icon={<FolderOpen className="w-4 h-4" />}
                                                color="text-rose-500"
                                                bgColor="bg-rose-500/10"
                                                label="Removed empty modules"
                                                count={preview.removedModules.length}
                                            />
                                        )}
                                        {(preview.updated?.length || 0) > 0 && (
                                            <SummaryRow
                                                icon={<RefreshCw className="w-4 h-4" />}
                                                color="text-amber-500"
                                                bgColor="bg-amber-500/10"
                                                label="Updated metadata / duration"
                                                count={preview.updated.length}
                                                onClick={() => setActiveTab('updated')}
                                            />
                                        )}
                                        {preview.thumbnailChanged && (
                                            <SummaryRow
                                                icon={<RefreshCw className="w-4 h-4" />}
                                                color="text-sky-500"
                                                bgColor="bg-sky-500/10"
                                                label="New course thumbnail detected"
                                                count={1}
                                            />
                                        )}

                                        {preview.removed.some(v => v.isCompleted) && (
                                            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs">
                                                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                                    Some completed videos will be removed. Their progress and video-level notes will be cleaned up.
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* New Assets Tab */}
                    {activeTab === 'assets' && (
                        <div className="space-y-3">
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                The following existing videos have new Dubs, Transcripts, or Summaries ready to be synchronized into your database:
                            </p>
                            <VideoList
                                videos={preview.assetUpdates || []}
                                emptyText="No new vault assets discovered"
                                renderItem={(v) => (
                                    <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/15 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold truncate text-gray-900 dark:text-white">
                                                {v.title}
                                            </p>
                                            <span className="text-xs text-light-text-secondary">
                                                {formatDuration(v.duration)}
                                            </span>
                                        </div>
                                        {/* Newly discovered badges */}
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {v.newDubs?.map((d, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-500/15 text-violet-700 dark:text-violet-300 rounded-md text-[11px] font-medium border border-violet-500/20">
                                                    <Mic className="w-3 h-3" />
                                                    + New Dub [{d.lang?.toUpperCase()}]
                                                </span>
                                            ))}
                                            {v.newSubs?.map((s, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-500/15 text-sky-700 dark:text-sky-300 rounded-md text-[11px] font-medium border border-sky-500/20">
                                                    <FileText className="w-3 h-3" />
                                                    + New CC [{s.lang?.toUpperCase()}]
                                                </span>
                                            ))}
                                            {v.newSummary && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded-md text-[11px] font-medium border border-amber-500/20">
                                                    <Sparkles className="w-3 h-3" />
                                                    + New Summary
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            />
                        </div>
                    )}

                    {/* Vault Overview Tab */}
                    {activeTab === 'vault' && (
                        <div className="space-y-4">
                            <div className="p-3 rounded-xl bg-light-surface dark:bg-dark-bg/60 border border-light-border dark:border-dark-border text-xs space-y-1">
                                <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                    Portable Vault Storage (.tutin/)
                                </div>
                                <p className="text-light-text-secondary dark:text-dark-text-secondary">
                                    All your summaries, whiteboard notes, audio dubs, and transcripts are stored inside this course folder.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                                    Asset Breakdown
                                </h4>
                                <div className="space-y-2">
                                    {/* Dubs breakdown */}
                                    <div className="p-3 rounded-xl bg-light-surface dark:bg-dark-bg/40 border border-light-border dark:border-dark-border">
                                        <div className="flex items-center justify-between text-xs font-semibold mb-1">
                                            <span className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400">
                                                <Mic className="w-3.5 h-3.5" />
                                                Dubbed Audio Files ({vaultStats.dubs.diskCount})
                                            </span>
                                            <span className="text-light-text-secondary">{formatBytes(vaultStats.dubs.sizeBytes)}</span>
                                        </div>
                                        {vaultStats.dubs.files?.length > 0 ? (
                                            <div className="max-h-24 overflow-y-auto space-y-1 mt-2 text-[11px] text-light-text-secondary">
                                                {vaultStats.dubs.files.map((f, i) => (
                                                    <div key={i} className="flex items-center justify-between py-0.5 font-mono truncate">
                                                        <span className="truncate">{f.fileName}</span>
                                                        <span className="px-1 bg-violet-500/10 rounded uppercase text-[10px] text-violet-500 font-bold ml-2">
                                                            {f.lang}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-light-text-secondary">No audio dubs found in .tutin/dubs/</p>
                                        )}
                                    </div>

                                    {/* Transcripts breakdown */}
                                    <div className="p-3 rounded-xl bg-light-surface dark:bg-dark-bg/40 border border-light-border dark:border-dark-border">
                                        <div className="flex items-center justify-between text-xs font-semibold mb-1">
                                            <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                                                <FileText className="w-3.5 h-3.5" />
                                                Transcripts &amp; Captions ({vaultStats.transcripts.diskCount})
                                            </span>
                                            <span className="text-light-text-secondary">
                                                {vaultStats.transcripts.generatedCount} AI, {vaultStats.transcripts.uploadedCount} uploaded
                                            </span>
                                        </div>
                                        {vaultStats.transcripts.files?.length > 0 ? (
                                            <div className="max-h-24 overflow-y-auto space-y-1 mt-2 text-[11px] text-light-text-secondary">
                                                {vaultStats.transcripts.files.map((f, i) => (
                                                    <div key={i} className="flex items-center justify-between py-0.5 font-mono truncate">
                                                        <span className="truncate">{f.fileName}</span>
                                                        <span className="px-1 bg-sky-500/10 rounded uppercase text-[10px] text-sky-500 font-bold ml-2">
                                                            {f.lang} ({f.format})
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-light-text-secondary">No transcripts found</p>
                                        )}
                                    </div>

                                    {/* Summaries breakdown */}
                                    <div className="p-3 rounded-xl bg-light-surface dark:bg-dark-bg/40 border border-light-border dark:border-dark-border">
                                        <div className="flex items-center justify-between text-xs font-semibold mb-1">
                                            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                                <Sparkles className="w-3.5 h-3.5" />
                                                Video Summaries ({vaultStats.summaries.diskCount})
                                            </span>
                                            <span className="text-light-text-secondary">.tutin/summaries/</span>
                                        </div>
                                        {vaultStats.summaries.files?.length > 0 ? (
                                            <div className="max-h-24 overflow-y-auto space-y-1 mt-2 text-[11px] text-light-text-secondary">
                                                {vaultStats.summaries.files.map((f, i) => (
                                                    <div key={i} className="flex items-center justify-between py-0.5 font-mono truncate">
                                                        <span className="truncate">{f.fileName}</span>
                                                        <span className="text-[10px] text-amber-500 font-bold">.md</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-light-text-secondary">No summary markdown files found</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Added Tab */}
                    {activeTab === 'added' && (
                        <VideoList
                            videos={preview.added}
                            emptyText="No new videos"
                            renderItem={(v) => (
                                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                        <p className="text-sm font-semibold truncate text-gray-900 dark:text-white">{v.title}</p>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-light-text-secondary">
                                        <span>{v.module} • {formatDuration(v.duration)}</span>
                                        {/* Inline badges */}
                                        <div className="flex items-center gap-1">
                                            {v.dubs?.length > 0 && (
                                                <span className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] font-semibold">
                                                    🎙️ {v.dubs.length} Dubs
                                                </span>
                                            )}
                                            {v.subtitles?.length > 0 && (
                                                <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-semibold">
                                                    💬 {v.subtitles.length} CC
                                                </span>
                                            )}
                                            {v.hasSummary && (
                                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                                                    📝 Summary
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    {/* Removed Tab */}
                    {activeTab === 'removed' && (
                        <VideoList
                            videos={preview.removed}
                            emptyText="No removed videos"
                            renderItem={(v) => (
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/5 border border-rose-500/15">
                                    <Minus className="w-4 h-4 text-rose-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{v.title}</p>
                                        <p className="text-xs text-light-text-secondary">
                                            {v.module}
                                            {v.isCompleted && <span className="ml-1 text-emerald-500 font-semibold">✓ completed</span>}
                                        </p>
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    {/* Moved Tab */}
                    {activeTab === 'moved' && (
                        <VideoList
                            videos={preview.moved}
                            emptyText="No moved videos"
                            renderItem={(v) => (
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-sky-500/5 border border-sky-500/15">
                                    <ArrowRight className="w-4 h-4 text-sky-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{v.title}</p>
                                        <p className="text-xs text-light-text-secondary">
                                            {v.fromModule} → <span className="text-sky-600 dark:text-sky-400 font-medium">{v.toModule}</span>
                                        </p>
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    {/* Updated Tab */}
                    {activeTab === 'updated' && (
                        <VideoList
                            videos={preview.updated || []}
                            emptyText="No updated videos"
                            renderItem={(v) => (
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
                                    <RefreshCw className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{v.title}</p>
                                        <p className="text-xs text-light-text-secondary">
                                            Duration: {formatDuration(v.oldDuration)} → <span className="font-semibold text-gray-900 dark:text-white">{formatDuration(v.newDuration)}</span>
                                        </p>
                                    </div>
                                </div>
                            )}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 px-6 border-t border-light-border dark:border-dark-border bg-light-surface/60 dark:bg-dark-bg/40">
                    <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        {hasChanges ? (
                            <span>Review detected changes above before applying.</span>
                        ) : (
                            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Course is fully up to date.
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 text-xs font-semibold border border-light-border dark:border-dark-border rounded-xl hover:bg-light-surface dark:hover:bg-dark-bg transition-colors"
                            disabled={isApplying}
                        >
                            {hasChanges ? 'Cancel' : 'Close'}
                        </button>
                        {hasChanges && (
                            <button
                                onClick={onConfirm}
                                disabled={isApplying}
                                className="px-5 py-2 text-xs font-semibold bg-primary text-primary-content hover:bg-primary/90 rounded-xl disabled:opacity-50 flex items-center gap-2 shadow-sm transition-all"
                            >
                                {isApplying ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Applying Sync...
                                    </>
                                ) : (
                                    <>
                                        <FolderSync className="w-3.5 h-3.5" />
                                        Apply Sync
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function SummaryRow({ icon, color, bgColor, label, count, detail, onClick }) {
    const Component = onClick ? 'button' : 'div'
    return (
        <Component
            onClick={onClick}
            className={`flex items-center justify-between p-2.5 px-3 rounded-xl ${bgColor} ${onClick ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''} w-full text-left`}
        >
            <div className="flex items-center gap-2.5 min-w-0">
                <span className={color}>{icon}</span>
                <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">{label}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                {detail && (
                    <span className="text-[11px] text-light-text-secondary dark:text-dark-text-secondary">
                        {detail}
                    </span>
                )}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${bgColor} ${color}`}>
                    {count}
                </span>
                {onClick && <ChevronRight className="w-3 h-3 text-light-text-secondary opacity-50" />}
            </div>
        </Component>
    )
}

function VideoList({ videos, emptyText, renderItem }) {
    if (videos.length === 0) {
        return (
            <div className="text-center py-8 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                {emptyText}
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {videos.map((v, i) => (
                <div key={v.filePath || v.fileName || i}>{renderItem(v)}</div>
            ))}
        </div>
    )
}

export default SyncPreviewModal
