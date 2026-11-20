export const BLOCK_TAG_SET = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "li",
  "pre",
]);

export const HEADING_TAG_SET = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

export const INLINE_MARK_TAGS = new Set([
  "code",
  "mark",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "del",
  "strike",
  "a",
]);

export const INLINE_WRAPPER_TAGS = new Set([
  "a",
  "b",
  "code",
  "del",
  "em",
  "i",
  "mark",
  "s",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "u",
]);

export const NOTE_IMAGE_BLOCK_ATTR = "data-note-image-block";
export const NOTE_IMAGE_ALIGN_ATTR = "data-align";
export const NOTE_IMAGE_TAIL_ATTR = "data-image-tail";
export const NOTE_IMAGE_MAX_WIDTH = 288;
export const NOTE_IMAGE_MAX_HEIGHT = 220;

const STRONG_RTL_CHAR_RE =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
const STRONG_LTR_CHAR_RE =
  /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * Inspects text using the Unicode BiDi first-strong character rule (UAX #9 / HTML `dir="auto"`)
 * and returns `"rtl"` when the first strong directional character is RTL, `"ltr"` when LTR,
 * or `null` when the string contains no strong directional characters.
 */
export function detectTextBlockDirection(text: string): "ltr" | "rtl" | null {
  for (const ch of text) {
    if (STRONG_RTL_CHAR_RE.test(ch)) return "rtl";
    if (STRONG_LTR_CHAR_RE.test(ch)) return "ltr";
  }
  return null;
}
export const MD_SYNTAX_ATTR = "data-md-syntax";
export const MD_ACTIVE_ATTR = "data-md-active";
export const MD_URL_ATTR = "data-md-url";
export const MD_BULLET_ATTR = "data-md-bullet";
export const MD_DELIM_ATTR = "data-md-delim";
export const MD_HR_SYNTAX_ATTR = "data-md-hr";
export const MD_HR_ACTIVE_ATTR = "data-md-hr-active";
export const HR_LINE_REGEX = /^(?:-{3,}|\*{3,}|_{3,})$/;

export interface CaretBookmark {
  path: number[];
  offset: number;
}

export function sanitizeHttpUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // invalid url
  }
  return null;
}

function isMarkdownSyntaxNode(node: Node | null): boolean {
  return (
    Boolean(node) &&
    node!.nodeType === Node.ELEMENT_NODE &&
    (node as HTMLElement).hasAttribute(MD_SYNTAX_ATTR)
  );
}

export function isInsideMarkdownSyntax(
  node: Node | null,
  stopAt?: HTMLElement,
): HTMLElement | null {
  let curr: Node | null = node;
  while (curr && curr !== stopAt) {
    if (curr.nodeType === Node.ELEMENT_NODE && (curr as HTMLElement).hasAttribute(MD_SYNTAX_ATTR)) {
      return curr as HTMLElement;
    }
    curr = curr.parentNode;
  }
  return null;
}

export function isInsideTag(
  node: Node | null,
  root: HTMLElement,
  tags: readonly string[],
): HTMLElement | null {
  let curr: Node | null = node;
  while (curr && curr !== root) {
    if (curr.nodeType === Node.ELEMENT_NODE) {
      const el = curr as HTMLElement;
      if (tags.includes(el.tagName.toLowerCase())) {
        return el;
      }
    }
    curr = curr.parentNode;
  }
  return null;
}

export function getClosestBlock(node: Node | null, root: HTMLElement): HTMLElement | null {
  let curr: Node | null = node;
  while (curr && curr !== root) {
    if (curr.nodeType === Node.ELEMENT_NODE) {
      const el = curr as HTMLElement;
      if (BLOCK_TAG_SET.has(el.tagName.toLowerCase())) {
        return el;
      }
    }
    curr = curr.parentNode;
  }
  return null;
}

export function stripZeroWidth(text: string): string {
  return text.replace(/\u200B/g, "");
}

export function getTextWithoutArtifacts(node: Node): string {
  const clone = node.cloneNode(true) as HTMLElement | DocumentFragment;
  if ("querySelectorAll" in clone) {
    clone
      .querySelectorAll(`[data-task-checkbox], [${MD_SYNTAX_ATTR}]`)
      .forEach((el) => el.remove());
  }
  return stripZeroWidth((clone.textContent || "").replace(/\u00A0/g, " "));
}

export function hasVisibleContent(el: HTMLElement): boolean {
  if (el.querySelector("img, hr, pre, ul, ol")) return true;
  return getTextWithoutArtifacts(el).trim().length > 0;
}

export function hasVisibleFragmentContent(frag: DocumentFragment): boolean {
  if (frag.querySelector("img, hr, pre, ul, ol")) return true;
  return getTextWithoutArtifacts(frag).trim().length > 0;
}

export function getTaskContentSpan(li: HTMLElement): HTMLElement | null {
  return li.querySelector(":scope > span[data-task-content]");
}

export function ensureElementHasBreakIfEmpty(el: HTMLElement): void {
  const hasImg = Boolean(el.querySelector("img"));
  const hasText = getTextWithoutArtifacts(el).length > 0;
  if (!hasImg && !hasText && !el.querySelector("br")) {
    el.appendChild(document.createElement("br"));
  }
}

export function cleanTrailingEmptyNodes(el: HTMLElement): void {
  const children = Array.from(el.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE && stripZeroWidth(child.nodeValue || "") === "") {
      child.remove();
    }
  }
}

export function normalizeEmptyBreak(el: HTMLElement): void {
  cleanTrailingEmptyNodes(el);
  ensureElementHasBreakIfEmpty(el);
}

export function getTopLevelBlock(node: Node | null, root: HTMLElement): HTMLElement | null {
  let curr: Node | null = node;
  while (curr && curr.parentNode !== root) {
    curr = curr.parentNode;
  }
  if (curr && curr.parentNode === root && curr.nodeType === Node.ELEMENT_NODE) {
    return curr as HTMLElement;
  }
  return null;
}

function isIgnorableBoundaryNode(node: Node, direction: "prev" | "next"): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return stripZeroWidth((node.nodeValue || "").replace(/\u00A0/g, " ")).trim().length === 0;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return true;
  const el = node as HTMLElement;
  if (el.hasAttribute(MD_SYNTAX_ATTR) || el.hasAttribute("data-task-checkbox")) {
    return true;
  }
  // A sole trailing sentinel `<br>` at the end of an inline container carries no content after `curr`.
  if (direction === "next" && el.tagName === "BR" && el.nextSibling === null) {
    return true;
  }
  return false;
}

/**
 * Walks upward from `block` to its top-level direct child under `editor`, returning the
 * adjacent top-level sibling in `direction` only if no sibling text or elements sit
 * between `block` and that top-level boundary.
 */
