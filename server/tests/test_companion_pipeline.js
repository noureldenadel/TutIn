import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutin_test_data_'))
process.env.TUTIN_DATA_DIR = testDataDir

import { applyDialectPhoneticNudges, stitchCuesIntoSentences, isDubbingLanguageSupported } from '../../server/utils/aiTranslation.js'
import { saveTtsCompanionFile, loadTtsCompanionSegments, deleteTtsCompanionFile, listVideoLanguages, loadCaptionChunks } from '../../server/utils/courseAssets.js'
import { extractLangCode } from '../../server/utils/captionParser.js'

console.log('--- 1. Testing extractLangCode with .tts. protection & dialect codes ---')
assert.strictEqual(extractLangCode('video.ar-eg.tts.json', 'video'), null, 'Should return null for .tts. companion file')
assert.strictEqual(extractLangCode('video.ar.vtt', 'video'), 'ar', 'Should extract standard language')
assert.strictEqual(extractLangCode('video-generated.ar-eg.vtt', 'video'), 'ar-eg', 'Should extract hyphenated dialect from -generated filename')
assert.strictEqual(extractLangCode('video.ar-sa.vtt', 'video'), 'ar-sa', 'Should extract hyphenated ar-sa dialect')
assert.strictEqual(extractLangCode('01 - Intro-uploaded.es.vtt', '01 - Intro'), 'es', 'Should extract lang after -uploaded suffix')

console.log('--- 2. Testing applyDialectPhoneticNudges ---')
const testMsa = 'الآن يجب أن نذهب لكي نرى ماذا سيحدث هكذا'
const nudgedEg = applyDialectPhoneticNudges(testMsa, 'ar-eg')
console.log('Original MSA:', testMsa)
console.log('Egyptian Nudged:', nudgedEg)
assert.ok(nudgedEg.includes('دلوقتي'), 'Should nudge الآن to دلوقتي')
assert.ok(nudgedEg.includes('علشان'), 'Should nudge لكي to علشان')
assert.ok(nudgedEg.includes('كده'), 'Should nudge هكذا to كده')
assert.ok(nudgedEg.includes('إيه'), 'Should nudge ماذا to إيه')
assert.strictEqual(/[\u0617-\u061A\u064B-\u065F\u0670]/.test(nudgedEg), false, 'Must not contain any Arabic tashkeel')

const testGulf = 'الآن نريد أن نرى كيف حالك وماذا سنفعل هكذا'
const nudgedSa = applyDialectPhoneticNudges(testGulf, 'ar-sa')
console.log('Original Gulf MSA:', testGulf)
console.log('Gulf Nudged:', nudgedSa)
assert.ok(nudgedSa.includes('الحين'), 'Should nudge الآن to الحين')
assert.ok(nudgedSa.includes('نبي'), 'Should nudge نريد to نبي')
assert.ok(nudgedSa.includes('شلونك'), 'Should nudge كيف حالك to شلونك')
assert.ok(nudgedSa.includes('إيش'), 'Should nudge ماذا to إيش')
assert.strictEqual(/[\u0617-\u061A\u064B-\u065F\u0670]/.test(nudgedSa), false, 'Must not contain any Arabic tashkeel')

console.log('--- 3. Testing stitchCuesIntoSentences (Empty Cue 1-to-1 Preservation) ---')
const sampleCues = [
    { start: 0.0, end: 1.5, timestamp: [0.0, 1.5], text: 'Hello world.' },
    { start: 1.5, end: 2.0, timestamp: [1.5, 2.0], text: '' }, // empty pause cue
    { start: 2.0, end: 3.5, timestamp: [2.0, 3.5], text: '[Music]' }, // non-speech cue
    { start: 3.5, end: 5.0, timestamp: [3.5, 5.0], text: 'Now we test.' }
]
const stitched = stitchCuesIntoSentences(sampleCues)
assert.strictEqual(stitched.length, 4, 'Must create 4 sentence structures preserving every cue')
assert.strictEqual(stitched[0].text, 'Hello world.')
assert.strictEqual(stitched[1].text, '', 'Empty cue must have empty text')
assert.strictEqual(stitched[1].isNonSpeech, true)
assert.strictEqual(stitched[2].text, '', 'Music cue must have empty text')
assert.strictEqual(stitched[2].isNonSpeech, true)
assert.strictEqual(stitched[3].text, 'Now we test.')
// Verify that total stitched cues equals original chunks length
const totalPreservedCues = stitched.flatMap(s => s.cues).length
assert.strictEqual(totalPreservedCues, sampleCues.length, 'Every single cue index and timestamp must be preserved 1-to-1')

console.log('--- 4. Testing Companion Save & Load ---')
const dummyMeta = {
    id: 'test_vid_123',
    courseFolder: null,
    relModulePath: '',
    videoBaseName: 'test_vid_123'
}
const dummySegments = [
    { start: 0.0, end: 1.5, timestamp: [0.0, 1.5], caption: 'مرحبا', text: 'مرحبا' }
]

const savedPath = saveTtsCompanionFile(dummyMeta, 'ar-eg', dummySegments)
assert.ok(savedPath, 'Should return saved path in AppData cache')
assert.ok(fs.existsSync(savedPath), 'Saved file should exist on disk')

