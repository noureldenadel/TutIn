export interface SupportedLanguage {
  code: string;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe" },
  { code: "nl", label: "Dutch", nativeLabel: "Nederlands" },
  { code: "pl", label: "Polish", nativeLabel: "Polski" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
  { code: "sv", label: "Swedish", nativeLabel: "Svenska" },
] as const;

const LABEL_TO_CODE = new Map<string, string>(
  SUPPORTED_LANGUAGES.flatMap((lang) => [
    [lang.code.toLowerCase(), lang.code],
    [lang.label.toLowerCase(), lang.code],
    [lang.nativeLabel.toLowerCase(), lang.code],
  ]),
);

const CODE_TO_LABEL = new Map<string, string>(
  SUPPORTED_LANGUAGES.map((lang) => [lang.code, lang.label]),
);

export function normalizeLanguageCode(input?: string | null): string {
  const trimmed = String(input ?? "").trim().toLowerCase();
  if (!trimmed) return "en";
  return LABEL_TO_CODE.get(trimmed) ?? trimmed;
}

export function getLanguageLabel(code?: string | null): string {
  const normalized = normalizeLanguageCode(code);
  return CODE_TO_LABEL.get(normalized) ?? normalized.toUpperCase();
}