export function getTopLevelBoundarySibling(
  editor: HTMLElement,
  block: HTMLElement,
  direction: "prev" | "next",
): HTMLElement | null {
  let curr: HTMLElement | null = block;
  while (curr && curr.parentElement && curr.parentElement !== editor) {
    let sib = direction === "prev" ? curr.previousSibling : curr.nextSibling;
    while (sib) {
      if (!isIgnorableBoundaryNode(sib, direction)) {
        return null;
      }
      sib = direction === "prev" ? sib.previousSibling : sib.nextSibling;
    }
    curr = curr.parentElement;
  }
  if (!curr || curr.parentElement !== editor) return null;
  return (
    direction === "prev" ? curr.previousElementSibling : curr.nextElementSibling
  ) as HTMLElement | null;
}

/**
 * Unwraps `<p>` / `<div>` wrappers inside `<li>` into canonical tight-list inline nodes
 * separated by `<br>` soft breaks so list editing, Backspace, Tab, and Live Preview stay consistent.
 */
export function unwrapParagraphsInListItems(container: HTMLElement): void {
  const isUnwrappableWrapper = (node: Node): node is HTMLElement => {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag !== "p" && tag !== "div") return false;
    if (el.hasAttribute(NOTE_IMAGE_BLOCK_ATTR)) return false;
    if (el.querySelector("ul, ol, pre, blockquote, hr, table")) return false;
    return true;
  };

  const isSignificantInline = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      return stripZeroWidth((node.nodeValue || "").replace(/\u00A0/g, " ")).trim().length > 0;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    if (el.hasAttribute("data-task-checkbox") || el.hasAttribute(MD_SYNTAX_ATTR)) return false;
    const tag = el.tagName.toLowerCase();
    return tag !== "ul" && tag !== "ol";
  };

  for (const li of Array.from(container.querySelectorAll("li"))) {
    if (li.closest("pre")) continue;
    const scope = (li.hasAttribute("data-task") ? getTaskContentSpan(li) : null) || li;
    if (!Array.from(scope.childNodes).some(isUnwrappableWrapper)) continue;

    const frag = document.createDocumentFragment();
    let hasPrevInlineLine = false;

    for (const child of Array.from(scope.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (
          tag === "ul" ||
          tag === "ol" ||
          el.hasAttribute("data-task-checkbox") ||
          el.hasAttribute(MD_SYNTAX_ATTR)
        ) {
          frag.appendChild(child);
          hasPrevInlineLine = false;
          continue;
        }
      }

      if (isUnwrappableWrapper(child)) {
        if (hasPrevInlineLine) {
          frag.appendChild(document.createElement("br"));
        }
        const onlyEmptySentinel =
          !child.querySelector("img") && getTextWithoutArtifacts(child).trim().length === 0;
        if (!onlyEmptySentinel) {
          while (child.firstChild) {
            frag.appendChild(child.firstChild);
          }
        }
        child.remove();
        hasPrevInlineLine = true;
        continue;
      }

      frag.appendChild(child);
      if (isSignificantInline(child)) {
        hasPrevInlineLine = true;
      }
    }

    scope.appendChild(frag);
    if (!hasOwnInlineContent(li as HTMLElement)) {
      normalizeEmptyBreak(scope as HTMLElement);
    }
  }
}

export function getEditableScope(block: HTMLElement): HTMLElement {
  const tag = block.tagName.toLowerCase();
  if (tag === "li" && block.hasAttribute("data-task")) {
    return getTaskContentSpan(block) || block;
  }
  if (tag === "pre") {
    return (block.querySelector(":scope > code") as HTMLElement | null) || block;
  }
  return block;
}

export function resolveFocusTarget(el: HTMLElement, edge: "start" | "end"): HTMLElement {
  let curr: HTMLElement = el;
  while (curr.tagName.toLowerCase() === "ul" || curr.tagName.toLowerCase() === "ol") {
    const items = Array.from(curr.children).filter(
      (c): c is HTMLElement => c.tagName.toLowerCase() === "li",
    );
    const chosen = edge === "start" ? items[0] : items[items.length - 1];
    if (!chosen) break;
    curr = chosen;
    if (edge === "end") {
      const nestedLists = Array.from(curr.children).filter((c) => {
        const t = c.tagName.toLowerCase();
        return t === "ul" || t === "ol";
      }) as HTMLElement[];
      const lastNested = nestedLists[nestedLists.length - 1];
      if (lastNested) {
        curr = lastNested;
        continue;
      }
    }
    break;
  }
  return getEditableScope(curr);
}

export function isStandaloneHrBlock(el: HTMLElement): string | null {
  const tag = el.tagName.toLowerCase();
  if (tag !== "p" && tag !== "div") return null;
  if (el.hasAttribute(NOTE_IMAGE_BLOCK_ATTR)) return null;
  if (el.querySelector("img, ul, ol, pre, blockquote, hr")) return null;
  const brs = Array.from(el.querySelectorAll("br"));
  if (brs.some((br) => br.parentNode !== el || br.nextSibling !== null)) return null;
  const cleanText = getTextWithoutArtifacts(el).trim();
  return HR_LINE_REGEX.test(cleanText) ? cleanText : null;
}

export function getLiOwnChildLimit(li: HTMLElement): number | undefined {
  const firstNested = li.querySelector(":scope > ul, :scope > ol");
  if (!firstNested) return undefined;
  const idx = Array.prototype.indexOf.call(li.childNodes, firstNested);
  return idx >= 0 ? idx : undefined;
}

export function hasOwnInlineContent(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  const limit = tag === "li" && !el.hasAttribute("data-task") ? getLiOwnChildLimit(el) : undefined;
  if (limit === undefined) {
    return hasVisibleContent(getEditableScope(el));
  }
  for (let i = 0; i < limit; i += 1) {
    const child = el.childNodes[i];
    if (!child) continue;
    if (child.nodeType === Node.TEXT_NODE) {
      if (stripZeroWidth((child.nodeValue || "").replace(/\u00A0/g, " ")).trim().length > 0) {
        return true;
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const ce = child as HTMLElement;
      if (ce.hasAttribute(MD_SYNTAX_ATTR) || ce.hasAttribute("data-task-checkbox")) {
        continue;
      }
      if (ce.tagName === "IMG" || hasVisibleContent(ce)) return true;
    }
  }
  return false;
}

export function getLastDescendantTextNode(el: Node): Text | null {
  for (let i = el.childNodes.length - 1; i >= 0; i -= 1) {
    const child = el.childNodes[i];
    if (!child) continue;
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child as HTMLElement;
      if (childEl.hasAttribute("data-task-checkbox") || childEl.hasAttribute(MD_SYNTAX_ATTR)) {
        continue;
      }
      const nested = getLastDescendantTextNode(childEl);
      if (nested) return nested;
    } else if (child.nodeType === Node.TEXT_NODE) {
      return child as Text;
    }
  }
  return null;
}

