export interface SupportedLanguage {
  code: string;
  label: string;
  nativeLabel: string;
  rtl?: boolean;
  requiresCloudKey?: boolean;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", rtl: true },
  {
    code: "ar-eg",
    label: "Arabic (Egyptian)",
    nativeLabel: "العامية المصرية",
    rtl: true,
    requiresCloudKey: true,
  },
  {
    code: "ar-sa",
    label: "Arabic (Saudi)",
    nativeLabel: "اللهجة السعودية",
    rtl: true,
    requiresCloudKey: true,
  },
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
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { code: "th", label: "Thai", nativeLabel: "ไทย" },
  { code: "sv", label: "Swedish", nativeLabel: "Svenska" },
  { code: "da", label: "Danish", nativeLabel: "Dansk" },
  { code: "no", label: "Norwegian", nativeLabel: "Norsk" },
  { code: "fi", label: "Finnish", nativeLabel: "Suomi" },
  { code: "cs", label: "Czech", nativeLabel: "Čeština" },
  { code: "hu", label: "Hungarian", nativeLabel: "Magyar" },
  { code: "uk", label: "Ukrainian", nativeLabel: "Українська" },
  { code: "el", label: "Greek", nativeLabel: "Ελληνικά" },
  { code: "he", label: "Hebrew", nativeLabel: "עברית", rtl: true },
] as const;

export const SPOKEN_COURSE_LANGUAGES: readonly SupportedLanguage[] = SUPPORTED_LANGUAGES.filter(
  (l) => !l.requiresCloudKey,
);

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

const RTL_LANG_CODES = new Set<string>(SUPPORTED_LANGUAGES.filter((l) => l.rtl).map((l) => l.code));

export function normalizeLanguageCode(input?: string | null): string {
  const raw = String(input ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return "en";
  const withoutOrigin = raw.split(":")[0] ?? raw;
  return LABEL_TO_CODE.get(withoutOrigin) ?? withoutOrigin;
}

export function getLanguageLabel(code?: string | null): string {
  const normalized = normalizeLanguageCode(code);
  if (normalized === "source") return "Original";
  return CODE_TO_LABEL.get(normalized) ?? normalized.toUpperCase();
}

export const getLanguageName = getLanguageLabel;

export function isRtlLanguage(code?: string | null): boolean {
  const normalized = normalizeLanguageCode(code);
  return (
    RTL_LANG_CODES.has(normalized) ||
    normalized.startsWith("ar") ||
    normalized === "fa" ||
    normalized === "ur"
  );
}

export function getOriginLabel(origin?: string | null, version?: number | null): string {
  if (origin === "generated") return "AI";
  const ver = typeof version === "number" && version > 1 ? version : 1;
  return ver > 1 ? `Uploaded #${ver}` : "Uploaded";
}

export function formatTrackDisplayLabel(input: {
  lang?: string | null | undefined;
  origin?: string | null | undefined;
  version?: number | null | undefined;
  label?: string | null | undefined;
}): string {
  const langName = getLanguageLabel(input.lang);
  const originText =
    input.label && (input.label.startsWith("Uploaded") || input.label === "AI")
      ? input.label
      : getOriginLabel(input.origin, input.version);
  return `${langName} · ${originText}`;
}
