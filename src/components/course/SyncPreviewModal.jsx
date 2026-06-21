import { useState } from 'react'
import {
    X, Plus, Minus, ArrowRight, CheckCircle2, AlertTriangle,
    FolderSync, Video, FolderOpen, RefreshCw
} from 'lucide-react'
import { formatDuration } from '../../utils/db'

function SyncPreviewModal({ preview, isOpen, onConfirm, onCancel, isApplying }) {
    const [activeTab, setActiveTab] = useState('summary')

    if (!isOpen || !preview) return null

    const hasChanges = preview.added.length > 0 ||
        preview.removed.length > 0 ||
        preview.moved.length > 0 ||
        (preview.updated?.length || 0) > 0 ||
        preview.newModules.length > 0 ||
        preview.removedModules.length > 0 ||
        preview.thumbnailChanged

    const tabs = [
        { id: 'summary', label: 'Summary' },
        preview.added.length > 0 && { id: 'added', label: `Added (${preview.added.length})` },
        preview.removed.length > 0 && { id: 'removed', label: `Removed (${preview.removed.length})` },
        preview.moved.length > 0 && { id: 'moved', label: `Moved (${preview.moved.length})` },
        (preview.updated?.length || 0) > 0 && { id: 'updated', label: `Updated (${preview.updated.length})` },
    ].filter(Boolean)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

            <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <div className="flex items-center gap-3">
                        <FolderSync className="w-5 h-5 text-primary" />
                        <div>
                            <h2 className="text-lg font-semibold">Sync Preview</h2>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                {preview.course.title}
                            </p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg" disabled={isApplying}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-4 pt-3 overflow-x-auto scrollbar-hide">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                activeTab === tab.id
                                    ? 'bg-primary dark:bg-primary-fg/15 text-primary-content dark:text-primary-fg'
                                    : 'text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-bg'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {activeTab === 'summary' && (
                        <>
                            {!hasChanges ? (
                                <div className="text-center py-8">
                                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-success" />
                                    <p className="font-medium text-lg">Already up to date</p>
                                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                        No changes detected in the course folder.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Stats cards */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 bg-light-surface dark:bg-dark-bg rounded-lg text-center">
                                            <p className="text-2xl font-bold">{preview.totalBefore}</p>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Videos before</p>
                                        </div>
                                        <div className="p-3 bg-light-surface dark:bg-dark-bg rounded-lg text-center">
                                            <p className="text-2xl font-bold">{preview.totalAfter}</p>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Videos after</p>
                                        </div>
                                    </div>

                                    {/* Change summary rows */}
                                    {preview.added.length > 0 && (
                                        <SummaryRow
                                            icon={<Plus className="w-4 h-4" />}
                                            color="text-success"
                                            bgColor="bg-success/10"
                                            label="New videos"
                                            count={preview.added.length}
                                            onClick={() => setActiveTab('added')}
                                        />
                                    )}
                                    {preview.removed.length > 0 && (
                                        <SummaryRow
                                            icon={<Minus className="w-4 h-4" />}
                                            color="text-error"
                                            bgColor="bg-error/10"
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
                                            color="text-info"
                                            bgColor="bg-info/10"
                                            label="Moved videos"
                                            count={preview.moved.length}
                                            onClick={() => setActiveTab('moved')}
                                        />
                                    )}
                                    {preview.newModules.length > 0 && (
                                        <SummaryRow
                                            icon={<FolderOpen className="w-4 h-4" />}
                                            color="text-success"
                                            bgColor="bg-success/10"
                                            label="New modules"
                                            count={preview.newModules.length}
                                        />
                                    )}
                                    {preview.removedModules.length > 0 && (
                                        <SummaryRow
                                            icon={<FolderOpen className="w-4 h-4" />}
                                            color="text-error"
                                            bgColor="bg-error/10"
                                            label="Removed modules"
                                            count={preview.removedModules.length}
                                        />
                                    )}
                                    {(preview.updated?.length || 0) > 0 && (
                                        <SummaryRow
                                            icon={<RefreshCw className="w-4 h-4" />}
                                            color="text-warning"
                                            bgColor="bg-warning/10"
                                            label="Updated metadata"
                                            count={preview.updated.length}
                                            detail="duration fixed"
                                            onClick={() => setActiveTab('updated')}
                                        />
                                    )}
                                    {preview.thumbnailChanged && (
                                        <SummaryRow
                                            icon={<RefreshCw className="w-4 h-4" />}
                                            color="text-info"
                                            bgColor="bg-info/10"
                                            label="New thumbnail detected"
                                            count={1}
                                            detail="will be updated"
                                        />
                                    )}
                                    <SummaryRow
                                        icon={<CheckCircle2 className="w-4 h-4" />}
                                        color="text-light-text-secondary dark:text-dark-text-secondary"
                                        bgColor="bg-light-surface dark:bg-dark-bg"
                                        label="Unchanged videos"
                                        count={preview.unchanged.length}
                                    />

                                    {preview.removed.some(v => v.isCompleted) && (
                                        <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg text-sm">
                                            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                                            <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                                Some completed videos will be removed. Their progress and notes will be lost.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'added' && (
                        <VideoList
                            videos={preview.added}
                            emptyText="No new videos"
                            renderItem={(v) => (
                                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-success/5">
                                    <Plus className="w-4 h-4 text-success flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{v.title}</p>
                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            {v.module} • {formatDuration(v.duration)}
                                        </p>
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    {activeTab === 'removed' && (
                        <VideoList
                            videos={preview.removed}
                            emptyText="No removed videos"
                            renderItem={(v) => (
                                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-error/5">
                                    <Minus className="w-4 h-4 text-error flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{v.title}</p>
                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            {v.module}
                                            {v.isCompleted && <span className="ml-1 text-success">✓ completed</span>}
                                        </p>
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    {activeTab === 'moved' && (
                        <VideoList
                            videos={preview.moved}
                            emptyText="No moved videos"
                            renderItem={(v) => (
                                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-info/5">
                                    <ArrowRight className="w-4 h-4 text-info flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{v.title}</p>
                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            {v.fromModule} → {v.toModule}
                                        </p>
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    {activeTab === 'updated' && (
                        <VideoList
                            videos={preview.updated || []}
                            emptyText="No updated videos"
                            renderItem={(v) => (
                                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-warning/5">
                                    <RefreshCw className="w-4 h-4 text-warning flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{v.title}</p>
                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                            Duration: {formatDuration(v.oldDuration)} → {formatDuration(v.newDuration)}
                                        </p>
                                    </div>
                                </div>
                            )}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t border-light-border dark:border-dark-border">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg"
                        disabled={isApplying}
                    >
                        Cancel
                    </button>
                    {hasChanges && (
                        <button
                            onClick={onConfirm}
                            disabled={isApplying}
                            className="px-4 py-2 text-sm bg-primary text-primary-content hover:bg-primary-hover rounded-lg disabled:opacity-50 flex items-center gap-2"
                        >
                            {isApplying ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Applying...
                                </>
                            ) : (
                                <>
                                    <FolderSync className="w-4 h-4" />
                                    Apply Changes
                                </>
                            )}
                        </button>
                    )}
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
            className={`flex items-center justify-between p-3 rounded-lg ${bgColor} ${onClick ? 'cursor-pointer hover:opacity-80' : ''} w-full`}
        >
            <div className="flex items-center gap-2">
                <span className={color}>{icon}</span>
                <span className="text-sm font-medium">{label}</span>
            </div>
            <div className="flex items-center gap-2">
                {detail && (
                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        {detail}
                    </span>
                )}
                <span className={`text-sm font-semibold ${color}`}>{count}</span>
            </div>
        </Component>
    )
}

function VideoList({ videos, emptyText, renderItem }) {
    if (videos.length === 0) {
        return (
            <div className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary">
                {emptyText}
            </div>
        )
    }

    return (
        <div className="space-y-1.5">
            {videos.map((v, i) => (
                <div key={v.fileName || i}>{renderItem(v)}</div>
            ))}
        </div>
    )
}

export default SyncPreviewModal
