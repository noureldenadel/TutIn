/**
 * Centralized Language Definitions & Mapping Utilities for TutIn
 * Used for Course Metadata, Whisper AI, Subtitle Translation (NLLB-200), and AI Dubbing (XTTS)
 */

export const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English', dubbingSupported: true },
    { code: 'es', name: 'Spanish', nativeName: 'Español', dubbingSupported: true },
    { code: 'fr', name: 'French', nativeName: 'Français', dubbingSupported: true },
    { code: 'de', name: 'German', nativeName: 'Deutsch', dubbingSupported: true },
    { code: 'ar', name: 'Arabic (MSA)', nativeName: 'العربية', dubbingSupported: true },
    { code: 'ar-eg', name: 'Arabic — Egyptian', nativeName: 'عامية مصرية', requiresOpenRouter: true, dubbingSupported: true },
    { code: 'ar-sa', name: 'Arabic — Gulf / Saudi', nativeName: 'عربي خليجي', requiresOpenRouter: true, dubbingSupported: true },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', dubbingSupported: true },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', dubbingSupported: true },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', dubbingSupported: true },
    { code: 'zh', name: 'Chinese', nativeName: '中文', dubbingSupported: true },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', dubbingSupported: true },
    { code: 'ko', name: 'Korean', nativeName: '한국어', dubbingSupported: true },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dubbingSupported: true },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dubbingSupported: true },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', dubbingSupported: true },
    { code: 'pl', name: 'Polish', nativeName: 'Polski', dubbingSupported: true },
    { code: 'cs', name: 'Czech', nativeName: 'Čeština', dubbingSupported: true },
    { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', dubbingSupported: true },
    { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', dubbingSupported: false },
    { code: 'th', name: 'Thai', nativeName: 'ไทย', dubbingSupported: false },
    { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', dubbingSupported: false },
    { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', dubbingSupported: false },
    { code: 'sv', name: 'Swedish', nativeName: 'Svenska', dubbingSupported: false },
    { code: 'da', name: 'Danish', nativeName: 'Dansk', dubbingSupported: false },
    { code: 'no', name: 'Norwegian', nativeName: 'Norsk', dubbingSupported: false },
    { code: 'fi', name: 'Finnish', nativeName: 'Suomi', dubbingSupported: false },
    { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', dubbingSupported: false },
    { code: 'he', name: 'Hebrew', nativeName: 'עברית', dubbingSupported: false }
]

export const DUBBING_SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES.filter(l => l.dubbingSupported)

export function isDubbingSupported(code) {
    if (!code) return false
    const clean = code.toLowerCase().trim()
    return DUBBING_SUPPORTED_LANGUAGES.some(l => l.code === clean)
}

export const LANGUAGE_LABEL_MAP = Object.fromEntries(
    SUPPORTED_LANGUAGES.map(l => [l.code, l.nativeName])
)

LANGUAGE_LABEL_MAP['source'] = 'Original'

export function getLanguageLabel(code) {
    if (!code) return 'English'
    const clean = code.toLowerCase().trim()
    return LANGUAGE_LABEL_MAP[clean] || SUPPORTED_LANGUAGES.find(l => l.code === clean)?.name || code.toUpperCase()
}

export function getLanguageInfo(code) {
    if (!code) return SUPPORTED_LANGUAGES[0]
    const clean = code.toLowerCase().trim()
    return SUPPORTED_LANGUAGES.find(l => l.code === clean) || { code: clean, name: clean.toUpperCase(), nativeName: clean.toUpperCase() }
}

/**
 * NLLB-200 BCP-47 / Flores-200 language code mappings
 */
export const NLLB_LANG_MAP = {
    'en': 'eng_Latn',
    'ar': 'arb_Arab',
    'es': 'spa_Latn',
    'fr': 'fra_Latn',
    'de': 'deu_Latn',
    'zh': 'zho_Hans',
    'ja': 'jpn_Jpan',
    'ko': 'kor_Hang',
    'ru': 'rus_Cyrl',
    'pt': 'por_Latn',
    'it': 'ita_Latn',
    'hi': 'hin_Deva',
    'tr': 'tur_Latn',
    'nl': 'nld_Latn',
    'pl': 'pol_Latn',
    'vi': 'vie_Latn',
    'th': 'tha_Thai',
    'cs': 'ces_Latn',
    'hu': 'hun_Latn',
    'uk': 'ukr_Cyrl',
    'id': 'ind_Latn',
    'sv': 'swe_Latn',
    'da': 'dan_Latn',
    'no': 'nob_Latn',
    'fi': 'fin_Latn',
    'el': 'ell_Grek',
    'he': 'heb_Hebr'
}