export function getFirstEditableTarget(el: HTMLElement): { node: Node; offset: number } {
  const target = el.hasAttribute("data-task") ? getTaskContentSpan(el) || el : el;
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let curr: Node | null = walker.nextNode();
  while (curr) {
    if (curr.nodeType === Node.TEXT_NODE) {
      const parentEl = curr.parentElement;
      if (!parentEl?.closest(`[data-task-checkbox], [${MD_SYNTAX_ATTR}]`)) {
        return { node: curr, offset: 0 };
      }
    } else if (curr.nodeType === Node.ELEMENT_NODE) {
      const ce = curr as HTMLElement;
      if (ce.tagName === "BR") {
        const parent = ce.parentNode || target;
        const idx = Array.prototype.indexOf.call(parent.childNodes, ce);
        return { node: parent, offset: Math.max(0, idx) };
      }
    }
    curr = walker.nextNode();
  }
  return { node: target, offset: 0 };
}

export function placeCaret(node: Node, offset: number): void {
  try {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    const maxOffset =
      node.nodeType === Node.TEXT_NODE ? (node.nodeValue?.length ?? 0) : node.childNodes.length;
    range.setStart(node, Math.max(0, Math.min(offset, maxOffset)));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // ignore invalid selection range
  }
}

export function placeCaretAtStart(el: HTMLElement): void {
  const { node, offset } = getFirstEditableTarget(el);
  placeCaret(node, offset);
}

export function placeCaretAtEnd(el: HTMLElement): void {
  const target = el.hasAttribute("data-task") ? getTaskContentSpan(el) || el : el;
  const lastText = getLastDescendantTextNode(target);
  if (lastText) {
    placeCaret(lastText, lastText.nodeValue?.length ?? 0);
    return;
  }
  placeCaret(target, 0);
}

export function isEmptyTextBlockElement(node: Element | null): node is HTMLElement {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as HTMLElement;
  if (el.hasAttribute(NOTE_IMAGE_BLOCK_ATTR)) return false;
  const tag = el.tagName.toLowerCase();
  return (
    (tag === "p" || tag === "div" || tag === "blockquote" || HEADING_TAG_SET.has(tag)) &&
    !hasVisibleContent(el)
  );
}

export function isCaretAtStartOfScope(scope: HTMLElement, range: Range): boolean {
  if (range.startContainer !== scope && !scope.contains(range.startContainer)) {
    return false;
  }
  const before = document.createRange();
  before.setStart(scope, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const frag = before.cloneContents();
  frag.querySelectorAll("[data-task-checkbox]").forEach((el) => el.remove());
  const text = (frag.textContent || "").replace(/\u00A0/g, " ").replace(/\u200B/g, "");
  if (text.length > 0) return false;
  if (frag.querySelector("img, br")) return false;
  return true;
}

/**
 * Checks if caret is at the very first editable offset of a block, including any
 * active `[data-md-syntax]` prefix span before `<span data-task-content>` on task items.
 */
export function isCaretAtBlockBoundaryStart(block: HTMLElement, range: Range): boolean {
  const tag = block.tagName.toLowerCase();
  const firstSyntax = block.querySelector(
    tag === "pre" ? `:scope > [${MD_SYNTAX_ATTR}="code-open"]` : `:scope > [${MD_SYNTAX_ATTR}]`,
  ) as HTMLElement | null;
  if (firstSyntax) {
    return isCaretAtStartOfScope(firstSyntax, range);
  }
  return isCaretAtStartOfScope(getEditableScope(block), range);
}

export function isCaretAtEndOfScope(scope: HTMLElement, range: Range): boolean {
  if (!hasVisibleContent(scope)) return true;
  const after = document.createRange();
  after.setStart(range.endContainer, range.endOffset);
  after.setEnd(scope, scope.childNodes.length);
  const frag = after.cloneContents();
  if (frag.querySelector("img")) return false;
  return getTextWithoutArtifacts(frag).length === 0;
}

function getCaretVisualRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  for (const r of Array.from(rects)) {
    if (r.height > 0) return r;
  }
  const rect = range.getBoundingClientRect();
  return rect.height > 0 ? rect : null;
}

export function isCaretOnVisualEdgeLine(
  scope: HTMLElement,
  range: Range,
  edge: "first" | "last",
): boolean {
  if (!hasVisibleContent(scope)) return true;

  const currentRect = getCaretVisualRect(range);
  if (!currentRect) {
    return edge === "first"
      ? isCaretAtStartOfScope(scope, range)
      : isCaretAtEndOfScope(scope, range);
  }

  const probeRange = document.createRange();
  if (edge === "first") {
    const first = getFirstEditableTarget(scope);
    probeRange.setStart(first.node, first.offset);
  } else {
    const lastText = getLastDescendantTextNode(scope);
    if (lastText) {
      probeRange.setStart(lastText, lastText.nodeValue?.length ?? 0);
    } else {
      probeRange.setStart(scope, scope.childNodes.length);
    }
  }
  probeRange.collapse(true);
  const edgeRect = getCaretVisualRect(probeRange);
  if (!edgeRect) {
    return edge === "first"
      ? isCaretAtStartOfScope(scope, range)
      : isCaretAtEndOfScope(scope, range);
  }
  return Math.abs(currentRect.top - edgeRect.top) < 4;
}

export function getCollapsedSelectionRange(editor: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed || !editor.contains(range.startContainer)) return null;
  return range;
}

/**
 * Serializes a bookmark relative to persistent DOM nodes, skipping transient
 * `[data-md-syntax]` nodes so bookmarks align with `serializeContainerMediaHtml` during undo/redo.
 */
export function getCaretBookmark(root: HTMLElement): CaretBookmark | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  let curr: Node | null = range.startContainer;
  let offset = range.startOffset;

  const syntaxEl = isInsideMarkdownSyntax(curr, root);
  if (syntaxEl && syntaxEl.parentNode) {
    const parent = syntaxEl.parentNode as HTMLElement;
    const kind = syntaxEl.getAttribute(MD_SYNTAX_ATTR);
    if (kind === "code-close" && parent.tagName.toLowerCase() === "pre") {
      const codeEl = getEditableScope(parent);
      const lastText = getLastDescendantTextNode(codeEl);
      if (lastText) {
        curr = lastText;
        offset = lastText.nodeValue?.length ?? 0;
      } else {
        curr = codeEl;
        offset = codeEl.childNodes.length;
      }
    } else {
      const target = getFirstEditableTarget(parent);
      curr = target.node;
      offset = target.offset;
    }
  }

  const path: number[] = [];
  while (curr && curr !== root) {
    const parent: ParentNode | null = curr.parentNode;
    if (!parent) return null;
    let logicalIdx = 0;
    let found = false;
    for (const child of Array.from(parent.childNodes)) {
      if (child === curr) {
        found = true;
        break;
      }
      if (!isMarkdownSyntaxNode(child)) {
        logicalIdx += 1;
      }
    }
    if (!found) return null;
    path.unshift(logicalIdx);
    curr = parent;
  }
  return { path, offset };
}

