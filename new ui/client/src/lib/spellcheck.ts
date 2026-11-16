import nspell, { type NSpellInstance } from "nspell";

import {
  extractRangeClipboardPayload,
  sanitizeClipboardHtml,
} from "@/components/notes/markdown/note-dom";
import {
  copyImageToClipboard,
  copyRichContentToClipboard,
  copyTextToClipboard,
} from "@/lib/clipboard";

const CUSTOM_DICT_STORAGE_KEY = "tutin_custom_dictionary_v1";
const AFF_URL = `${import.meta.env.BASE_URL}dictionaries/en/index.aff`;
const DIC_URL = `${import.meta.env.BASE_URL}dictionaries/en/index.dic`;
const MAX_SUGGESTIONS = 5;

const WORD_CHAR_RE = /[A-Za-z0-9'’-]/;
const ALPHA_RE = /[A-Za-z]/;
const SKIP_WORD_RE = /^(?:https?:\/\/|www\.|[\w.-]+@[\w.-]+\.\w+$|0x[0-9a-f]+$|\d+[\d.,:-]*$)/i;

let spellInstance: NSpellInstance | null = null;
let loadPromise: Promise<NSpellInstance | null> | null = null;
let customWordSetCache: Set<string> | null = null;
const sessionIgnoredWords = new Set<string>();
const readyListeners = new Set<() => void>();

export interface EditorContextHooks {
  onBeforeMutate?: () => void;
  onAfterPaste?: () => void;
  onPasteImage?: (file: File) => Promise<void>;
  onTryPasteVaultHtml?: (rawHtml: string) => Promise<boolean>;
  onCutRange?: (range: Range) => void;
}

const editorHooksMap = new WeakMap<HTMLElement, EditorContextHooks>();

export function registerEditorContextHooks(editorEl: HTMLElement, hooks: EditorContextHooks): void {
  editorHooksMap.set(editorEl, hooks);
}

function loadCustomWords(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_DICT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === "string") : [];
  } catch {
    return [];
  }
}

function persistCustomWords(words: string[]): void {
  customWordSetCache = new Set(words.map((w) => w.toLowerCase()));
  try {
    localStorage.setItem(CUSTOM_DICT_STORAGE_KEY, JSON.stringify(words));
  } catch {
    // ignore storage quota errors
  }
}

function getCustomWordSet(): Set<string> {
  if (!customWordSetCache) {
    customWordSetCache = new Set(loadCustomWords().map((w) => w.toLowerCase()));
  }
  return customWordSetCache;
}

export function subscribeSpellCheckerReady(listener: () => void): () => void {
  if (spellInstance) {
    listener();
    return () => {};
  }
  readyListeners.add(listener);
  return () => {
    readyListeners.delete(listener);
  };
}

export async function preloadSpellChecker(): Promise<NSpellInstance | null> {
  if (spellInstance) return spellInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const [affRes, dicRes] = await Promise.all([fetch(AFF_URL), fetch(DIC_URL)]);
      if (!affRes.ok || !dicRes.ok) {
        return null;
      }
      const [affText, dicText] = await Promise.all([affRes.text(), dicRes.text()]);
      const instance = nspell(affText, dicText);
      for (const word of loadCustomWords()) {
        instance.add(word);
      }
      spellInstance = instance;
      for (const listener of Array.from(readyListeners)) {
        listener();
      }
      readyListeners.clear();
      return instance;
    } catch {
      return null;
    }
  })();

  return loadPromise;
}

function normalizeWord(raw: string): string {
  return raw.replace(/’/g, "'").trim();
}

function isSkippableToken(word: string): boolean {
  if (word.length <= 1) return true;
  if (!ALPHA_RE.test(word)) return true;
  if (/\d/.test(word)) return true;
  if (SKIP_WORD_RE.test(word)) return true;
  return false;
}

