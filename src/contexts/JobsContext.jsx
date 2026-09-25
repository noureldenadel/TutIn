import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { SERVER_URL } from '../utils/api';
import { transcribeVideoCaptions } from '../utils/aiSummarization';

const JobsContext = createContext();

export function JobsProvider({ children }) {
    // { [videoId]: { type, status, progress, message, abortController } }
    const [activeJobs, setActiveJobs] = useState({});
    const abortControllersRef = useRef({});

    const setJob = useCallback((videoId, jobData) => {
        setActiveJobs(prev => ({
            ...prev,
            [videoId]: typeof jobData === 'function' ? jobData(prev[videoId]) : { ...prev[videoId], ...jobData }
        }));
    }, []);

    const removeJob = useCallback((videoId) => {
        setActiveJobs(prev => {
            const next = { ...prev };
            delete next[videoId];
            return next;
        });
    }, []);

    const cancelJob = useCallback((videoId) => {
        if (abortControllersRef.current[videoId]) {
            abortControllersRef.current[videoId].abort();
            delete abortControllersRef.current[videoId];
        }
        setActiveJobs(prev => {
            const job = prev[videoId];
            if (job?.abortController) {
                job.abortController.abort();
            }
            const next = { ...prev };
            delete next[videoId];
            return next;
        });
    }, []);

    const runBatchJob = useCallback(async ({ type, videos, targetLang, course, settings, onVideoComplete }) => {
        const vids = [...videos];
        const sourceLang = (course?.language || 'en').toLowerCase().trim();
        const isTargetSource = targetLang === 'source' || targetLang === sourceLang;

        for (const video of vids) {
            const controller = new AbortController();
            abortControllersRef.current[video.id] = controller;

            setActiveJobs(prev => ({
                ...prev,
                [video.id]: { type, status: 'processing', progress: 5, message: 'Starting...', abortController: controller }
            }));

            try {
                if (type === 'dub') {
                    // Check if video is local
                    const isLocal = !video.youtubeId && !video.driveFileId && 
                        !(video.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be') || video.url.includes('drive.google.com'))) &&
                        (video.filePath || video.fileName);

                    if (!isLocal) {
                        setActiveJobs(prev => ({
                            ...prev,
                            [video.id]: { type, status: 'failed', progress: 0, message: 'Skipped: Dubbing requires local video file' }
                        }));
                        continue;
                    }

                    // Pre-flight check: ensure captions exist for this video
                    let hasTargetCaptions = false;
                    let hasSourceCaptions = false;
                    try {
                        const langRes = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/languages`, { signal: controller.signal });
                        if (langRes.ok) {
                            const data = await langRes.json();
                            const sources = data.subtitleSources || [];
                            hasTargetCaptions = data.existingLangs?.includes(targetLang) || sources.some(s => s.lang === targetLang);
                            hasSourceCaptions = data.sourceExists || data.existingLangs?.includes(sourceLang) || sources.some(s => s.lang === 'source' || s.lang === sourceLang);
                        }
                    } catch (e) {
                        if (controller.signal.aborted) break;
                    }

                    // If neither exists, transcribe source first
                    if (!hasTargetCaptions && !hasSourceCaptions) {
                        setActiveJobs(prev => ({
                            ...prev,
                            [video.id]: { ...prev[video.id], progress: 10, message: `Auto-transcribing source audio (${sourceLang.toUpperCase()})...` }
                        }));

                        await transcribeVideoCaptions(
                            video,
                            (p) => {
                                if (controller.signal.aborted) return;
                                const pct = Math.round(10 + (p.progress || 0) * 30);
                                setActiveJobs(prev => ({
                                    ...prev,
                                    [video.id]: { ...prev[video.id], progress: Math.min(pct, 40), message: p.message || 'Transcribing...' }
                                }));
                            },
                            settings?.aiDevice || 'auto',
                            sourceLang
                        );

                        window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                            detail: { videoId: video.id, lang: 'source' }
                        }));
                        hasSourceCaptions = true;
                    }

                    // If target captions still missing and target is different language, auto-translate
                    if (!hasTargetCaptions && targetLang !== sourceLang && targetLang !== 'source') {
                        setActiveJobs(prev => ({
                            ...prev,
                            [video.id]: { ...prev[video.id], progress: 42, message: `Translating captions to ${targetLang.toUpperCase()}...` }
                        }));

                        const transRes = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/translate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ targetLanguage: targetLang, sourceLanguage: sourceLang }),
                            signal: controller.signal
                        });

                        if (transRes.ok && transRes.body) {
                            const reader = transRes.body.getReader();
                            const decoder = new TextDecoder();
                            let buffer = '';
                            while (!controller.signal.aborted) {
                                const { value, done } = await reader.read();
                                if (done) break;
                                buffer += decoder.decode(value, { stream: true });
                                const lines = buffer.split('\n\n');
                                buffer = lines.pop();
                                for (const line of lines) {
                                    if (line.startsWith('data: ')) {
                                        try {
                                            const d = JSON.parse(line.substring(6));
                                            if (d.progress) {
                                                const pct = Math.round(42 + d.progress * 0.15);
                                                setActiveJobs(prev => ({
                                                    ...prev,
                                                    [video.id]: { ...prev[video.id], progress: Math.min(pct, 55), message: d.message || 'Translating subtitles...' }
                                                }));
                                            }
                                        } catch {}
                                    }
                                }
                            }
                        }
                    }

                    // Ensure dubbing service is running
                    try {
                        const statusCheck = await fetch(`${SERVER_URL}/api/dub/service/status`);
                        const statusData = await statusCheck.json();
                        if (!statusData.running) {
                            setActiveJobs(prev => ({
                                ...prev,
                                [video.id]: { ...prev[video.id], progress: 56, message: 'Starting Coqui XTTS dubbing service...' }
                            }));
                            await fetch(`${SERVER_URL}/api/dub/service/start`, { method: 'POST' });
                            for (let i = 0; i < 20; i++) {
                                await new Promise(r => setTimeout(r, 2000));
                                if (controller.signal.aborted) break;
                                const c = await fetch(`${SERVER_URL}/api/dub/service/status`);
                                const cd = await c.json();
                                if (cd.running) break;
                            }
                        }
                    } catch (serviceErr) {
                        console.warn('[Dub Service Check]', serviceErr);
                    }

                    if (controller.signal.aborted) break;

                    // Submit dub job
                    setActiveJobs(prev => ({
                        ...prev,
                        [video.id]: { ...prev[video.id], progress: 60, message: `Submitting dubbing job (${targetLang.toUpperCase()})...` }
                    }));

                    const res = await fetch(`${SERVER_URL}/api/dub/video/${video.id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ targetLanguage: targetLang }),
                        signal: controller.signal
                    });

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.error || `Server error: ${res.status}`);
                    }

                    // Poll status until done
                    let isJobDone = false;
                    while (!isJobDone && !controller.signal.aborted) {
                        await new Promise(r => setTimeout(r, 2000));
                        if (controller.signal.aborted) break;

                        const statusRes = await fetch(`${SERVER_URL}/api/dub/video/${video.id}/status`);
                        const data = await statusRes.json();

                        if (data.status === 'running' || data.status === 'queued') {
                            const rawProgress = data.progress || 50;
                            const scaledProgress = Math.round(60 + (rawProgress / 100) * 35);
                            setActiveJobs(prev => ({
                                ...prev,
                                [video.id]: { ...prev[video.id], progress: Math.min(scaledProgress, 95), message: data.step || 'Synthesizing voice...' }
                            }));
                        } else if (data.status === 'done') {
                            isJobDone = true;
                            window.dispatchEvent(new CustomEvent('tutin:dub-updated', {
                                detail: { videoId: video.id, lang: targetLang }
                            }));
                            setActiveJobs(prev => ({
                                ...prev,
                                [video.id]: { ...prev[video.id], status: 'done', progress: 100, message: 'Dubbing complete!' }
                            }));
                            onVideoComplete?.(video.id);
                            setTimeout(() => {
                                removeJob(video.id);
                            }, 3000);
                        } else if (data.status === 'failed') {
                            isJobDone = true;
                            throw new Error(data.error_message || data.error || 'Dubbing failed');
                        }
                    }
                } else if (type === 'translate') {
                    if (isTargetSource) {
                        // Transcribe spoken language
                        setActiveJobs(prev => ({
                            ...prev,
                            [video.id]: { ...prev[video.id], progress: 10, message: `Transcribing audio (${sourceLang.toUpperCase()})...` }
                        }));

                        await transcribeVideoCaptions(
                            video,
                            (p) => {
                                if (controller.signal.aborted) return;
                                const pct = Math.round(10 + (p.progress || 0) * 85);
                                setActiveJobs(prev => ({
                                    ...prev,
                                    [video.id]: { ...prev[video.id], progress: Math.min(pct, 95), message: p.message || `Transcribing (${sourceLang.toUpperCase()})...` }
                                }));
                            },
                            settings?.aiDevice || 'auto',
                            sourceLang
                        );

                        window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                            detail: { videoId: video.id, lang: 'source' }
                        }));

                        setActiveJobs(prev => ({
                            ...prev,
                            [video.id]: { ...prev[video.id], status: 'done', progress: 100, message: 'Captions generated!' }
                        }));
                        onVideoComplete?.(video.id);
                        setTimeout(() => {
                            removeJob(video.id);
                        }, 3000);
                    } else {
                        // Check if source captions exist, auto-transcribe if missing, then translate
                        let hasSource = false;
                        try {
                            const langRes = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/languages`, { signal: controller.signal });
                            if (langRes.ok) {
                                const data = await langRes.json();
                                const sources = data.subtitleSources || [];
                                hasSource = data.sourceExists || sources.some(s => s.lang === 'source' || s.lang === sourceLang);
                            }
                        } catch (e) {
                            hasSource = false;
                        }

                        if (!hasSource) {
                            setActiveJobs(prev => ({
                                ...prev,
                                [video.id]: { ...prev[video.id], progress: 10, message: `Step 1/2: Transcribing spoken audio (${sourceLang.toUpperCase()})...` }
                            }));

                            await transcribeVideoCaptions(
                                video,
                                (p) => {
                                    if (controller.signal.aborted) return;
                                    const pct = Math.round(10 + (p.progress || 0) * 40);
                                    setActiveJobs(prev => ({
                                        ...prev,
                                        [video.id]: { ...prev[video.id], progress: Math.min(pct, 50), message: `Step 1/2: ${p.message || 'Transcribing...'}` }
                                    }));
                                },
                                settings?.aiDevice || 'auto',
                                sourceLang
                            );

                            window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                                detail: { videoId: video.id, lang: 'source' }
                            }));
                        }

                        const needInitialTranscribe = !hasSource;
                        setActiveJobs(prev => ({
                            ...prev,
                            [video.id]: {
                                ...prev[video.id],
                                progress: needInitialTranscribe ? 55 : 10,
                                message: needInitialTranscribe
                                    ? `Step 2/2: Translating subtitles to ${targetLang.toUpperCase()}...`
                                    : `Translating subtitles to ${targetLang.toUpperCase()}...`
                            }
                        }));

                        const res = await fetch(`${SERVER_URL}/api/transcripts/${video.id}/translate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                targetLanguage: targetLang,
                                sourceLanguage: sourceLang
                            }),
                            signal: controller.signal
                        });

                        if (!res.ok) {
                            const errData = await res.json().catch(() => ({}));
                            throw new Error(errData.error || `Server error: ${res.status}`);
                        }

                        const reader = res.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = '';

                        while (!controller.signal.aborted) {
                            const { value, done } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n\n');
                            buffer = lines.pop();

                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    try {
                                        const data = JSON.parse(line.substring(6));
                                        if (data.error) throw new Error(data.error);
                                        if (data.step === 'done') {
                                            window.dispatchEvent(new CustomEvent('tutin:transcript-updated', {
                                                detail: { videoId: video.id, lang: targetLang }
                                            }));
                                            setActiveJobs(prev => ({
                                                ...prev,
                                                [video.id]: { ...prev[video.id], status: 'done', progress: 100, message: 'Translation complete!' }
                                            }));
                                            onVideoComplete?.(video.id);
                                            setTimeout(() => {
                                                removeJob(video.id);
                                            }, 3000);
                                        } else if (data.progress) {
                                            const basePct = needInitialTranscribe ? 55 : 10;
                                            const scale = needInitialTranscribe ? 0.42 : 0.85;
                                            const pct = Math.round(basePct + data.progress * scale);
                                            setActiveJobs(prev => ({
                                                ...prev,
                                                [video.id]: {
                                                    ...prev[video.id],
                                                    progress: Math.min(pct, 98),
                                                    message: `Translating: chunk ${data.chunkIndex + 1 || 1}/${data.totalChunks || 1}`
                                                }
                                            }));
                                        }
                                    } catch (err) {
                                        if (err.message) throw err;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                if (controller.signal.aborted) {
                    console.log(`Job for video ${video.id} was aborted`);
                } else {
                    console.error(`Job error for video ${video.id}:`, err);
                    setActiveJobs(prev => ({
                        ...prev,
                        [video.id]: {
                            ...prev[video.id],
                            status: 'failed',
                            progress: 0,
                            message: `Failed: ${err.message || 'Error occurred'}`
                        }
                    }));
                }
            } finally {
                delete abortControllersRef.current[video.id];
            }
        }
    }, [removeJob]);

    return (
        <JobsContext.Provider value={{ activeJobs, setJob, removeJob, cancelJob, setActiveJobs, runBatchJob }}>
            {children}
        </JobsContext.Provider>
    );
}

export function useJobs() {
    return useContext(JobsContext);
}