export function restoreCaretBookmark(root: HTMLElement, bookmark: CaretBookmark | null): boolean {
  if (!bookmark) return false;
  let curr: Node = root;
  for (const idx of bookmark.path) {
    const next = curr.childNodes[idx];
    if (!next) {
      placeCaret(curr, Math.min(idx, curr.childNodes.length));
      return true;
    }
    curr = next;
  }
  placeCaret(curr, bookmark.offset);
  return true;
}

export function normalizeEmptyEditorOnMount(editor: HTMLElement): void {
  if (editor.querySelector("img, hr, pre, ul, ol")) return;
  const text = (editor.textContent || "")
    .replace(/\u00A0/g, "")
    .replace(/\u200B/g, "")
    .trim();
  if (!text) {
    editor.innerHTML = "";
  }
}

/**
 * Strips all transient Live Preview DOM artifacts (`data-md-syntax`, `data-md-active`,
 * empty inline pairs) from a cloned or exported container without affecting content.
 */
export function stripLiveSyntaxArtifacts(container: HTMLElement): void {
  container.querySelectorAll(`[${MD_HR_ACTIVE_ATTR}]`).forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (isStandaloneHrBlock(htmlEl)) {
      htmlEl.replaceWith(document.createElement("hr"));
    } else {
      htmlEl.removeAttribute(MD_HR_ACTIVE_ATTR);
    }
  });
  container.querySelectorAll(`hr[${MD_HR_SYNTAX_ATTR}]`).forEach((hr) => {
    hr.removeAttribute(MD_HR_SYNTAX_ATTR);
  });
  container.querySelectorAll(`[${MD_SYNTAX_ATTR}]`).forEach((el) => el.remove());
  container.querySelectorAll(`[${MD_ACTIVE_ATTR}]`).forEach((el) => {
    el.removeAttribute(MD_ACTIVE_ATTR);
  });
  container.querySelectorAll(`[${MD_URL_ATTR}]`).forEach((el) => {
    el.removeAttribute(MD_URL_ATTR);
  });

  // Unwrap or remove inline marks that contain no real visible text (e.g. empty auto-pair shells).
  const inlineCandidates = Array.from(
    container.querySelectorAll("code, mark, strong, b, em, i, s, del, strike, a"),
  );
  for (const el of inlineCandidates) {
    if ((el as HTMLElement).closest("pre")) continue;
    const text = (el.textContent || "").replace(/\u200B/g, "");
    if (text.length === 0 && !el.querySelector("img, br")) {
      el.remove();
    }
  }
}

const SAFE_CLIPBOARD_BLOCK_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "div",
  "blockquote",
  "pre",
  "ul",
  "ol",
  "li",
  "hr",
  "br",
]);

const SAFE_CLIPBOARD_INLINE_TAGS = new Set([
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "strike",
  "code",
  "mark",
  "sub",
  "sup",
]);

function unwrapElement(el: HTMLElement): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  el.remove();
}

function isSafeStoredMediaSrc(rawSrc: string): boolean {
  const trimmed = rawSrc.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("media://") || trimmed.startsWith("blob:")) return true;
  if (trimmed.startsWith("/api/") && !trimmed.startsWith("//")) return true;
  if (/^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);base64,/i.test(trimmed)) return true;
  return sanitizeHttpUrl(trimmed) !== null;
}

export interface ClipboardRangePayload {
  html: string;
  plain: string;
  hasContent: boolean;
}

/**
 * Serializes a selected note range (text, rich formatting, and inline/vault images)
 * into clean `text/html` + `text/plain` clipboard strings.
 */
export function extractRangeClipboardPayload(
  range: Range,
  selectionPlainText?: string,
): ClipboardRangePayload {
  const div = document.createElement("div");
  div.appendChild(range.cloneContents());
  stripLiveSyntaxArtifacts(div);
  stripChromiumInlineArtifacts(div, false);
  div.querySelectorAll("img.is-selected, img.is-range-selected").forEach((img) => {
    img.classList.remove("is-selected", "is-range-selected");
  });
  div.querySelectorAll("br[data-code-eol]").forEach((br) => br.remove());
  div.querySelectorAll(`[${NOTE_IMAGE_BLOCK_ATTR}]`).forEach((el) => {
    el.removeAttribute("contenteditable");
  });
  div.querySelectorAll(`p[${NOTE_IMAGE_TAIL_ATTR}="true"]`).forEach((p) => {
    const text = (p.textContent || "")
      .replace(/\u00A0/g, "")
      .replace(/\u200B/g, "")
      .trim();
    if (!text && !p.querySelector("img, hr, pre, ul, ol")) {
      p.remove();
    } else {
      p.removeAttribute(NOTE_IMAGE_TAIL_ATTR);
    }
  });

  div.querySelectorAll("img").forEach((img) => {
    const rawUri = img.getAttribute("data-media-uri") || "";
    const attrSrc = img.getAttribute("src") || "";
    if (rawUri.startsWith("/api/") && typeof window !== "undefined") {
      img.setAttribute("src", `${window.location.origin}${rawUri}`);
    } else if (attrSrc.startsWith("/api/") && typeof window !== "undefined") {
      img.setAttribute("data-media-uri", attrSrc);
      img.setAttribute("src", `${window.location.origin}${attrSrc}`);
    }
  });

  const html = div.innerHTML.replace(/\u200B/g, "");
  const cleanSelectionText = selectionPlainText ? selectionPlainText.replace(/\u200B/g, "") : "";
  const fallbackPlain = Array.from(div.childNodes)
    .map((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return ((node as HTMLElement).textContent ?? "").replace(/\u200B/g, "");
      }
      return (node.nodeValue ?? "").replace(/\u200B/g, "");
    })
    .filter((part, idx, arr) => part.length > 0 || (idx > 0 && idx < arr.length - 1))
    .join("\n");
  const plain = cleanSelectionText || fallbackPlain;
  const hasContent = plain.trim().length > 0 || Boolean(div.querySelector("img, hr"));
  return { html, plain, hasContent };
}

/**
 * Sanitizes copied HTML into clean semantic note markup, preserving structural and
 * inline formatting while stripping inline styles, classes, scripts, and unsafe links.
 */