function matchReplacementCase(original: string, suggestion: string): string {
  if (!original || !suggestion) return suggestion;
  const firstOriginal = original[0] ?? "";
  const isAllUpper = original.length > 1 && original === original.toUpperCase();
  if (isAllUpper && suggestion === suggestion.toLowerCase()) {
    return suggestion.toUpperCase();
  }
  const isCapitalized =
    firstOriginal >= "A" &&
    firstOriginal <= "Z" &&
    suggestion[0] &&
    suggestion[0] >= "a" &&
    suggestion[0] <= "z";
  if (isCapitalized) {
    return suggestion[0]!.toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

export interface SpellingCheckResult {
  isCorrect: boolean;
  suggestions: string[];
}

export function checkWordSpelling(rawWord: string): SpellingCheckResult | null {
  const word = normalizeWord(rawWord);
  if (isSkippableToken(word)) {
    return { isCorrect: true, suggestions: [] };
  }

  const lower = word.toLowerCase();
  if (sessionIgnoredWords.has(lower) || getCustomWordSet().has(lower)) {
    return { isCorrect: true, suggestions: [] };
  }

  if (!spellInstance) {
    return null;
  }

  if (spellInstance.correct(word)) {
    return { isCorrect: true, suggestions: [] };
  }

  // Handle possessives like "TutIn's" cleanly against the base noun
  if (lower.endsWith("'s") && word.length > 3) {
    const base = word.slice(0, -2);
    if (getCustomWordSet().has(base.toLowerCase()) || spellInstance.correct(base)) {
      return { isCorrect: true, suggestions: [] };
    }
  }

  const rawSuggestions = spellInstance.suggest(word);
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const cand of rawSuggestions) {
    const cased = matchReplacementCase(rawWord, cand);
    const key = cased.toLowerCase();
    if (seen.has(key) || key === lower) continue;
    seen.add(key);
    suggestions.push(cased);
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  return { isCorrect: false, suggestions };
}

export function addWordToDictionary(rawWord: string): void {
  const word = normalizeWord(rawWord);
  if (!word) return;
  const existing = loadCustomWords();
  const lower = word.toLowerCase();
  if (!existing.some((w) => w.toLowerCase() === lower)) {
    persistCustomWords([...existing, word]);
  }
  spellInstance?.add(word);
}

export function ignoreWordInSession(rawWord: string): void {
  const word = normalizeWord(rawWord).toLowerCase();
  if (word) {
    sessionIgnoredWords.add(word);
  }
}

export interface SpellcheckTargetMatch {
  word: string;
  replaceWith: (replacement: string) => void;
  addToDictionary: () => void;
  ignoreWord: () => void;
}

export interface ContextMenuTargetAnalysis {
  imageSrc: string | null;
  isEditable: boolean;
  selectedText: string;
  hasSelection: boolean;
  wordMatch: SpellcheckTargetMatch | null;
  cut: () => Promise<void>;
  copy: () => Promise<void>;
  paste: () => Promise<boolean>;
  pastePlainText: () => Promise<boolean>;
  copyImage: () => Promise<void>;
}

function getCaretPoint(clientX: number, clientY: number): { node: Node; offset: number } | null {
  if (typeof document.caretRangeFromPoint === "function") {
    const range = document.caretRangeFromPoint(clientX, clientY);
    if (range) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }
  const docAny = document as unknown as {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof docAny.caretPositionFromPoint === "function") {
    const pos = docAny.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      return { node: pos.offsetNode, offset: pos.offset };
    }
  }
  return null;
}

function extractWordRangeFromTextNode(
  textNode: Text,
  offset: number,
): { start: number; end: number; word: string } | null {
  const text = textNode.nodeValue ?? "";
  if (!text) return null;

  let probe = Math.max(0, Math.min(offset, text.length));
  if (probe > 0 && (probe === text.length || !WORD_CHAR_RE.test(text[probe]!))) {
    if (WORD_CHAR_RE.test(text[probe - 1]!)) {
      probe -= 1;
    }
  }
  if (probe >= text.length || !WORD_CHAR_RE.test(text[probe]!)) {
    return null;
  }

  let start = probe;
  while (start > 0 && WORD_CHAR_RE.test(text[start - 1]!)) {
    start -= 1;
  }
  let end = probe + 1;
  while (end < text.length && WORD_CHAR_RE.test(text[end]!)) {
    end += 1;
  }

  while (start < end && (text[start] === "'" || text[start] === "’" || text[start] === "-")) {
    start += 1;
  }
  while (end > start && (text[end - 1] === "'" || text[end - 1] === "’" || text[end - 1] === "-")) {
    end -= 1;
  }

  if (end <= start) return null;
  return { start, end, word: text.slice(start, end) };
}

function findTextNodeWordAtPoint(
  editableRoot: HTMLElement,
  clientX: number,
  clientY: number,
): { textNode: Text; start: number; end: number; word: string; range: Range } | null {
  const point = getCaretPoint(clientX, clientY);
  if (!point) return null;

  let textNode: Text | null = null;
  let offset = point.offset;

  if (point.node.nodeType === Node.TEXT_NODE) {
    textNode = point.node as Text;
  } else if (point.node.nodeType === Node.ELEMENT_NODE) {
    const el = point.node as Element;
    const after = el.childNodes[offset];
    const before = offset > 0 ? el.childNodes[offset - 1] : null;
    if (after?.nodeType === Node.TEXT_NODE) {
      textNode = after as Text;
      offset = 0;
    } else if (before?.nodeType === Node.TEXT_NODE) {
      textNode = before as Text;
      offset = (before.nodeValue ?? "").length;
    }
  }

  if (!textNode || !editableRoot.contains(textNode)) return null;
  const parentEl = textNode.parentElement;
  if (
    parentEl?.closest('[data-ghost="true"]') ||
    parentEl?.closest('[data-note-image-block="true"]')
  ) {
    return null;
  }

  const found = extractWordRangeFromTextNode(textNode, offset);
  if (!found) return null;

  const range = document.createRange();
  range.setStart(textNode, found.start);
  range.setEnd(textNode, found.end);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  // Guard against right-clicking empty margin beside a line hitting its trailing word
  if (
    clientX < rect.left - 12 ||
    clientX > rect.right + 12 ||
    clientY < rect.top - 8 ||
    clientY > rect.bottom + 8
  ) {
    return null;
  }

  return { textNode, start: found.start, end: found.end, word: found.word, range };
}

function findInputWordAtCaret(
  inputEl: HTMLInputElement | HTMLTextAreaElement,
): { start: number; end: number; word: string } | null {
  const value = inputEl.value;
  const selStart = inputEl.selectionStart ?? 0;
  const selEnd = inputEl.selectionEnd ?? selStart;
  if (!value) return null;

  if (selEnd > selStart) {
    const chunk = value.slice(selStart, selEnd).trim();
    if (chunk && !/\s/.test(chunk)) {
      return { start: selStart, end: selEnd, word: chunk };
    }
  }

  let probe = Math.max(0, Math.min(selStart, value.length));
  if (probe > 0 && (probe === value.length || !WORD_CHAR_RE.test(value[probe]!))) {
    if (WORD_CHAR_RE.test(value[probe - 1]!)) {
      probe -= 1;
    }
  }
  if (probe >= value.length || !WORD_CHAR_RE.test(value[probe]!)) return null;

  let start = probe;
  while (start > 0 && WORD_CHAR_RE.test(value[start - 1]!)) start -= 1;
  let end = probe + 1;
  while (end < value.length && WORD_CHAR_RE.test(value[end]!)) end += 1;

  while (start < end && (value[start] === "'" || value[start] === "’" || value[start] === "-")) {
    start += 1;
  }
  while (
    end > start &&
    (value[end - 1] === "'" || value[end - 1] === "’" || value[end - 1] === "-")
  ) {
    end -= 1;
  }
  if (end <= start) return null;
  return { start, end, word: value.slice(start, end) };
}

function applyContentEditableReplacement(
  editableRoot: HTMLElement,
  range: Range,
  text: string,
): void {
  editorHooksMap.get(editableRoot)?.onBeforeMutate?.();
  editableRoot.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const applied =
    typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
  if (applied) return;

  range.deleteContents();
  if (text) {
    const node = document.createTextNode(text);
    range.insertNode(node);
    if (sel) {
      const next = document.createRange();
      next.setStart(node, text.length);
      next.collapse(true);
      sel.removeAllRanges();
      sel.addRange(next);
    }
  }
  editableRoot.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: text ? "insertReplacementText" : "deleteContentBackward",
      data: text,
    }),
  );
}

