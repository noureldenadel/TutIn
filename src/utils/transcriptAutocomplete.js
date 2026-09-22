/**
 * TutIn — Time-Aware Transcript Trie & N-Gram Indexer
 * 
 * Featherweight, sub-millisecond autocomplete engine for video note-taking.
 * Indexes transcript words, n-grams, and technical terms with timestamp awareness.
 */

// Common English stopwords to avoid annoying suggestions for trivial words
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
    'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'as', 'into', 'like',
    'through', 'after', 'over', 'between', 'out', 'against', 'during', 'without',
    'before', 'under', 'around', 'among', 'that', 'this', 'these', 'those',
    'it', 'its', 'you', 'your', 'we', 'our', 'they', 'their', 'he', 'his', 'she', 'her',
    'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'any', 'both',
    'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should',
    'now', 'um', 'uh', 'yeah', 'okay', 'so', 'then'
])

class TrieNode {
    constructor() {
        this.children = new Map()
        this.isWordEnd = false
        this.originalWords = new Set()
        this.phrases = [] // [{ phrase, timestamps: [], count }]
        this.timestamps = []
    }
}

export class TranscriptAutocompleteEngine {
    constructor() {
        this.root = new TrieNode()
        this.phrases = [] // list of indexed multi-word phrases
        this.isIndexed = false
        this.totalTokens = 0
    }

    /**
     * Clean and normalize text
     */
    static normalizeWord(word) {
        return word.toLowerCase().replace(/^[^\w\u0600-\u06FF]+|[^\w\u0600-\u06FF]+$/g, '')
    }

    /**
     * Build index from caption chunks or full transcript text
     * @param {Array<{ timestamp: [number, number], text: string }>} chunks 
     * @param {string} fullText 
     */
    indexTranscript(chunks = [], fullText = '') {
        this.root = new TrieNode()
        this.phrases = []
        this.totalTokens = 0

        // If chunks are available, index with timestamps
        if (Array.isArray(chunks) && chunks.length > 0) {
            for (const chunk of chunks) {
                const startTime = chunk.timestamp?.[0] || 0
                this.indexSentence(chunk.text || '', startTime)
            }
        } else if (fullText) {
            this.indexSentence(fullText, 0)
        }

        this.isIndexed = true
    }

    /**
     * Index a sentence or text segment
     */
    indexSentence(sentence, timestamp = 0) {
        if (!sentence) return
        const rawWords = sentence.split(/\s+/).filter(Boolean)
        const cleanWords = rawWords.map(w => TranscriptAutocompleteEngine.normalizeWord(w)).filter(Boolean)
        if (!cleanWords.length) return

        this.totalTokens += cleanWords.length

        // 1. Index individual words in Trie
        for (let i = 0; i < rawWords.length; i++) {
            const raw = rawWords[i]
            const clean = cleanWords[i]
            if (!clean || clean.length < 2) continue

            this.insertWord(clean, raw, timestamp)

            // 2. Index 2-gram, 3-gram, 4-gram, 5-gram phrases starting at position i
            for (let len = 2; len <= 5; len++) {
                if (i + len <= rawWords.length) {
                    const phraseSlice = rawWords.slice(i, i + len).join(' ')
                    const cleanPhrase = cleanWords.slice(i, i + len).join(' ')
                    this.insertPhrase(cleanPhrase, phraseSlice, cleanWords[i], timestamp)
                }
            }
        }
    }