export function sanitizeClipboardHtml(rawHtml: string): string {
  const startMarker = "<!--StartFragment-->";
  const endMarker = "<!--EndFragment-->";
  const startIdx = rawHtml.indexOf(startMarker);
  const endIdx = rawHtml.indexOf(endMarker);
  const slice =
    startIdx !== -1 && endIdx > startIdx
      ? rawHtml.slice(startIdx + startMarker.length, endIdx)
      : rawHtml;

  const doc = new DOMParser().parseFromString(slice, "text/html");
  doc.body
    .querySelectorAll("script, style, noscript, iframe, object, embed, meta, link, title, svg")
    .forEach((node) => node.remove());

  const sanitizeChildren = (parent: HTMLElement): void => {
    const children = Array.from(parent.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      sanitizeChildren(el);

      if (tag === "input") {
        if (el.getAttribute("type")?.toLowerCase() === "checkbox") {
          const checked = el.hasAttribute("checked");
          for (const attr of Array.from(el.attributes)) {
            el.removeAttribute(attr.name);
          }
          el.setAttribute("type", "checkbox");
          el.setAttribute("data-task-checkbox", "true");
          el.setAttribute("contenteditable", "false");
          if (checked) el.setAttribute("checked", "");
        } else {
          el.remove();
        }
        continue;
      }

      if (tag === "img") {
        const rawUri = (el.getAttribute("data-media-uri") || "").trim();
        const rawSrc = (el.getAttribute("src") || rawUri).trim();
        const chosenSrc = isSafeStoredMediaSrc(rawSrc)
          ? rawSrc
          : isSafeStoredMediaSrc(rawUri)
            ? rawUri
            : "";
        if (!chosenSrc) {
          el.remove();
          continue;
        }
        const alt = el.getAttribute("alt") || "";
        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }
        el.setAttribute("src", chosenSrc);
        if (rawUri && (rawUri.startsWith("/api/") || rawUri.startsWith("media://"))) {
          el.setAttribute("data-media-uri", rawUri);
        }
        if (alt) el.setAttribute("alt", alt);
        continue;
      }

      if (tag === "a") {
        const safeHref = sanitizeHttpUrl(el.getAttribute("href") || "");
        if (!safeHref) {
          unwrapElement(el);
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }
        el.setAttribute("href", safeHref);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
        continue;
      }

      if (SAFE_CLIPBOARD_BLOCK_TAGS.has(tag) || SAFE_CLIPBOARD_INLINE_TAGS.has(tag)) {
        const isImgBlock = tag === "div" && el.hasAttribute(NOTE_IMAGE_BLOCK_ATTR);
        const imgAlign = isImgBlock ? el.getAttribute(NOTE_IMAGE_ALIGN_ATTR) : null;
        const imgDir = isImgBlock ? el.getAttribute("dir") : null;
        const keepTaskList = tag === "ul" && el.hasAttribute("data-task-list");
        const isTaskItem =
          tag === "li" && (el.hasAttribute("data-task") || el.hasAttribute("data-task-item"));
        const taskChecked =
          isTaskItem &&
          (el.getAttribute("data-checked") === "true" ||
            Boolean(el.querySelector(':scope > input[type="checkbox"][checked]')));
        const bulletMarker = tag === "li" ? el.getAttribute(MD_BULLET_ATTR) : null;
        const delimMarker = tag === "li" ? el.getAttribute(MD_DELIM_ATTR) : null;
        const olStart = tag === "ol" ? el.getAttribute("start") : null;
        const codeLang = tag === "code" ? el.getAttribute("data-lang") : null;
        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }
        if (isImgBlock) {
          el.setAttribute(NOTE_IMAGE_BLOCK_ATTR, "true");
          if (imgAlign && ["left", "right", "center"].includes(imgAlign)) {
            el.setAttribute(NOTE_IMAGE_ALIGN_ATTR, imgAlign);
          }
          if (imgDir && ["ltr", "rtl"].includes(imgDir)) {
            el.setAttribute("dir", imgDir);
          }
        }
        if (keepTaskList) el.setAttribute("data-task-list", "true");
        if (isTaskItem) {
          el.setAttribute("data-task", "true");
          el.setAttribute("data-checked", String(taskChecked));
        }
        if (bulletMarker && ["-", "*", "+"].includes(bulletMarker)) {
          el.setAttribute(MD_BULLET_ATTR, bulletMarker);
        }
        if (delimMarker && [".", ")"].includes(delimMarker)) {
          el.setAttribute(MD_DELIM_ATTR, delimMarker);
        }
        if (olStart && /^\d+$/.test(olStart)) {
          el.setAttribute("start", olStart);
        }
        if (codeLang) el.setAttribute("data-lang", codeLang);
        continue;
      }

      if (tag === "span" && el.hasAttribute("data-task-content")) {
        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }
        el.setAttribute("data-task-content", "true");
        continue;
      }

      // Preserve bold/italic intent from styled <span> / <font> wrappers before unwrapping
      if (tag === "span" || tag === "font") {
        const weight = el.style.fontWeight?.trim().toLowerCase() || "";
        const weightNum = Number.parseInt(weight, 10);
        const isBold =
          weight === "bold" ||
          weight === "bolder" ||
          (!Number.isNaN(weightNum) && weightNum >= 600);
        const isItalic = el.style.fontStyle?.trim().toLowerCase() === "italic";
        const isStrike =
          el.style.textDecorationLine?.includes("line-through") ||
          el.style.textDecoration?.includes("line-through");

        if (isBold || isItalic || isStrike) {
          let inner: HTMLElement = el;
          if (isStrike) {
            const s = doc.createElement("s");
            while (inner.firstChild) s.appendChild(inner.firstChild);
            inner.appendChild(s);
            inner = s;
          }
          if (isItalic) {
            const em = doc.createElement("em");
            while (inner.firstChild) em.appendChild(inner.firstChild);
            inner.appendChild(em);
            inner = em;
          }
          if (isBold) {
            const strong = doc.createElement("strong");
            while (inner.firstChild) strong.appendChild(inner.firstChild);
            inner.appendChild(strong);
          }
        }
      }

      unwrapElement(el);
    }
  };

  sanitizeChildren(doc.body);
  unwrapParagraphsInListItems(doc.body);
  stripLiveSyntaxArtifacts(doc.body);
  return doc.body.innerHTML.trim();
}

const CHROMIUM_STYLE_ARTIFACT_SELECTOR =
  "[style], font, span:not([data-task-content]):not([data-md-syntax]):not([data-md-url])";

/**
 * Removes Chromium-injected inline styles (`<span style="font-size: ...">`, `<font>`,
 * computed `style="..."` copied on Backspace merges/execCommand) while preserving
 * semantic editor elements and keeping the live selection anchored cleanly.
 */