function applyContentEditableHtml(editableRoot: HTMLElement, range: Range, html: string): void {
  const hooks = editorHooksMap.get(editableRoot);
  hooks?.onBeforeMutate?.();
  editableRoot.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const applied =
    typeof document.execCommand === "function" && document.execCommand("insertHTML", false, html);
  if (applied) {
    hooks?.onAfterPaste?.();
    return;
  }

  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const lastInserted = fragment.lastChild;
  range.insertNode(fragment);
  if (sel && lastInserted) {
    const next = document.createRange();
    next.setStartAfter(lastInserted);
    next.collapse(true);
    sel.removeAllRanges();
    sel.addRange(next);
  }
  editableRoot.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertFromPaste",
    }),
  );
  hooks?.onAfterPaste?.();
}

async function readClipboardPlainText(): Promise<string | null> {
  if (navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      // fall through to read() fallback
    }
  }
  if (navigator.clipboard?.read) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/plain")) {
          const blob = await item.getType("text/plain");
          return await blob.text();
        }
      }
      return "";
    } catch {
      return null;
    }
  }
  return null;
}

function resolveEditableFallbackRange(editableRoot: HTMLElement, savedRange: Range | null): Range {
  if (savedRange) return savedRange;
  const fallback = document.createRange();
  fallback.selectNodeContents(editableRoot);
  fallback.collapse(false);
  return fallback;
}

