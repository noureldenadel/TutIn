import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { applyDialectPhoneticNudges, stitchCuesIntoSentences } from '../../server/utils/aiTranslation.js'
import { saveTtsCompanionFile, loadTtsCompanionSegments, listVideoLanguages } from '../../server/utils/courseAssets.js'
import { extractLangCode } from '../../server/utils/captionParser.js'

console.log('--- 1. Testing extractLangCode with .tts. protection ---')
assert.strictEqual(extractLangCode('video.ar-eg.tts.json', 'video'), null, 'Should return null for .tts. companion file')
assert.strictEqual(extractLangCode('video.ar.vtt', 'video'), 'ar', 'Should extract standard language')

console.log('--- 2. Testing applyDialectPhoneticNudges ---')
const testText = 'أنا قلتله ييجي دلوقتي علشان نشوف إيه اللي هيحصل بعد كده'
const nudgedEg = applyDialectPhoneticNudges(testText, 'ar-eg')
console.log('Original:', testText)
console.log('Egyptian Nudged:', nudgedEg)
assert.ok(nudgedEg.includes('دِلْوَأْتي'), 'Should nudge دلوقتي to دِلْوَأْتي')
assert.ok(nudgedEg.includes('أُلتِلُه'), 'Should nudge قلتله to أُلتِلُه')
assert.ok(nudgedEg.includes('كِدا'), 'Should nudge كده to كِدا')
assert.ok(nudgedEg.includes('عَشَان'), 'Should nudge علشان to عَشَان')

const testGulf = 'الحين ابي اشوف ايش راح تسوي بعدين'
const nudgedSa = applyDialectPhoneticNudges(testGulf, 'ar-sa')
console.log('Original Gulf:', testGulf)
console.log('Gulf Nudged:', nudgedSa)
assert.ok(nudgedSa.includes('إِلْحِين'), 'Should nudge الحين to إِلْحِين')
assert.ok(nudgedSa.includes('أَبِي'), 'Should nudge ابي to أَبِي')

console.log('--- 3. Testing stitchCuesIntoSentences ---')
const sampleCues = [
    { start: 0.0, end: 1.5, timestamp: [0.0, 1.5], text: 'Hello world.' },
    { start: 1.6, end: 3.0, timestamp: [1.6, 3.0], text: 'Now we test.' }
]
const stitched = stitchCuesIntoSentences(sampleCues)
assert.strictEqual(stitched.length, 2)
assert.strictEqual(stitched[0].text, 'Hello world.')
assert.strictEqual(stitched[1].text, 'Now we test.')

console.log('--- 4. Testing Companion Save & Load ---')
const dummyMeta = {
    id: 'test_vid_123',
    courseFolder: null,
    relModulePath: '',
    videoBaseName: 'test_vid_123'
}
const dummySegments = [
    { start: 0.0, end: 1.5, timestamp: [0.0, 1.5], caption: 'مرحبا', text: 'مَرْحَبًا' }
]

const savedPath = saveTtsCompanionFile(dummyMeta, 'ar-eg', dummySegments)
assert.ok(savedPath, 'Should return saved path in AppData cache')
assert.ok(fs.existsSync(savedPath), 'Saved file should exist on disk')

const loadedSegments = loadTtsCompanionSegments(dummyMeta.id, 'ar-eg', dummyMeta)
assert.ok(loadedSegments, 'Loaded segments should not be null')
assert.strictEqual(loadedSegments.length, 1)
assert.strictEqual(loadedSegments[0].text, 'مَرْحَبًا')

// Clean up test file
try { fs.unlinkSync(savedPath) } catch {}

console.log('--- 5. Testing listVideoLanguages isolation ---')
const langs = listVideoLanguages(dummyMeta.id, [])
assert.strictEqual(langs.translatedLangs.includes('tts'), false, 'Internal tts companion must NEVER be listed as a language')

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

console.log('--- 7. Testing remapPunctuatedTextToCues spacing normalization ---')
const { remapPunctuatedTextToCues } = await import('../../server/utils/punctuationService.js')
const punctCues = [
    { start: 0, end: 1, timestamp: [0, 1], text: 'Hello' },
    { start: 1, end: 2, timestamp: [1, 2], text: 'world' }
]
// Input with stray spaces before punctuation
const remapped = remapPunctuatedTextToCues(punctCues, 'Hello world . How are you ?')
assert.strictEqual(remapped[0].text, 'Hello')
assert.strictEqual(remapped[1].text, 'world. How are you?')

console.log('ALL COMPANION PIPELINE AND EDGE-CASE TESTS PASSED SUCCESSFULLY!')
