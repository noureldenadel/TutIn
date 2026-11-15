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
export const NOTE_IMAGE_TAIL_ATTR = "data-image-tail";
export const MD_SYNTAX_ATTR = "data-md-syntax";
export const MD_ACTIVE_ATTR = "data-md-active";
export const MD_URL_ATTR = "data-md-url";

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

export function isMarkdownSyntaxNode(node: Node | null): boolean {
  return (
    Boolean(node) &&
    node!.nodeType === Node.ELEMENT_NODE &&
    ((node as HTMLElement).hasAttribute(MD_SYNTAX_ATTR) ||
      (node as HTMLElement).hasAttribute("data-ghost"))
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

export function getTextWithoutArtifacts(node: Node): string {
  const clone = node.cloneNode(true) as HTMLElement | DocumentFragment;
  if ("querySelectorAll" in clone) {
    clone
      .querySelectorAll(`[data-ghost], [data-task-checkbox], [${MD_SYNTAX_ATTR}]`)
      .forEach((el) => el.remove());
  }
  return (clone.textContent || "").replace(/\u00A0/g, " ").replace(/\u200B/g, "");
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
    if (
      child.nodeType === Node.TEXT_NODE &&
      (child.nodeValue || "").replace(/\u200B/g, "") === ""
    ) {
      child.remove();
    }
  }
}

export function getLastDescendantTextNode(el: Node): Text | null {
  for (let i = el.childNodes.length - 1; i >= 0; i -= 1) {
    const child = el.childNodes[i];
    if (!child) continue;
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child as HTMLElement;
      if (
        childEl.hasAttribute("data-ghost") ||
        childEl.hasAttribute("data-task-checkbox") ||
        childEl.hasAttribute(MD_SYNTAX_ATTR)
      ) {
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
      if (!parentEl?.closest(`[data-ghost], [data-task-checkbox], [${MD_SYNTAX_ATTR}]`)) {
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

export function getCollapsedSelectionRange(editor: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed || !editor.contains(range.startContainer)) return null;
  return range;
}

/**
 * Serializes a bookmark relative to persistent DOM nodes, skipping transient
 * `[data-md-syntax]` and `[data-ghost]` nodes so bookmarks align with
 * `serializeContainerMediaHtml` during undo/redo.
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
    const parent = syntaxEl.parentNode;
    const target = getFirstEditableTarget(parent as HTMLElement);
    curr = target.node;
    offset = target.offset;
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

function isSafeClipboardImageSrc(rawSrc: string): boolean {
  const trimmed = rawSrc.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:image/") || trimmed.startsWith("blob:")) return true;
  return sanitizeHttpUrl(trimmed) !== null;
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
          if (checked) el.setAttribute("checked", "");
        } else {
          el.remove();
        }
        continue;
      }

      if (tag === "img") {
        const src = el.getAttribute("src") || "";
        if (!isSafeClipboardImageSrc(src)) {
          el.remove();
          continue;
        }
        const alt = el.getAttribute("alt") || "";
        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }
        el.setAttribute("src", src.trim());
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
        const keepTaskList = tag === "ul" && el.hasAttribute("data-task-list");
        const keepTaskItem = tag === "li" && el.hasAttribute("data-task-item");
        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }
        if (keepTaskList) el.setAttribute("data-task-list", "true");
        if (keepTaskItem) el.setAttribute("data-task-item", "true");
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
  stripLiveSyntaxArtifacts(doc.body);
  return doc.body.innerHTML.trim();
}