    /**
     * Insert a word into the Trie
     */
    insertWord(cleanWord, originalWord, timestamp) {
        let node = this.root
        for (const char of cleanWord) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode())
            }
            node = node.children.get(char)
        }
        node.isWordEnd = true
        node.originalWords.add(originalWord)
        node.timestamps.push(timestamp)
    }

    /**
     * Insert a phrase indexed under its first word prefix
     */
    insertPhrase(cleanPhrase, originalPhrase, firstWord, timestamp) {
        let node = this.root
        for (const char of firstWord) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode())
            }
            node = node.children.get(char)
        }

        const existing = node.phrases.find(p => p.clean === cleanPhrase)
        if (existing) {
            existing.count++
            existing.timestamps.push(timestamp)
        } else {
            node.phrases.push({
                clean: cleanPhrase,
                original: originalPhrase,
                count: 1,
                timestamps: [timestamp]
            })
        }
    }

    /**
     * Score a suggestion based on time recency, frequency, and word count
     */
    static calculateScore(item, currentTime) {
        let recencyScore = 1.0
        if (currentTime != null && item.timestamps && item.timestamps.length > 0) {
            // Find closest occurrence to currentTime
            let minDiff = Infinity
            for (const ts of item.timestamps) {
                const diff = Math.abs(ts - currentTime)
                if (diff < minDiff) minDiff = diff
            }
            // If within 2 minutes (120s), boost significantly
            if (minDiff < 60) {
                recencyScore = 3.5
            } else if (minDiff < 180) {
                recencyScore = 2.0
            } else if (minDiff < 360) {
                recencyScore = 1.4
            }
        }

        const freqScore = Math.log2((item.count || item.timestamps?.length || 1) + 1)
        const lengthScore = Math.min((item.original || item.word || '').length / 10, 1.5)

        return recencyScore * freqScore * lengthScore
    }

    /**
     * Get autocomplete suggestion for the text preceding the cursor
     * @param {string} textBeforeCursor 
     * @param {number} currentTime 
     * @returns {{ completion: string, fullPhrase: string, prefix: string } | null}
     */
    getSuggestion(textBeforeCursor, currentTime = 0) {
        if (!textBeforeCursor || typeof textBeforeCursor !== 'string') return null

        // Extract the trailing words being typed (up to 3 words back)
        const trimmed = textBeforeCursor.replace(/\s+$/, '')
        const isTrailingSpace = /\s+$/.test(textBeforeCursor)
        if (!trimmed) return null

        const words = trimmed.split(/\s+/)
        if (!words.length) return null

        const lastRawWord = words[words.length - 1]
        const lastCleanWord = TranscriptAutocompleteEngine.normalizeWord(lastRawWord)

        // Need at least 2 characters to suggest
        if (!isTrailingSpace && lastCleanWord.length < 2) return null

        // 1. If user just finished typing a word and pressed space (e.g. "convolutional ")
        if (isTrailingSpace) {
            return this.getPhraseCompletionAfterWord(lastCleanWord, currentTime)
        }

        // 2. User is currently in the middle of typing a word (e.g. "convolut")
        return this.getWordOrPhraseCompletion(lastCleanWord, lastRawWord, currentTime)
    }

    /**
     * Autocomplete in-progress word or multi-word phrase
     */
    getWordOrPhraseCompletion(cleanPrefix, rawPrefix, currentTime) {
        let node = this.root
        for (const char of cleanPrefix) {
            if (!node.children.has(char)) return null
            node = node.children.get(char)
        }

        // Collect matching words & phrases from this sub-tree
        const candidatePhrases = []
        const candidateWords = []

        this.collectCandidates(node, cleanPrefix, candidateWords, candidatePhrases)

        // Prioritize multi-word phrases first, then single technical words
        const scoredPhrases = candidatePhrases
            .map(p => ({
                ...p,
                score: TranscriptAutocompleteEngine.calculateScore(p, currentTime)
            }))
            .sort((a, b) => b.score - a.score)

        if (scoredPhrases.length > 0) {
            const best = scoredPhrases[0]
            // Extract completion suffix
            // If best.original is "convolutional neural network" and user typed "convolut"
            // completion is "ional neural network"
            const completion = best.original.slice(rawPrefix.length)
            if (completion && completion.length > 0) {
                return {
                    prefix: rawPrefix,
                    completion,
                    fullPhrase: best.original
                }
            }
        }

        // Fallback to single word completions
        const scoredWords = candidateWords
            .filter(w => !STOP_WORDS.has(w.clean))
            .map(w => ({
                ...w,
                score: TranscriptAutocompleteEngine.calculateScore(w, currentTime)
            }))
            .sort((a, b) => b.score - a.score)

        if (scoredWords.length > 0) {
            const bestWord = scoredWords[0]
            const completion = bestWord.original.slice(rawPrefix.length)
            if (completion && completion.length > 0) {
                return {
                    prefix: rawPrefix,
                    completion,
                    fullPhrase: bestWord.original
                }
            }
        }

        return null
    }

    /**
     * Suggest next phrase after a completed word (e.g. "neural" -> " network")
     */
    getPhraseCompletionAfterWord(cleanWord, currentTime) {
        if (!cleanWord || STOP_WORDS.has(cleanWord)) return null

        let node = this.root
        for (const char of cleanWord) {
            if (!node.children.has(char)) return null
            node = node.children.get(char)
        }

        if (!node.phrases || node.phrases.length === 0) return null

        const scored = node.phrases
            .map(p => ({
                ...p,
                score: TranscriptAutocompleteEngine.calculateScore(p, currentTime)
            }))
            .sort((a, b) => b.score - a.score)

        const best = scored[0]
        if (!best) return null

        // Suffix is everything after the first word
        const words = best.original.split(/\s+/)
        if (words.length <= 1) return null

        const nextWords = words.slice(1).join(' ')
        return {
            prefix: '',
            completion: nextWords,
            fullPhrase: best.original
        }
    }

    /**
     * Traverse Trie to collect words and phrases under node
     */
    collectCandidates(node, prefix, wordsAcc, phrasesAcc, maxDepth = 15) {
        if (!node || maxDepth <= 0) return

        if (node.isWordEnd && node.originalWords.size > 0) {
            for (const orig of node.originalWords) {
                wordsAcc.push({
                    clean: prefix,
                    original: orig,
                    timestamps: node.timestamps
                })
            }
        }

        if (node.phrases && node.phrases.length > 0) {
            phrasesAcc.push(...node.phrases)
        }

        for (const [char, child] of node.children.entries()) {
            this.collectCandidates(child, prefix + char, wordsAcc, phrasesAcc, maxDepth - 1)
        }
    }

    /**
     * Get indexing statistics
     */
    getStats() {
        return {
            isIndexed: this.isIndexed && this.totalTokens > 0,
            totalTokens: this.totalTokens
        }
    }
}

// Global instance
export const transcriptEngine = new TranscriptAutocompleteEngine()
