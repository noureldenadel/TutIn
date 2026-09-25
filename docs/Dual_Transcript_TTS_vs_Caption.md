# Dual-Transcript Output: TTS Text vs. Caption Text

The orthography adjustments — dialectal respelling, selective diacritics, phonetic nudging toward correct dialect pronunciation — are optimized for how the *TTS phonemizer reads text*, not for how a human *reads captions on screen*. Diacritic marks and non-standard dialectal spelling that help XTTS pronounce correctly can look cluttered, unfamiliar, or even slightly odd to a native reader who expects normal written Egyptian/Gulf Arabic (as commonly written in social media, WhatsApp, YouTube comments, etc.).

So the translation and orthography steps should produce **two divergent outputs from one translation pass**, not one shared text used for both purposes:

| Output | Purpose | Characteristics |
|---|---|---|
| **TTS-text** | Fed only to XTTS/dialect-tuned voice model | Dialectal respelling applied, selective tashkeel/diacritics added, glossary-corrected for MSA leakage — optimized purely for correct pronunciation, never shown to the user. |
| **Caption-text** | Shown as on-screen subtitles | Natural dialect wording (real slang, natural code-switching), but in *standard, undiacritized, normally-readable* spelling — the way a native speaker would actually type it, not the phonetically-hinted version. |

**Where this fits in the pipeline:**

```
NLLB/LLM dialectal translation (full sentence)
              │
              ├──→ Caption-text branch:
              │      keep natural dialect wording as-is (no diacritics,
              │      standard spelling) → proportionally re-sliced into
              │      cue timestamps → on-screen captions
              │
              └──→ TTS-text branch:
                     apply dialectal respelling + selective diacritics
                     + glossary correction → fed to XTTS/dialect
                     fine-tune → dubbed audio only, never displayed
```

**Implementation note:** this is one extra lightweight transform step after translation (or one extra LLM prompt variant), not a second full translation pass — both branches start from the same translated sentence, so cost stays roughly the same as today's single-output translation.

**File naming:** since captions and TTS-audio artifacts already diverge downstream, keep this split explicit in intermediate file naming (e.g., `01-generated.ar-eg.captions.vtt` vs. an internal-only `01-generated.ar-eg.tts.txt` that isn't exposed in the `.tutin` folder's user-facing file listing).