const loadedSegments = loadTtsCompanionSegments(dummyMeta.id, 'ar-eg', dummyMeta)
assert.ok(loadedSegments, 'Loaded segments should not be null')
assert.strictEqual(loadedSegments.length, 1)
assert.strictEqual(loadedSegments[0].text, 'مرحبا')

deleteTtsCompanionFile(dummyMeta.id, 'ar-eg', dummyMeta)
assert.strictEqual(loadTtsCompanionSegments(dummyMeta.id, 'ar-eg', dummyMeta), null, 'Companion file should be deleted by deleteTtsCompanionFile')

console.log('--- 5. Testing listVideoLanguages isolation & loadCaptionChunks language strictness ---')
const langs = listVideoLanguages(dummyMeta.id, [])
assert.strictEqual(langs.translatedLangs.includes('tts'), false, 'Internal tts companion must NEVER be listed as a language')

// Create a mock English source VTT in temp dir and ensure requesting Arabic ('ar') does NOT fall back to English
const mockEnVttPath = path.join(testDataDir, 'video.en.vtt')
fs.writeFileSync(mockEnVttPath, 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello world in English.\n', 'utf8')
const mockSubtitleSources = [{ lang: 'en', filePath: mockEnVttPath, origin: 'existing', format: 'vtt' }]

const wrongLangFallback = loadCaptionChunks('test_vid_123', 'ar', mockSubtitleSources, null, '', 'video')
assert.strictEqual(wrongLangFallback.length, 0, 'Requesting target lang "ar" must NEVER fall back to English subtitleSources[0]')

const sourceFallback = loadCaptionChunks('test_vid_123', 'source', mockSubtitleSources, null, '', 'video')
assert.strictEqual(sourceFallback.length, 1, 'Requesting "source" should fall back to subtitleSources[0]')
assert.strictEqual(sourceFallback[0].text, 'Hello world in English.')

console.log('--- 5b. Testing XTTS language support validation ---')
assert.strictEqual(isDubbingLanguageSupported('ar-eg'), true)
assert.strictEqual(isDubbingLanguageSupported('es'), true)
assert.strictEqual(isDubbingLanguageSupported('vi'), false)
assert.strictEqual(isDubbingLanguageSupported('he'), false)

console.log('--- 6. Testing sliceTranslatedSentenceToCues underflow edge case ---')
const { sliceTranslatedSentenceToCues } = await import('../../server/utils/aiTranslation.js')
const fiveCues = [
    { start: 0, end: 1, timestamp: [0, 1], text: 'one' },
    { start: 1, end: 2, timestamp: [1, 2], text: 'two' },
    { start: 2, end: 3, timestamp: [2, 3], text: 'three' },
    { start: 3, end: 4, timestamp: [3, 4], text: 'four' },
    { start: 4, end: 5, timestamp: [4, 5], text: 'five' }
]
const sliced = sliceTranslatedSentenceToCues('ما ردتش', fiveCues)
console.log('Sliced cues underflow result:', sliced.map(c => c.text))
assert.strictEqual(sliced.length, 5)
assert.strictEqual(sliced[0].text, 'ما')
assert.strictEqual(sliced[1].text, 'ردتش')
assert.strictEqual(sliced[2].text, '')
assert.strictEqual(sliced[3].text, '')
assert.strictEqual(sliced[4].text, '')
// Verify words are not repeated
const joinedWords = sliced.map(c => c.text).filter(Boolean)
assert.strictEqual(joinedWords.length, 2, 'Words must not be duplicated across cues')

console.log('--- 7. Testing remapPunctuatedTextToCues spacing normalization & anti-hallucination ---')
const { remapPunctuatedTextToCues } = await import('../../server/utils/punctuationService.js')
const punctCues = [
    { start: 0, end: 1, timestamp: [0, 1], text: 'Hello' },
    { start: 1, end: 2, timestamp: [1, 2], text: 'world' }
]
// Input with stray spaces before punctuation and hallucinated extra trailing words
const remapped = remapPunctuatedTextToCues(punctCues, 'Here is the punctuated text: Hello world . How are you ?')
assert.strictEqual(remapped[0].text, 'Hello')
// Trailing extra words ('How are you ?') must NOT be dumped onto the last cue
assert.strictEqual(remapped[1].text, 'world.')

// Test that non-speech cue is preserved and does not steal speech words
const mixedCues = [
    { start: 0, end: 1, timestamp: [0, 1], text: '[Music]' },
    { start: 1, end: 2, timestamp: [1, 2], text: 'Welcome' },
    { start: 2, end: 3, timestamp: [2, 3], text: 'everyone' }
]
const mixedRemapped = remapPunctuatedTextToCues(mixedCues, 'Welcome everyone.')
assert.strictEqual(mixedRemapped[0].text, '')
assert.strictEqual(mixedRemapped[1].text, 'Welcome')
assert.strictEqual(mixedRemapped[2].text, 'everyone.')

try { fs.rmSync(testDataDir, { recursive: true, force: true }) } catch {}

console.log('ALL COMPANION PIPELINE AND EDGE-CASE TESTS PASSED SUCCESSFULLY!')