export function stripChromiumInlineArtifacts(
  container: HTMLElement,
  preserveSelection = false,
): void {
  if (!container.querySelector(CHROMIUM_STYLE_ARTIFACT_SELECTOR)) return;

  const sel = preserveSelection ? window.getSelection() : null;
  const activeRange =
    sel && sel.rangeCount > 0 && container.contains(sel.getRangeAt(0).startContainer)
      ? sel.getRangeAt(0)
      : null;

  let startNode: Node | null = activeRange ? activeRange.startContainer : null;
  let startOffset = activeRange ? activeRange.startOffset : 0;
  let endNode: Node | null = activeRange ? activeRange.endContainer : null;
  let endOffset = activeRange ? activeRange.endOffset : 0;
  let selectionAdjusted = false;

  const remapIfPointingAt = (el: HTMLElement): void => {
    const parent = el.parentNode;
    if (!parent) return;
    const idx = Array.prototype.indexOf.call(parent.childNodes, el);
    if (startNode === el) {
      startNode = parent;
      startOffset = idx + Math.min(startOffset, el.childNodes.length);
      selectionAdjusted = true;
    }
    if (endNode === el) {
      endNode = parent;
      endOffset = idx + Math.min(endOffset, el.childNodes.length);
      selectionAdjusted = true;
    }
  };

  const dirtyWrappers = Array.from(
    container.querySelectorAll("font, span:not([data-task-content]):not([data-md-syntax]):not([data-md-url])"),
  ).reverse();

  for (const el of dirtyWrappers) {
    if (!el.isConnected) continue;
    const htmlEl = el as HTMLElement;
    const closestBlock = getClosestBlock(htmlEl.parentNode, container);
    remapIfPointingAt(htmlEl);
    unwrapElement(htmlEl);
    if (closestBlock && closestBlock.isConnected && !hasVisibleContent(closestBlock)) {
      ensureElementHasBreakIfEmpty(closestBlock);
    }
  }

  container.querySelectorAll("[style]").forEach((el) => {
    el.removeAttribute("style");
  });

  if (preserveSelection && sel && startNode && startNode.isConnected) {
    const endValid = endNode && endNode.isConnected ? endNode : startNode;
    const endOffValid = endNode && endNode.isConnected ? endOffset : startOffset;
    if (selectionAdjusted || !container.contains(sel.anchorNode)) {
      try {
        const nextRange = document.createRange();
        const maxStart =
          startNode.nodeType === Node.TEXT_NODE
            ? (startNode.nodeValue?.length ?? 0)
            : startNode.childNodes.length;
        const maxEnd =
          endValid.nodeType === Node.TEXT_NODE
            ? (endValid.nodeValue?.length ?? 0)
            : endValid.childNodes.length;
        nextRange.setStart(startNode, Math.max(0, Math.min(startOffset, maxStart)));
        nextRange.setEnd(endValid, Math.max(0, Math.min(endOffValid, maxEnd)));
        sel.removeAllRanges();
        sel.addRange(nextRange);
      } catch {
        // ignore invalid selection range
      }
    }
  }
}

const SAFE_STORED_NOTE_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "div",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "hr",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "strike",
  "mark",
  "sub",
  "sup",
  "kbd",
  "span",
  "a",
  "img",
  "input",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

const SAFE_STORED_ATTRS = new Set([
  "alt",
  "checked",
  "class",
  "contenteditable",
  "data-align",
  "data-checked",
  "data-code-eol",
  "data-image-tail",
  "data-lang",
  "data-md-bullet",
  "data-md-delim",
  "data-media-uri",
  "data-note-image-block",
  "data-task",
  "data-task-checkbox",
  "data-task-content",
  "data-task-list",
  "dir",
  "disabled",
  "draggable",
  "height",
  "href",
  "rel",
  "src",
  "start",
  "target",
  "title",
  "type",
  "width",
]);

function isSafeStoredHref(rawHref: string): string | null {
  const trimmed = rawHref.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#")) return trimmed;
  if (/^mailto:[^\s<>]+$/i.test(trimmed)) return trimmed;
  return sanitizeHttpUrl(trimmed);
}

/**
 * Sanitizes persisted note HTML before rendering or loading into the editor,
 * blocking active XSS vectors while keeping note structure, task items, and media refs.
 */
export function sanitizeStoredNoteHtml(rawHtml: string): string {
  if (!rawHtml) return "";

  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  doc.body
    .querySelectorAll(
      "script, style, noscript, iframe, object, embed, meta, link, title, base, form, svg, math",
    )
    .forEach((node) => node.remove());

  const sanitizeNodeTree = (parent: HTMLElement): void => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      sanitizeNodeTree(el);

      if (!SAFE_STORED_NOTE_TAGS.has(tag)) {
        unwrapElement(el);
        continue;
      }

      if (tag === "span" && !el.hasAttribute("data-task-content")) {
        unwrapElement(el);
        continue;
      }

      if (tag === "p" && parent !== doc.body) {
        const parentTag = parent.tagName.toLowerCase();
        if (parentTag === "p" || HEADING_TAG_SET.has(parentTag)) {
          if (!hasVisibleContent(el)) {
            el.remove();
          } else {
            unwrapElement(el);
          }
          continue;
        }
      }

      if (tag === "input") {
        if (el.getAttribute("type")?.toLowerCase() !== "checkbox") {
          el.remove();
          continue;
        }
        el.setAttribute("data-task-checkbox", "true");
        el.setAttribute("contenteditable", "false");
      }

      if (tag === "img") {
        const src = el.getAttribute("src") || "";
        const mediaUri = el.getAttribute("data-media-uri") || "";
        if (!isSafeStoredMediaSrc(src) && !isSafeStoredMediaSrc(mediaUri)) {
          el.remove();
          continue;
        }
      }

      if (tag === "a") {
        const safeHref = isSafeStoredHref(el.getAttribute("href") || "");
        if (!safeHref) {
          unwrapElement(el);
          continue;
        }
        el.setAttribute("href", safeHref);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }

      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || name === "srcdoc" || !SAFE_STORED_ATTRS.has(name)) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (name === "src" && !isSafeStoredMediaSrc(attr.value)) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (name === "data-media-uri" && !isSafeStoredMediaSrc(attr.value)) {
          el.removeAttribute(attr.name);
        }
      }
    }
  };

  sanitizeNodeTree(doc.body);
  unwrapParagraphsInListItems(doc.body);
  stripLiveSyntaxArtifacts(doc.body);
  convertStandaloneHrLines(doc.body);
  syncImageBlockAlignments(doc.body);

  return doc.body.innerHTML;
}

function isImageBlockNode(node: Node | null): boolean {
  return (
    Boolean(node) &&
    node!.nodeType === Node.ELEMENT_NODE &&
    (node as HTMLElement).hasAttribute(NOTE_IMAGE_BLOCK_ATTR)
  );
}

function resolveElementTextAlignment(
  el: HTMLElement | null,
  root: HTMLElement,
): "left" | "right" | null {
  if (!el || el === root || isImageBlockNode(el) || el.tagName === "HR") return null;

  const inlineAlign = el.style?.textAlign?.trim().toLowerCase();
  if (inlineAlign === "right" || inlineAlign === "end") return "right";
  if (inlineAlign === "left" || inlineAlign === "start") return "left";

  const attrAlign = el.getAttribute("align")?.trim().toLowerCase();
  if (attrAlign === "right") return "right";
  if (attrAlign === "left") return "left";

  const explicitDir = el.getAttribute("dir")?.trim().toLowerCase();
  if (explicitDir === "rtl") return "right";
  if (explicitDir === "ltr") return "left";

  const detectedDir = detectTextBlockDirection(getTextWithoutArtifacts(el));
  if (detectedDir === "rtl") return "right";
  if (detectedDir === "ltr") return "left";
  return null;
}

