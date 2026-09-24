import React, { createContext, useContext, useState } from 'react';

const JobsContext = createContext();

export function JobsProvider({ children }) {
    // { [videoId]: { type, status, progress, message, abortController } }
    const [activeJobs, setActiveJobs] = useState({});

    const setJob = (videoId, jobData) => {
        setActiveJobs(prev => ({
            ...prev,
            [videoId]: typeof jobData === 'function' ? jobData(prev[videoId]) : { ...prev[videoId], ...jobData }
        }));
    };

    const removeJob = (videoId) => {
        setActiveJobs(prev => {
            const next = { ...prev };
            delete next[videoId];
            return next;
        });
    };

    const cancelJob = (videoId) => {
        setActiveJobs(prev => {
            const job = prev[videoId];
            if (job && job.abortController) {
                job.abortController.abort();
            }
            const next = { ...prev };
            delete next[videoId];
            return next;
        });
    };

    return (
        <JobsContext.Provider value={{ activeJobs, setJob, removeJob, cancelJob, setActiveJobs }}>
            {children}
        </JobsContext.Provider>
    );
}

export function useJobs() {
    return useContext(JobsContext);
}