function applyInputReplacement(
  inputEl: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
): void {
  inputEl.focus({ preventScroll: true });
  inputEl.setRangeText(text, start, end, "end");
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
}

function isPointInsideRange(range: Range, clientX: number, clientY: number): boolean {
  const rects = Array.from(range.getClientRects());
  return rects.some(
    (r) =>
      clientX >= r.left - 8 &&
      clientX <= r.right + 8 &&
      clientY >= r.top - 6 &&
      clientY <= r.bottom + 6,
  );
}

export function findContextImageSrc(
  target: EventTarget | null,
  fallbackImageSrc?: string | null,
): string | null {
  const el = target instanceof Element ? target : null;
  if (el) {
    if (el.tagName === "IMG") {
      const img = el as HTMLImageElement;
      return img.currentSrc || img.src || fallbackImageSrc || null;
    }
    const imageBlock = el.closest('[data-note-image-block="true"]');
    const blockImg = imageBlock?.querySelector("img");
    if (blockImg) {
      return blockImg.currentSrc || blockImg.src || fallbackImageSrc || null;
    }
  }
  return fallbackImageSrc || null;
}

export function inspectAppContextTarget({
  clientX,
  clientY,
  target,
  fallbackImageSrc,
}: {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  fallbackImageSrc?: string | null | undefined;
}): ContextMenuTargetAnalysis {
  void preloadSpellChecker();

  const targetEl = target instanceof Element ? target : null;
  const imageSrc = findContextImageSrc(target, fallbackImageSrc);

  const inputEl =
    targetEl?.closest("input, textarea") instanceof HTMLInputElement ||
    targetEl?.closest("input, textarea") instanceof HTMLTextAreaElement
      ? (targetEl.closest("input, textarea") as HTMLInputElement | HTMLTextAreaElement)
      : null;

  const wrapperRoot = !inputEl
    ? ((targetEl?.closest('[data-note-scroll-wrapper="true"]') as HTMLElement | null) ??
      (targetEl?.closest('[data-editing-card="true"]') as HTMLElement | null))
    : null;

  const editableRoot = !inputEl
    ? ((targetEl?.closest('[contenteditable="true"]') as HTMLElement | null) ??
      (targetEl?.closest(".note-editor") as HTMLElement | null) ??
      (wrapperRoot?.querySelector('.note-editor[contenteditable="true"]') as HTMLElement | null))
    : null;

  const isEditable = Boolean(inputEl || editableRoot);

  // Inspect input/textarea
  if (inputEl) {
    const sStart = inputEl.selectionStart ?? 0;
    const sEnd = inputEl.selectionEnd ?? sStart;
    const selectedText = sEnd > sStart ? inputEl.value.slice(sStart, sEnd) : "";
    const caretWord = findInputWordAtCaret(inputEl);

    const wordMatch: SpellcheckTargetMatch | null = caretWord
      ? {
          word: caretWord.word,
          replaceWith: (replacement) =>
            applyInputReplacement(inputEl, caretWord.start, caretWord.end, replacement),
          addToDictionary: () => addWordToDictionary(caretWord.word),
          ignoreWord: () => ignoreWordInSession(caretWord.word),
        }
      : null;

    const pasteIntoInput = async (): Promise<boolean> => {
      if (!navigator.clipboard?.readText) return false;
      try {
        const clipText = await navigator.clipboard.readText();
        if (!clipText) return true;
        applyInputReplacement(inputEl, sStart, sEnd, clipText);
        return true;
      } catch {
        return false;
      }
    };

    return {
      imageSrc,
      isEditable: true,
      selectedText,
      hasSelection: Boolean(selectedText),
      wordMatch,
      cut: async () => {
        if (!selectedText) return;
        await copyTextToClipboard(selectedText);
        applyInputReplacement(inputEl, sStart, sEnd, "");
      },
      copy: async () => {
        if (!selectedText) return;
        await copyTextToClipboard(selectedText);
      },
      paste: pasteIntoInput,
      pastePlainText: pasteIntoInput,
      copyImage: async () => {
        if (imageSrc) await copyImageToClipboard(imageSrc);
      },
    };
  }

  // Inspect contentEditable or selectable note surface
  let savedRange: Range | null = null;
  let selectedText = "";
  let selectedPayload: ReturnType<typeof extractRangeClipboardPayload> | null = null;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const active = sel.getRangeAt(0);
    if (!editableRoot || editableRoot.contains(active.commonAncestorContainer)) {
      savedRange = active.cloneRange();
      if (!active.collapsed) {
        selectedPayload = extractRangeClipboardPayload(active, sel.toString());
        selectedText = selectedPayload.plain;
      }
    }
  }

  let wordMatch: SpellcheckTargetMatch | null = null;
  if (editableRoot && !imageSrc) {
    const clickedWord = findTextNodeWordAtPoint(editableRoot, clientX, clientY);
    if (clickedWord) {
      const keepExistingSelection =
        savedRange && !savedRange.collapsed && isPointInsideRange(savedRange, clientX, clientY);
      const spellCheck = checkWordSpelling(clickedWord.word);
      const isMisspelled = spellCheck ? !spellCheck.isCorrect : false;

      if (!keepExistingSelection && isMisspelled) {
        // Visually highlight misspelled word on right-click (matching Chrome/Obsidian UX)
        sel?.removeAllRanges();
        sel?.addRange(clickedWord.range);
        savedRange = clickedWord.range.cloneRange();
        selectedPayload = extractRangeClipboardPayload(savedRange, clickedWord.word);
        selectedText = selectedPayload.plain;
      } else if (!savedRange) {
        const point = getCaretPoint(clientX, clientY);
        if (point && editableRoot.contains(point.node)) {
          const fallbackRange = document.createRange();
          fallbackRange.setStart(point.node, point.offset);
          fallbackRange.collapse(true);
          savedRange = fallbackRange;
        }
      }

      const wordRange = clickedWord.range.cloneRange();
      wordMatch = {
        word: clickedWord.word,
        replaceWith: (replacement) => {
          applyContentEditableReplacement(editableRoot, wordRange, replacement);
        },
        addToDictionary: () => addWordToDictionary(clickedWord.word),
        ignoreWord: () => ignoreWordInSession(clickedWord.word),
      };
    } else if (!savedRange) {
      const point = getCaretPoint(clientX, clientY);
      if (point && editableRoot.contains(point.node)) {
        const fallbackRange = document.createRange();
        fallbackRange.setStart(point.node, point.offset);
        fallbackRange.collapse(true);
        savedRange = fallbackRange;
      }
    }
  }

  const hasSelection = Boolean(selectedPayload?.hasContent);

  return {
    imageSrc,
    isEditable,
    selectedText,
    hasSelection,
    wordMatch,
    cut: async () => {
      if (!editableRoot || !savedRange || savedRange.collapsed || !selectedPayload?.hasContent) {
        return;
      }
      await copyRichContentToClipboard(selectedPayload.html, selectedPayload.plain);
      const hooks = editorHooksMap.get(editableRoot);
      if (hooks?.onCutRange) {
        hooks.onCutRange(savedRange);
      } else {
        applyContentEditableReplacement(editableRoot, savedRange, "");
      }
    },
    copy: async () => {
      if (!selectedPayload?.hasContent) return;
      await copyRichContentToClipboard(selectedPayload.html, selectedPayload.plain);
    },
    paste: async () => {
      if (!editableRoot) return false;
      const hooks = editorHooksMap.get(editableRoot);
      const targetRange = resolveEditableFallbackRange(editableRoot, savedRange);

      if (navigator.clipboard?.read) {
        try {
          const items = await navigator.clipboard.read();
          let cachedHtml: string | null = null;
          if (hooks?.onTryPasteVaultHtml) {
            for (const item of items) {
              if (item.types.includes("text/html")) {
                const rawHtml = await item.getType("text/html").then((blob) => blob.text());
                cachedHtml = rawHtml;
                editableRoot.focus({ preventScroll: true });
                if (sel) {
                  sel.removeAllRanges();
                  sel.addRange(targetRange);
                }
                if (await hooks.onTryPasteVaultHtml(rawHtml)) {
                  return true;
                }
              }
            }
          }

          for (const item of items) {
            const imgType = item.types.find((t) => t.startsWith("image/"));
            if (imgType && hooks?.onPasteImage) {
              const blob = await item.getType(imgType);
              const ext = imgType.split("/")[1] || "png";
              const file = new File([blob], `pasted-image.${ext}`, { type: imgType });
              editableRoot.focus({ preventScroll: true });
              if (sel) {
                sel.removeAllRanges();
                sel.addRange(targetRange);
              }
              await hooks.onPasteImage(file);
              return true;
            }
          }

          if (cachedHtml) {
            const cleanHtml = sanitizeClipboardHtml(cachedHtml);
            if (cleanHtml) {
              applyContentEditableHtml(editableRoot, targetRange, cleanHtml);
              return true;
            }
          } else {
            for (const item of items) {
              if (item.types.includes("text/html")) {
                const rawHtml = await item.getType("text/html").then((blob) => blob.text());
                const cleanHtml = sanitizeClipboardHtml(rawHtml);
                if (cleanHtml) {
                  applyContentEditableHtml(editableRoot, targetRange, cleanHtml);
                  return true;
                }
              }
            }
          }

          for (const item of items) {
            if (item.types.includes("text/plain")) {
              const clipText = await item.getType("text/plain").then((blob) => blob.text());
              if (clipText) {
                applyContentEditableReplacement(editableRoot, targetRange, clipText);
                hooks?.onAfterPaste?.();
              }
              return true;
            }
          }
        } catch {
          // Fall through to plain-text clipboard read if read() is restricted
        }
      }

      const clipText = await readClipboardPlainText();
      if (clipText === null) return false;
      if (clipText) {
        applyContentEditableReplacement(editableRoot, targetRange, clipText);
        hooks?.onAfterPaste?.();
      }
      return true;
    },
    pastePlainText: async () => {
      if (!editableRoot) return false;
      const hooks = editorHooksMap.get(editableRoot);
      const targetRange = resolveEditableFallbackRange(editableRoot, savedRange);
      const clipText = await readClipboardPlainText();
      if (clipText === null) return false;
      if (clipText) {
        applyContentEditableReplacement(editableRoot, targetRange, clipText);
        hooks?.onAfterPaste?.();
      }
      return true;
    },
    copyImage: async () => {
      if (imageSrc) await copyImageToClipboard(imageSrc);
    },
  };
}