export function inferImageAlignmentFromContext(
  anchorNode: Node | null,
  editor: HTMLElement,
): "left" | "right" {
  const topBlock = anchorNode ? getTopLevelBlock(anchorNode, editor) : null;
  if (topBlock && !isImageBlockNode(topBlock)) {
    const direct = resolveElementTextAlignment(topBlock, editor);
    if (direct) return direct;
  }

  let prev = topBlock ? topBlock.previousElementSibling : editor.lastElementChild;
  while (prev) {
    const align = resolveElementTextAlignment(prev as HTMLElement, editor);
    if (align) return align;
    prev = prev.previousElementSibling;
  }

  let next = topBlock ? topBlock.nextElementSibling : editor.firstElementChild;
  while (next) {
    const align = resolveElementTextAlignment(next as HTMLElement, editor);
    if (align) return align;
    next = next.nextElementSibling;
  }

  const wholeNoteDir = detectTextBlockDirection(getTextWithoutArtifacts(editor));
  if (wholeNoteDir === "rtl") return "right";
  if (wholeNoteDir === "ltr") return "left";

  if (typeof window !== "undefined" && editor.isConnected) {
    const computedDir = window.getComputedStyle(editor).direction;
    if (computedDir === "rtl") return "right";
  }
  return "left";
}

export function applyImageBlockAlignment(block: HTMLElement, align: "left" | "right"): boolean {
  const dir = align === "right" ? "rtl" : "ltr";
  const prevAlign = block.getAttribute(NOTE_IMAGE_ALIGN_ATTR);
  const prevDir = block.getAttribute("dir");
  if (prevAlign === align && prevDir === dir) return false;
  block.setAttribute(NOTE_IMAGE_ALIGN_ATTR, align);
  block.setAttribute("dir", dir);
  return true;
}

export function syncImageBlockAlignments(editor: HTMLElement): boolean {
  const blocks = editor.querySelectorAll(`[${NOTE_IMAGE_BLOCK_ATTR}="true"]`);
  if (blocks.length === 0) return false;
  let mutated = false;
  blocks.forEach((node) => {
    const block = node as HTMLElement;
    const align = inferImageAlignmentFromContext(block, editor);
    if (applyImageBlockAlignment(block, align)) {
      mutated = true;
    }
  });
  return mutated;
}

/**
 * Returns `true` when a non-collapsed selection range strictly spans across `<hr>`.
 */
export function doesRangeOverlapHr(range: Range, hr: Node): boolean {
  if (range.collapsed) return false;
  const parent = hr.parentNode;
  if (!parent) return false;
  const idx = Array.prototype.indexOf.call(parent.childNodes, hr);
  if (idx < 0) return false;
  const doc = hr.ownerDocument || document;
  const rStart = doc.createRange();
  rStart.setStart(range.startContainer, range.startOffset);
  rStart.collapse(true);
  const rEnd = doc.createRange();
  rEnd.setStart(range.endContainer, range.endOffset);
  rEnd.collapse(true);
  try {
    return rStart.comparePoint(parent, idx) >= 0 && rEnd.comparePoint(parent, idx + 1) <= 0;
  } catch {
    return range.intersectsNode(hr);
  }
}

/**
 * Returns `true` when `range` meaningfully overlaps `el`'s content, ignoring zero-width
 * boundary touches such as triple-click selections ending at `(el, 0)`.
 */
export function doesRangeOverlapElement(
  range: Range,
  el: HTMLElement,
  maxChildOffset?: number,
): boolean {
  const endOffset = maxChildOffset ?? el.childNodes.length;
  if (range.collapsed) {
    if (!el.contains(range.startContainer)) return false;
    if (maxChildOffset === undefined) return true;
    const doc = el.ownerDocument || document;
    const rStart = doc.createRange();
    rStart.setStart(range.startContainer, range.startOffset);
    rStart.collapse(true);
    try {
      return rStart.comparePoint(el, endOffset) > 0;
    } catch {
      return true;
    }
  }
  if (!range.intersectsNode(el)) return false;
  if (
    maxChildOffset === undefined &&
    el.contains(range.startContainer) &&
    el.contains(range.endContainer)
  ) {
    return true;
  }
  const doc = el.ownerDocument || document;
  const rStart = doc.createRange();
  rStart.setStart(range.startContainer, range.startOffset);
  rStart.collapse(true);
  const rEnd = doc.createRange();
  rEnd.setStart(range.endContainer, range.endOffset);
  rEnd.collapse(true);
  try {
    const startCmp = rStart.comparePoint(el, 0);
    const endCmp = rEnd.comparePoint(el, endOffset);
    if (startCmp > 0 && endCmp < 0) return true;

    const clamped = doc.createRange();
    if (startCmp >= 0) {
      clamped.setStart(el, 0);
    } else {
      clamped.setStart(range.startContainer, range.startOffset);
    }
    if (endCmp <= 0) {
      clamped.setEnd(el, endOffset);
    } else {
      clamped.setEnd(range.endContainer, range.endOffset);
    }
    if (clamped.collapsed) {
      return (
        el.hasAttribute(MD_HR_ACTIVE_ATTR) &&
        ((range.startContainer.nodeType === Node.TEXT_NODE && el.contains(range.startContainer)) ||
          (range.endContainer.nodeType === Node.TEXT_NODE && el.contains(range.endContainer)))
      );
    }
    if (stripZeroWidth(clamped.toString()).length > 0) return true;
    const frag = clamped.cloneContents();
    return Boolean(
      frag.querySelector("img, hr, input") || (startCmp > 0 && frag.querySelector("br")),
    );
  } catch {
    return range.intersectsNode(el);
  }
}

/**
 * Returns true if a non-collapsed range crosses outside `(el, 0)` or `(el, maxChildOffset)`,
 * keeping prefix-only reveal blocks rendered during pure inner-text selections (e.g. double-clicking a word).
 */
export function doesRangeCrossElementScope(
  range: Range,
  el: HTMLElement,
  maxChildOffset?: number,
): boolean {
  if (range.collapsed || !range.intersectsNode(el)) return false;
  const endOffset =
    maxChildOffset === undefined
      ? el.childNodes.length
      : Math.max(0, Math.min(maxChildOffset, el.childNodes.length));
  const doc = el.ownerDocument || document;
  const rStart = doc.createRange();
  rStart.setStart(range.startContainer, range.startOffset);
  rStart.collapse(true);
  const rEnd = doc.createRange();
  rEnd.setStart(range.endContainer, range.endOffset);
  rEnd.collapse(true);
  try {
    return rStart.comparePoint(el, 0) > 0 || rEnd.comparePoint(el, endOffset) < 0;
  } catch {
    return true;
  }
}

