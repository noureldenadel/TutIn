/**
 * Centralized Language Definitions & Mapping Utilities for TutIn
 * Used for Course Metadata, Whisper AI, Subtitle Translation (NLLB-200), and AI Dubbing (XTTS)
 */

export const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
    { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
    { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
    { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
    { code: 'cs', name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿' },
    { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', flag: '🇭🇺' },
    { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
    { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
    { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪' },
    { code: 'da', name: 'Danish', nativeName: 'Dansk', flag: '🇩🇰' },
    { code: 'no', name: 'Norwegian', nativeName: 'Norsk', flag: '🇳🇴' },
    { code: 'fi', name: 'Finnish', nativeName: 'Suomi', flag: '🇫🇮' },
    { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', flag: '🇬🇷' },
    { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱' }
]

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
    return SUPPORTED_LANGUAGES.find(l => l.code === clean) || { code: clean, name: clean.toUpperCase(), nativeName: clean.toUpperCase(), flag: '🌐' }
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