/**
 * Converts standalone plain `---` / `***` / `___` lines inside a container into semantic `<hr>` dividers,
 * skipping any line currently intersected by `activeRange` (when editing live in the DOM).
 */
export function convertStandaloneHrLines(
  container: HTMLElement,
  options?: {
    activeRange?: Range | null;
    preserveSyntaxAttr?: boolean;
    onNodeReplaced?: (oldNode: Node, newNode: Node) => void;
  },
): boolean {
  const range = options?.activeRange ?? null;
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  const savedEndpoints =
    range && sel && range.intersectsNode(container)
      ? {
        anchorNode: sel.anchorNode,
        anchorOffset: sel.anchorOffset,
        focusNode: sel.focusNode,
        focusOffset: sel.focusOffset,
      }
      : null;

  let converted = false;

  const isRangeTouchingNodes = (
    block: HTMLElement,
    nodes: Node[],
    segStartIdx: number,
    segEndIdx: number,
  ): boolean => {
    if (!range) return false;
    for (const n of nodes) {
      if (n.contains(range.startContainer) || n.contains(range.endContainer)) return true;
      if (!range.collapsed && range.intersectsNode(n)) return true;
    }
    if (
      range.startContainer === block &&
      range.startOffset >= segStartIdx &&
      range.startOffset <= segEndIdx
    ) {
      return true;
    }
    if (
      !range.collapsed &&
      range.endContainer === block &&
      range.endOffset >= segStartIdx &&
      range.endOffset <= segEndIdx
    ) {
      return true;
    }
    return false;
  };

  for (const child of Array.from(container.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag !== "p" && tag !== "div") continue;
    const block = child as HTMLElement;
    if (
      block.hasAttribute(NOTE_IMAGE_BLOCK_ATTR) ||
      block.hasAttribute(MD_ACTIVE_ATTR) ||
      block.hasAttribute(MD_HR_ACTIVE_ATTR)
    ) {
      continue;
    }
    // Single-line paragraph (`<p>---</p>` or `<p>---<br></p>`).
    const standaloneHrSyntax = isStandaloneHrBlock(block);
    if (standaloneHrSyntax) {
      if (range && doesRangeOverlapElement(range, block)) continue;
      const hr = document.createElement("hr");
      if (options?.preserveSyntaxAttr) hr.setAttribute(MD_HR_SYNTAX_ATTR, standaloneHrSyntax);
      block.replaceWith(hr);
      options?.onNodeReplaced?.(block, hr);
      converted = true;
      continue;
    }

    if (block.querySelector("img, ul, ol, pre, blockquote, hr")) continue;
    const directBrs = Array.from(block.children).filter((c) => c.tagName.toLowerCase() === "br");
    const hasNestedBr = block.querySelectorAll("br").length > directBrs.length;
    if (hasNestedBr || directBrs.length === 0) continue;

    // Multi-line soft-break paragraph (`<p>text<br>---</p>`): split only around untouched `---` lines.
    const children = Array.from(block.childNodes);
    const segments: {
      nodes: Node[];
      startIdx: number;
      endIdx: number;
      isHr: boolean;
      syntax: string;
    }[] = [];
    let curNodes: Node[] = [];
    let segStart = 0;

    const flushSegment = (endIdx: number) => {
      const onlyTextLike = curNodes.every((n) => n.nodeType === Node.TEXT_NODE);
      const text = onlyTextLike
        ? curNodes
          .map((n) => n.nodeValue || "")
          .join("")
          .replace(/\u200B/g, "")
          .replace(/\u00A0/g, " ")
          .trim()
        : "";
      const isCandidate = Boolean(onlyTextLike && HR_LINE_REGEX.test(text));
      const touched = isCandidate && isRangeTouchingNodes(block, curNodes, segStart, endIdx);
      segments.push({
        nodes: curNodes,
        startIdx: segStart,
        endIdx,
        isHr: Boolean(isCandidate && !touched),
        syntax: text,
      });
      curNodes = [];
    };

    children.forEach((n, idx) => {
      if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName.toLowerCase() === "br") {
        flushSegment(idx);
        segStart = idx + 1;
      } else {
        curNodes.push(n);
      }
    });
    flushSegment(children.length);

    if (!segments.some((s) => s.isHr)) continue;

    const frag = document.createDocumentFragment();
    let activeChunk: HTMLElement | null = null;
    const ensureChunk = () => {
      if (!activeChunk) {
        activeChunk = document.createElement("p");
        frag.appendChild(activeChunk);
      }
      return activeChunk;
    };

    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i]!;
      if (seg.isHr) {
        if (activeChunk) {
          cleanTrailingEmptyNodes(activeChunk);
          ensureElementHasBreakIfEmpty(activeChunk);
          activeChunk = null;
        }
        const hr = document.createElement("hr");
        if (options?.preserveSyntaxAttr) hr.setAttribute(MD_HR_SYNTAX_ATTR, seg.syntax);
        frag.appendChild(hr);
        continue;
      }

      const segHasNodes =
        seg.nodes.length > 0 &&
        seg.nodes.some(
          (n) => n.nodeType !== Node.TEXT_NODE || Boolean(n.nodeValue?.replace(/\u200B/g, "")),
        );
      const segHoldsCursor = Boolean(
        range && isRangeTouchingNodes(block, seg.nodes, seg.startIdx, seg.endIdx),
      );
      if (!segHasNodes && !segHoldsCursor && i === segments.length - 1) {
        // Drop bogus empty trailing segment left by `<br>` right after `---` unless caret sits there.
        continue;
      }
      const prevWasRegular = i > 0 && !segments[i - 1]!.isHr && activeChunk !== null;
      const chunk = ensureChunk();
      if (prevWasRegular) {
        chunk.appendChild(document.createElement("br"));
      }
      for (const n of seg.nodes) {
        chunk.appendChild(n);
      }
      if (!segHasNodes && seg.nodes.length === 0) {
        chunk.appendChild(document.createElement("br"));
      }
    }

    if (activeChunk) {
      cleanTrailingEmptyNodes(activeChunk);
      ensureElementHasBreakIfEmpty(activeChunk);
    }

    block.replaceWith(frag);
    converted = true;
  }

  if (converted && savedEndpoints && sel) {
    try {
      const { anchorNode, anchorOffset, focusNode, focusOffset } = savedEndpoints;
      if (
        anchorNode &&
        focusNode &&
        container.contains(anchorNode) &&
        container.contains(focusNode)
      ) {
        sel.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
      }
    } catch {
      // ignore invalid endpoint restore
    }
  }

  return converted;
}
