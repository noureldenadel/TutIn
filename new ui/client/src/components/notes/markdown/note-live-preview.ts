import {
  BLOCK_TAG_SET,
  HEADING_TAG_SET,
  INLINE_MARK_TAGS,
  MD_ACTIVE_ATTR,
  MD_SYNTAX_ATTR,
  MD_URL_ATTR,
  cleanTrailingEmptyNodes,
  ensureElementHasBreakIfEmpty,
  getCaretBookmark,
  getClosestBlock,
  getCollapsedSelectionRange,
  getFirstEditableTarget,
  getLastDescendantTextNode,
  getTextWithoutArtifacts,
  hasVisibleContent,
  isInsideMarkdownSyntax,
  isInsideTag,
  placeCaret,
  placeCaretAtEnd,
  placeCaretAtStart,
  restoreCaretBookmark,
  sanitizeHttpUrl,
} from "./note-dom";

interface InlineLiveRule {
  tag: "code" | "strong" | "em" | "s" | "mark";
  delimiter: string;
}

const INLINE_LIVE_RULES: Record<string, InlineLiveRule> = {
  code: { tag: "code", delimiter: "`" },
  strong: { tag: "strong", delimiter: "**" },
  b: { tag: "strong", delimiter: "**" },
  em: { tag: "em", delimiter: "*" },
  i: { tag: "em", delimiter: "*" },
  s: { tag: "s", delimiter: "~~" },
  del: { tag: "s", delimiter: "~~" },
  strike: { tag: "s", delimiter: "~~" },
  mark: { tag: "mark", delimiter: "==" },
};

const SELECTION_WRAP_DELIMITERS: Record<string, [string, string]> = {
  "(": ["(", ")"],
  "[": ["[", "]"],
  '"': ['"', '"'],
};

const COLLAPSED_PLAIN_PAIRS: Record<string, [string, string]> = {
  "(": ["(", ")"],
  "[": ["[", "]"],
  '"': ['"', '"'],
};

const CLOSING_PLAIN_PAIR_CHARS = new Set([")", "]", '"']);

function createSyntaxSpan(
  kind: "heading" | "blockquote" | "open" | "close",
  text: string,
): HTMLSpanElement {
  const span = document.createElement("span");
  span.setAttribute(MD_SYNTAX_ATTR, kind);
  span.setAttribute("spellcheck", "false");
  span.textContent = text;
  return span;
}

function createLinkCloseSyntaxSpan(href: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.setAttribute(MD_SYNTAX_ATTR, "close");
  span.setAttribute("spellcheck", "false");
  span.appendChild(document.createTextNode("]("));
  const urlSpan = document.createElement("span");
  urlSpan.setAttribute(MD_URL_ATTR, "true");
  urlSpan.textContent = href;
  span.appendChild(urlSpan);
  span.appendChild(document.createTextNode(")"));
  return span;
}

function getDirectSyntaxChild(
  el: HTMLElement,
  kind: "heading" | "blockquote" | "open" | "close",
): HTMLSpanElement | null {
  for (const child of Array.from(el.children)) {
    if (child.tagName === "SPAN" && child.getAttribute(MD_SYNTAX_ATTR) === kind) {
      return child as HTMLSpanElement;
    }
  }
  return null;
}

function cleanZeroWidthInsideElement(el: HTMLElement): void {
  if (getTextWithoutArtifacts(el).length === 0 && !el.querySelector("img")) return;
  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType !== Node.TEXT_NODE) continue;
    const tn = child as Text;
    const val = tn.nodeValue || "";
    if (!val.includes("\u200B")) continue;
    const cleaned = val.replace(/\u200B/g, "");
    const isCaretInNode = Boolean(range && range.startContainer === tn);
    const oldOffset = isCaretInNode && range ? range.startOffset : 0;
    if (cleaned === "") {
      if (isCaretInNode) {
        const next = tn.nextSibling;
        const prev = tn.previousSibling;
        tn.remove();
        if (next && next.nodeType === Node.TEXT_NODE) {
          placeCaret(next, 0);
        } else if (
          prev &&
          prev.nodeType === Node.TEXT_NODE &&
          !prev.parentElement?.hasAttribute(MD_SYNTAX_ATTR)
        ) {
          placeCaret(prev, prev.nodeValue?.length ?? 0);
        }
      } else {
        tn.remove();
      }
      continue;
    }
    const nextOffset = val.slice(0, oldOffset).replace(/\u200B/g, "").length;
    tn.nodeValue = cleaned;
    if (isCaretInNode) {
      placeCaret(tn, nextOffset);
    }
  }
}

function getBlockSyntaxPrefix(block: HTMLElement): {
  kind: "heading" | "blockquote";
  text: string;
} | null {
  const tag = block.tagName.toLowerCase();
  if (HEADING_TAG_SET.has(tag)) {
    const level = Number.parseInt(tag.slice(1), 10) || 1;
    return { kind: "heading", text: `${"#".repeat(level)} ` };
  }
  if (tag === "blockquote") {
    return { kind: "blockquote", text: "> " };
  }
  return null;
}

function getActiveMarksForSelection(
  editor: HTMLElement,
  range: Range,
): { activeBlock: HTMLElement | null; activeInlines: HTMLElement[] } {
  if (isInsideTag(range.startContainer, editor, ["pre"])) {
    return { activeBlock: null, activeInlines: [] };
  }

  const startBlock = getClosestBlock(range.startContainer, editor);
  const endBlock = range.collapsed ? startBlock : getClosestBlock(range.endContainer, editor);

  const activeBlock =
    startBlock && startBlock === endBlock && Boolean(getBlockSyntaxPrefix(startBlock))
      ? startBlock
      : null;

  const collectAncestors = (node: Node): HTMLElement[] => {
    const list: HTMLElement[] = [];
    let curr: Node | null = node;
    while (curr && curr !== editor) {
      if (curr.nodeType === Node.ELEMENT_NODE) {
        const el = curr as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (BLOCK_TAG_SET.has(tag)) break;
        if (INLINE_MARK_TAGS.has(tag)) {
          list.push(el);
        }
      }
      curr = curr.parentNode;
    }
    return list;
  };

  const startInlines = collectAncestors(range.startContainer);
  const activeInlines = range.collapsed
    ? startInlines
    : startInlines.filter((el) => el.contains(range.endContainer));

  return { activeBlock, activeInlines };
}

function deactivateElement(editor: HTMLElement, el: HTMLElement): void {
  const tag = el.tagName.toLowerCase();
  el.removeAttribute(MD_ACTIVE_ATTR);

  Array.from(el.children).forEach((child) => {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      (child as HTMLElement).hasAttribute(MD_SYNTAX_ATTR)
    ) {
      child.remove();
    }
  });

  if (INLINE_MARK_TAGS.has(tag)) {
    const remainingText = (el.textContent || "").replace(/\u200B/g, "");
    if (remainingText.length === 0 && !el.querySelector("img, br")) {
      const parent = el.parentNode;
      el.remove();
      if (
        parent &&
        parent instanceof HTMLElement &&
        parent !== editor &&
        !hasVisibleContent(parent)
      ) {
        ensureElementHasBreakIfEmpty(parent);
      }
      return;
    }
    cleanTrailingEmptyNodes(el);
    return;
  }

  cleanTrailingEmptyNodes(el);
  ensureElementHasBreakIfEmpty(el);
}

function activateBlockElement(block: HTMLElement, caretNode: Node | null): void {
  const spec = getBlockSyntaxPrefix(block);
  if (!spec) return;

  block.setAttribute(MD_ACTIVE_ATTR, "true");
  cleanZeroWidthInsideElement(block);

  if (getDirectSyntaxChild(block, spec.kind)) return;

  const hadCaretOnElement = caretNode === block;
  const emptyBr =
    getTextWithoutArtifacts(block).length === 0 ? block.querySelector(":scope > br") : null;
  if (emptyBr) {
    emptyBr.remove();
  }

  const span = createSyntaxSpan(spec.kind, spec.text);
  block.insertBefore(span, block.firstChild);

  if (getTextWithoutArtifacts(block).length === 0 && !block.querySelector("img")) {
    const anchor = document.createTextNode("\u200B");
    block.insertBefore(anchor, span.nextSibling);
    if (hadCaretOnElement) {
      placeCaret(anchor, 1);
    }
  } else if (hadCaretOnElement) {
    placeCaretAtStart(block);
  }
}

function activateInlineElement(inlineEl: HTMLElement, caretNode: Node | null): void {
  const tag = inlineEl.tagName.toLowerCase();
  inlineEl.setAttribute(MD_ACTIVE_ATTR, "true");
  cleanZeroWidthInsideElement(inlineEl);

  const hasOpen = Boolean(getDirectSyntaxChild(inlineEl, "open"));
  const hasClose = Boolean(getDirectSyntaxChild(inlineEl, "close"));
  const isEmptyContent =
    getTextWithoutArtifacts(inlineEl).length === 0 && !inlineEl.querySelector("img");

  if (!hasOpen || !hasClose) {
    const emptyBr = isEmptyContent ? inlineEl.querySelector(":scope > br") : null;
    if (emptyBr) {
      emptyBr.remove();
    }

    if (tag === "a") {
      const href = inlineEl.getAttribute("href") || "";
      if (!hasOpen) {
        inlineEl.insertBefore(createSyntaxSpan("open", "["), inlineEl.firstChild);
      }
      if (!hasClose) {
        inlineEl.appendChild(createLinkCloseSyntaxSpan(href));
      }
    } else {
      const rule = INLINE_LIVE_RULES[tag];
      if (!rule) return;
      if (!hasOpen) {
        inlineEl.insertBefore(createSyntaxSpan("open", rule.delimiter), inlineEl.firstChild);
      }
      if (!hasClose) {
        inlineEl.appendChild(createSyntaxSpan("close", rule.delimiter));
      }
    }
  }

  const openSpan = getDirectSyntaxChild(inlineEl, "open");
  const closeSpan = getDirectSyntaxChild(inlineEl, "close");

  if (isEmptyContent) {
    const emptyBr = inlineEl.querySelector(":scope > br");
    if (emptyBr) {
      emptyBr.remove();
    }

    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 && sel.isCollapsed ? sel.getRangeAt(0) : null;
    const rangeInInline = Boolean(range && inlineEl.contains(range.startContainer));
    const openTextLen = (openSpan?.textContent || "").replace(/\u200B/g, "").length;
    const atOpenEnd = Boolean(
      range &&
      openSpan &&
      openTextLen > 0 &&
      openSpan.contains(range.startContainer) &&
      getLogicalCaretOffsetInNode(openSpan, range.startContainer, range.startOffset) >= openTextLen,
    );
    const atCloseStart = Boolean(
      range &&
      closeSpan &&
      closeSpan.contains(range.startContainer) &&
      getLogicalCaretOffsetInNode(closeSpan, range.startContainer, range.startOffset) === 0,
    );

    let anchor: Text | null = null;
    for (const child of Array.from(inlineEl.childNodes)) {
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const tn = child as Text;
      const val = tn.nodeValue || "";
      if (val === "\u200B" && !anchor) {
        anchor = tn;
      } else if (val.replace(/\u200B/g, "") === "") {
        tn.remove();
      }
    }

    if (!anchor) {
      anchor = document.createTextNode("\u200B");
      inlineEl.insertBefore(anchor, closeSpan);
    }

    if (
      caretNode === inlineEl ||
      atOpenEnd ||
      atCloseStart ||
      (rangeInInline && !range?.startContainer.isConnected)
    ) {
      placeCaret(anchor, 1);
    }
    return;
  }

  if (caretNode === inlineEl) {
    placeCaretAtStart(inlineEl);
  }
}

/**
 * Synchronizes Obsidian-style Live Preview syntax markers across the editor based on
 * the current selection. Runs idempotently on `selectionchange`, commands, and `blur`.
 */
export function syncLiveMarkdownSyntax(
  editor: HTMLElement,
  options?: { clearAll?: boolean },
): void {
  const sel = window.getSelection();
  const range =
    !options?.clearAll &&
    sel &&
    sel.rangeCount > 0 &&
    editor.contains(sel.getRangeAt(0).startContainer)
      ? sel.getRangeAt(0)
      : null;

  const { activeBlock, activeInlines } = range
    ? getActiveMarksForSelection(editor, range)
    : { activeBlock: null, activeInlines: [] };

  const activeSet = new Set<HTMLElement>(activeInlines);
  if (activeBlock) activeSet.add(activeBlock);

  const currentActives = Array.from(
    editor.querySelectorAll(`[${MD_ACTIVE_ATTR}="true"]`),
  ) as HTMLElement[];
  // Process bottom-up so inner inline cleanup completes cleanly before ancestor blocks.
  for (let i = currentActives.length - 1; i >= 0; i -= 1) {
    const el = currentActives[i]!;
    if (!activeSet.has(el)) {
      deactivateElement(editor, el);
    }
  }

  if (!range) return;

  const caretNode = range.startContainer;
  if (activeBlock) {
    activateBlockElement(activeBlock, caretNode);
  }
  for (const inlineEl of activeInlines) {
    activateInlineElement(inlineEl, caretNode);
  }

  // Strip/unwrap any orphan syntax spans whose parent lost active state (e.g. after native block merge).
  const lingeringSpans = Array.from(
    editor.querySelectorAll(`[${MD_SYNTAX_ATTR}]`),
  ) as HTMLElement[];
  for (const span of lingeringSpans) {
    const parent = span.parentElement;
    if (!parent || parent.getAttribute(MD_ACTIVE_ATTR) === "true") continue;
    const kind = span.getAttribute(MD_SYNTAX_ATTR);
    if (kind === "heading" || kind === "blockquote") {
      const txt = (span.textContent || "").replace(/\u200B/g, "");
      if (txt) {
        span.replaceWith(document.createTextNode(txt));
        parent.normalize();
      } else {
        span.remove();
      }
    } else {
      span.remove();
    }
  }
}

export function clearAllLiveMarkdownSyntax(editor: HTMLElement): void {
  syncLiveMarkdownSyntax(editor, { clearAll: true });
}

function getLogicalCaretOffsetInNode(
  root: Node,
  targetNode: Node | null,
  targetOffset: number,
): number {
  if (!targetNode) return 0;
  let total = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let curr = walker.nextNode();
  while (curr) {
    const len = (curr.nodeValue || "").replace(/\u200B/g, "").length;
    if (curr === targetNode) {
      const sliceLen = (curr.nodeValue || "").slice(0, targetOffset).replace(/\u200B/g, "").length;
      return total + sliceLen;
    }
    total += len;
    curr = walker.nextNode();
  }
  return total;
}

function replaceBlockTagPreservingCaret(
  block: HTMLElement,
  nextTag: string,
  editor: HTMLElement,
): HTMLElement {
  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const caretNode = range && block.contains(range.startContainer) ? range.startContainer : null;
  const caretOffset = range ? range.startOffset : 0;

  const replacement = document.createElement(nextTag);
  if (HEADING_TAG_SET.has(nextTag) || nextTag === "blockquote") {
    replacement.setAttribute(MD_ACTIVE_ATTR, "true");
  }
  while (block.firstChild) {
    replacement.appendChild(block.firstChild);
  }
  block.parentNode?.replaceChild(replacement, block);

  if (caretNode && replacement.contains(caretNode)) {
    placeCaret(caretNode, caretOffset);
  } else if (caretNode && editor.contains(caretNode)) {
    placeCaret(caretNode, caretOffset);
  }
  return replacement;
}

export function unwrapBlockSyntaxToParagraph(block: HTMLElement, stripPrefixSpan: boolean): void {
  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const caretInside = Boolean(range && block.contains(range.startContainer));
  const logicalOffset =
    caretInside && range
      ? getLogicalCaretOffsetInNode(block, range.startContainer, range.startOffset)
      : 0;

  const p = document.createElement("p");
  if (stripPrefixSpan) {
    block.querySelectorAll(`:scope > [${MD_SYNTAX_ATTR}]`).forEach((s) => s.remove());
  } else {
    block.querySelectorAll(`:scope > [${MD_SYNTAX_ATTR}]`).forEach((s) => {
      const text = (s.textContent || "").replace(/\u200B/g, "");
      if (text) {
        s.replaceWith(document.createTextNode(text));
      } else {
        s.remove();
      }
    });
  }

  while (block.firstChild) {
    p.appendChild(block.firstChild);
  }
  p.normalize();
  cleanTrailingEmptyNodes(p);
  ensureElementHasBreakIfEmpty(p);
  block.parentNode?.replaceChild(p, block);

  if (caretInside) {
    let remaining = logicalOffset;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let curr = walker.nextNode() as Text | null;
    while (curr) {
      const len = curr.nodeValue?.length ?? 0;
      if (remaining <= len) {
        placeCaret(curr, remaining);
        return;
      }
      remaining -= len;
      curr = walker.nextNode() as Text | null;
    }
    placeCaretAtStart(p);
  }
}

function pushSpilledTextAfterBlockSyntax(
  block: HTMLElement,
  span: HTMLSpanElement,
  expectedPrefix: string,
  extraText: string,
): void {
  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const caretInsideSpan = Boolean(range && span.contains(range.startContainer));
  const spanCaretOffset = caretInsideSpan && range ? range.startOffset : 0;

  span.textContent = expectedPrefix;
  const extraNode = document.createTextNode(extraText);

  const afterNode = span.nextSibling;
  if (
    afterNode &&
    afterNode.nodeType === Node.TEXT_NODE &&
    (afterNode.nodeValue || "").replace(/\u200B/g, "") === ""
  ) {
    afterNode.remove();
  }
  block.insertBefore(extraNode, span.nextSibling);

  if (caretInsideSpan) {
    if (spanCaretOffset > expectedPrefix.length) {
      placeCaret(extraNode, spanCaretOffset - expectedPrefix.length);
    } else if (span.firstChild) {
      placeCaret(span.firstChild, spanCaretOffset);
    }
  }
}

function reconcileBlockSyntax(editor: HTMLElement, block: HTMLElement): void {
  const tag = block.tagName.toLowerCase();
  if (HEADING_TAG_SET.has(tag)) {
    const currentLevel = Number.parseInt(tag.slice(1), 10) || 1;
    const span = getDirectSyntaxChild(block, "heading");
    if (!span) {
      unwrapBlockSyntaxToParagraph(block, true);
      return;
    }
    const raw = (span.textContent || "").replace(/\u00A0/g, " ").replace(/\u200B/g, "");
    const match = /^(#{1,6})([ ])(.*)$/.exec(raw);
    if (!match) {
      unwrapBlockSyntaxToParagraph(block, false);
      return;
    }
    const hashes = match[1]!;
    const canonicalPrefix = `${hashes} `;
    const spilled = match[3] || "";
    if (spilled) {
      pushSpilledTextAfterBlockSyntax(block, span, canonicalPrefix, spilled);
    } else if (span.textContent !== canonicalPrefix) {
      const sel = window.getSelection();
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      const inSpan = Boolean(range && span.contains(range.startContainer));
      const off = inSpan && range ? range.startOffset : canonicalPrefix.length;
      span.textContent = canonicalPrefix;
      if (inSpan && span.firstChild) {
        placeCaret(span.firstChild, Math.min(off, canonicalPrefix.length));
      }
    }
    cleanZeroWidthInsideElement(block);
    if (hashes.length !== currentLevel) {
      replaceBlockTagPreservingCaret(block, `h${hashes.length}`, editor);
    }
    return;
  }

  if (tag === "blockquote") {
    const span = getDirectSyntaxChild(block, "blockquote");
    if (!span) {
      unwrapBlockSyntaxToParagraph(block, true);
      return;
    }
    const raw = (span.textContent || "").replace(/\u00A0/g, " ").replace(/\u200B/g, "");
    const match = /^(>[ ])(.*)$/.exec(raw);
    if (!match) {
      unwrapBlockSyntaxToParagraph(block, false);
      return;
    }
    if (match[2]) {
      pushSpilledTextAfterBlockSyntax(block, span, "> ", match[2]);
    } else if (span.textContent !== "> ") {
      span.textContent = "> ";
    }
    cleanZeroWidthInsideElement(block);
  }
}

function unwrapBrokenInlineToPlainText(inlineEl: HTMLElement): Text | null {
  const parent = inlineEl.parentNode;
  if (!parent) return null;

  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const caretInside = Boolean(range && inlineEl.contains(range.startContainer));
  const logicalOffset =
    caretInside && range
      ? getLogicalCaretOffsetInNode(inlineEl, range.startContainer, range.startOffset)
      : 0;

  let text = "";
  const collectText = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      text += (n.nodeValue || "").replace(/\u200B/g, "");
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      for (const ch of Array.from(n.childNodes)) collectText(ch);
    }
  };
  collectText(inlineEl);

  const prev = inlineEl.previousSibling;
  const prevLen =
    prev && prev.nodeType === Node.TEXT_NODE
      ? (prev.nodeValue || "").replace(/\u200B/g, "").length
      : 0;

  const mergedTextNode = document.createTextNode(text);
  parent.replaceChild(mergedTextNode, inlineEl);

  let finalNode: Text = mergedTextNode;
  let finalOffset = logicalOffset;

  if (prev && prev.nodeType === Node.TEXT_NODE) {
    const prevClean = (prev.nodeValue || "").replace(/\u200B/g, "");
    prev.nodeValue = `${prevClean}${text}`;
    mergedTextNode.remove();
    finalNode = prev as Text;
    finalOffset = prevLen + logicalOffset;
  }

  const next = finalNode.nextSibling;
  if (next && next.nodeType === Node.TEXT_NODE) {
    const nextClean = (next.nodeValue || "").replace(/\u200B/g, "");
    finalNode.nodeValue = `${finalNode.nodeValue || ""}${nextClean}`;
    next.remove();
  }

  if (caretInside) {
    placeCaret(finalNode, Math.max(0, Math.min(finalOffset, finalNode.nodeValue?.length ?? 0)));
  }
  return finalNode;
}

function reconcileInlineElement(inlineEl: HTMLElement): void {
  const tag = inlineEl.tagName.toLowerCase();
  cleanZeroWidthInsideElement(inlineEl);

  if (tag === "a") {
    const openSpan = getDirectSyntaxChild(inlineEl, "open");
    const closeSpan = getDirectSyntaxChild(inlineEl, "close");
    if (!openSpan || !closeSpan) {
      unwrapBrokenInlineToPlainText(inlineEl);
      return;
    }

    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    let openText = (openSpan.textContent || "").replace(/\u200B/g, "");
    if (openText.length > 1) {
      if (openText.startsWith("[")) {
        const innerSpill = openText.slice(1);
        const inOpen = Boolean(range && openSpan.contains(range.startContainer));
        const caretOff = inOpen && range ? range.startOffset : 0;
        openSpan.textContent = "[";
        const tn = document.createTextNode(innerSpill);
        inlineEl.insertBefore(tn, openSpan.nextSibling);
        if (inOpen) {
          if (caretOff > 1) {
            placeCaret(tn, caretOff - 1);
          } else if (openSpan.firstChild) {
            placeCaret(openSpan.firstChild, caretOff);
          }
        }
        openText = "[";
      } else if (openText.endsWith("[")) {
        const outerSpill = openText.slice(0, -1);
        const inOpen = Boolean(range && openSpan.contains(range.startContainer));
        const caretOff = inOpen && range ? range.startOffset : 0;
        openSpan.textContent = "[";
        const tn = document.createTextNode(outerSpill);
        inlineEl.parentNode?.insertBefore(tn, inlineEl);
        if (inOpen) {
          if (caretOff <= outerSpill.length) {
            placeCaret(tn, caretOff);
          } else if (openSpan.firstChild) {
            placeCaret(openSpan.firstChild, caretOff - outerSpill.length);
          }
        }
        openText = "[";
      }
    }

    const urlSpan = closeSpan.querySelector(`[${MD_URL_ATTR}="true"]`);
    const lastCloseChild = closeSpan.lastChild;
    if (
      urlSpan &&
      lastCloseChild &&
      lastCloseChild.nodeType === Node.TEXT_NODE &&
      lastCloseChild.previousSibling === urlSpan
    ) {
      const tailText = (lastCloseChild.nodeValue || "").replace(/\u200B/g, "");
      if (tailText.length > 1 && tailText.startsWith(")")) {
        const outerSpill = tailText.slice(1);
        const inTail = Boolean(range && range.startContainer === lastCloseChild);
        const caretOff = inTail && range ? range.startOffset : 0;
        lastCloseChild.nodeValue = ")";
        const tn = document.createTextNode(outerSpill);
        inlineEl.parentNode?.insertBefore(tn, inlineEl.nextSibling);
        if (inTail) {
          if (caretOff >= 1) {
            placeCaret(tn, caretOff - 1);
          } else {
            placeCaret(lastCloseChild, caretOff);
          }
        }
      }
    }

    const closeText = (closeSpan.textContent || "").replace(/\u200B/g, "");
    if (openText !== "[" || !urlSpan || !closeText.startsWith("](") || !closeText.endsWith(")")) {
      unwrapBrokenInlineToPlainText(inlineEl);
      return;
    }
    const safeHref = sanitizeHttpUrl((urlSpan.textContent || "").replace(/\u200B/g, ""));
    if (safeHref) {
      inlineEl.setAttribute("href", safeHref);
    }
    return;
  }

  const rule = INLINE_LIVE_RULES[tag];
  if (!rule) return;
  const expected = rule.delimiter;
  const openSpan = getDirectSyntaxChild(inlineEl, "open");
  const closeSpan = getDirectSyntaxChild(inlineEl, "close");
  if (!openSpan || !closeSpan) {
    unwrapBrokenInlineToPlainText(inlineEl);
    return;
  }

  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

  // Handle typing spilling inside openSpan (e.g. "`foo" -> openSpan="`", push "foo" inside el;
  // or "bar`" -> push "bar" before el).
  let openVal = (openSpan.textContent || "").replace(/\u200B/g, "");
  if (openVal.length > expected.length) {
    const inOpen = Boolean(range && openSpan.contains(range.startContainer));
    const caretOff =
      inOpen && range
        ? getLogicalCaretOffsetInNode(openSpan, range.startContainer, range.startOffset)
        : 0;
    if (openVal.startsWith(expected)) {
      const innerSpill = openVal.slice(expected.length);
      openSpan.textContent = expected;
      const tn = document.createTextNode(innerSpill);
      inlineEl.insertBefore(tn, openSpan.nextSibling);
      if (inOpen) {
        if (caretOff > expected.length) {
          placeCaret(tn, caretOff - expected.length);
        } else if (openSpan.firstChild) {
          placeCaret(openSpan.firstChild, caretOff);
        }
      }
      openVal = expected;
    } else if (openVal.endsWith(expected)) {
      const outerSpill = openVal.slice(0, openVal.length - expected.length);
      openSpan.textContent = expected;
      const tn = document.createTextNode(outerSpill);
      inlineEl.parentNode?.insertBefore(tn, inlineEl);
      if (inOpen) {
        if (caretOff <= outerSpill.length) {
          placeCaret(tn, caretOff);
        } else if (openSpan.firstChild) {
          placeCaret(openSpan.firstChild, caretOff - outerSpill.length);
        }
      }
      openVal = expected;
    }
  }

  // Handle typing spilling inside/after closeSpan ("` hello" -> push " hello" outside inlineEl;
  // "hello`" -> push "hello" inside inlineEl before closeSpan).
  let closeVal = (closeSpan.textContent || "").replace(/\u200B/g, "");
  if (closeVal.length > expected.length) {
    const inClose = Boolean(range && closeSpan.contains(range.startContainer));
    const caretOff =
      inClose && range
        ? getLogicalCaretOffsetInNode(closeSpan, range.startContainer, range.startOffset)
        : 0;
    if (closeVal.startsWith(expected)) {
      const outerSpill = closeVal.slice(expected.length);
      closeSpan.textContent = expected;
      const tn = document.createTextNode(outerSpill);
      inlineEl.parentNode?.insertBefore(tn, inlineEl.nextSibling);
      if (inClose) {
        if (caretOff >= expected.length) {
          placeCaret(tn, caretOff - expected.length);
        } else if (closeSpan.firstChild) {
          placeCaret(closeSpan.firstChild, caretOff);
        }
      }
      closeVal = expected;
    } else if (closeVal.endsWith(expected)) {
      const innerSpill = closeVal.slice(0, closeVal.length - expected.length);
      closeSpan.textContent = expected;
      const tn = document.createTextNode(innerSpill);
      inlineEl.insertBefore(tn, closeSpan);
      if (inClose) {
        if (caretOff <= innerSpill.length) {
          placeCaret(tn, caretOff);
        } else if (closeSpan.firstChild) {
          placeCaret(closeSpan.firstChild, caretOff - innerSpill.length);
        }
      }
      closeVal = expected;
    }
  }

  if (openVal !== expected || closeVal !== expected) {
    unwrapBrokenInlineToPlainText(inlineEl);
  }
}

/**
 * Reconciles user edits made while syntax markers (`### `, `` ` ``, `**`, `~~`, `==`, `> `, `[label](url)`)
 * are visible, dynamically changing heading levels or unwrapping broken delimiters.
 */
export function reconcileActiveMarkdownSyntax(editor: HTMLElement): void {
  const actives = Array.from(
    editor.querySelectorAll(`[${MD_ACTIVE_ATTR}="true"]`),
  ) as HTMLElement[];
  for (let i = actives.length - 1; i >= 0; i -= 1) {
    const el = actives[i]!;
    if (!el.isConnected) continue;
    const tag = el.tagName.toLowerCase();
    if (HEADING_TAG_SET.has(tag) || tag === "blockquote") {
      reconcileBlockSyntax(editor, el);
    } else if (INLINE_MARK_TAGS.has(tag)) {
      reconcileInlineElement(el);
    }
  }
}

interface InlineRegexMatch {
  startIdx: number;
  endIdx: number;
  createEl: () => HTMLElement;
}

function matchInlineMarkdownBeforeCaret(before: string): InlineRegexMatch | null {
  // 1. Markdown Link `[label](https://url)`
  const linkMatch = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(before);
  if (linkMatch) {
    const safeHref = sanitizeHttpUrl(linkMatch[2]!);
    if (safeHref) {
      const label = linkMatch[1]!;
      return {
        startIdx: linkMatch.index,
        endIdx: linkMatch.index + linkMatch[0].length,
        createEl: () => {
          const a = document.createElement("a");
          a.href = safeHref;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = label;
          return a;
        },
      };
    }
  }

  // 2. Inline code `` `code` ``
  const codeMatch = /`([^`\n]+)`$/.exec(before);
  if (codeMatch && codeMatch[1]!.replace(/\u200B/g, "").length > 0) {
    const content = codeMatch[1]!;
    return {
      startIdx: codeMatch.index,
      endIdx: codeMatch.index + codeMatch[0].length,
      createEl: () => {
        const el = document.createElement("code");
        el.textContent = content;
        return el;
      },
    };
  }

  // 3. Highlight `==text==`
  const markMatch = /==([^=\n]*\S[^=\n]*)==$/.exec(before);
  if (markMatch) {
    const content = markMatch[1]!;
    return {
      startIdx: markMatch.index,
      endIdx: markMatch.index + markMatch[0].length,
      createEl: () => {
        const el = document.createElement("mark");
        el.textContent = content;
        return el;
      },
    };
  }

  // 4. Bold `**text**` or `__text__`
  const boldStar = /\*\*([^* \n](?:[^*\n]*?[^* \n])?)\*\*$/.exec(before);
  const boldUnder = /__([^_ \n](?:[^_\n]*?[^_ \n])?)__$/.exec(before);
  const boldMatch = boldStar || boldUnder;
  if (boldMatch) {
    const content = boldMatch[1]!;
    return {
      startIdx: boldMatch.index,
      endIdx: boldMatch.index + boldMatch[0].length,
      createEl: () => {
        const el = document.createElement("strong");
        el.textContent = content;
        return el;
      },
    };
  }

  // 5. Strikethrough `~~text~~`
  const strikeMatch = /~~([^~ \n](?:[^~\n]*?[^~ \n])?)~~$/.exec(before);
  if (strikeMatch) {
    const content = strikeMatch[1]!;
    return {
      startIdx: strikeMatch.index,
      endIdx: strikeMatch.index + strikeMatch[0].length,
      createEl: () => {
        const el = document.createElement("s");
        el.textContent = content;
        return el;
      },
    };
  }

  // 6. Italic `*text*` or `_text_` (boundary-safe against `**bold*` and `snake_case`)
  const italicStar = /(?:^|([^*]))\*([^\s*](?:[^*\n]*?[^\s*])?)\*$/.exec(before);
  if (italicStar) {
    const prefixLen = italicStar[1] ? italicStar[1].length : 0;
    const content = italicStar[2]!;
    return {
      startIdx: italicStar.index + prefixLen,
      endIdx: italicStar.index + italicStar[0].length,
      createEl: () => {
        const el = document.createElement("em");
        el.textContent = content;
        return el;
      },
    };
  }

  const italicUnder = /(?:^|([^\w_]))_([^\s_](?:[^_\n]*?[^\s_])?)_$/.exec(before);
  if (italicUnder) {
    const prefixLen = italicUnder[1] ? italicUnder[1].length : 0;
    const content = italicUnder[2]!;
    return {
      startIdx: italicUnder.index + prefixLen,
      endIdx: italicUnder.index + italicUnder[0].length,
      createEl: () => {
        const el = document.createElement("em");
        el.textContent = content;
        return el;
      },
    };
  }

  return null;
}

export function applyInlineMarkdownAtCaret(editor: HTMLElement): boolean {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return false;

  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  if (isInsideTag(node, editor, ["pre", "code", "a"])) return false;
  if (isInsideMarkdownSyntax(node, editor)) return false;

  const textNode = node as Text;
  const val = textNode.nodeValue || "";
  const offset = range.startOffset;
  const before = val.slice(0, offset);
  const after = val.slice(offset);

  const matched = matchInlineMarkdownBeforeCaret(before);
  if (!matched) return false;

  const beforeText = val.slice(0, matched.startIdx);
  const inlineEl = matched.createEl();
  const parent = textNode.parentNode;
  if (!parent) return false;

  if (beforeText) {
    parent.insertBefore(document.createTextNode(beforeText), textNode);
  }
  parent.insertBefore(inlineEl, textNode);

  if (after) {
    const afterNode = document.createTextNode(after);
    parent.insertBefore(afterNode, textNode);
    parent.removeChild(textNode);
    placeCaret(afterNode, 0);
  } else {
    const anchor = document.createTextNode("\u200B");
    parent.insertBefore(anchor, textNode);
    parent.removeChild(textNode);
    placeCaret(anchor, 1);
  }
  return true;
}

function isDelimiterOpenAllowed(beforeText: string): boolean {
  if (beforeText.endsWith("\\")) return false;
  if (beforeText.length === 0) return true;
  const ch = beforeText.slice(-1);
  return /[\s([\]{}"'`>–—\-/]/.test(ch);
}

function countUnpairedToken(before: string, token: string): number {
  let count = 0;
  for (let i = 0; i <= before.length - token.length; i += 1) {
    if (before[i] === "\\") {
      i += 1;
      continue;
    }
    if (before.slice(i, i + token.length) === token) {
      count += 1;
      i += token.length - 1;
    }
  }
  return count;
}

function getInlineAtCaretForOvertype(
  editor: HTMLElement,
  range: Range,
): { inlineEl: HTMLElement; closeSpan: HTMLSpanElement; charIndexInClose: number } | null {
  const inSyntax = isInsideMarkdownSyntax(range.startContainer, editor);
  if (inSyntax && inSyntax.getAttribute(MD_SYNTAX_ATTR) === "close") {
    const parent = inSyntax.parentElement;
    if (parent && INLINE_MARK_TAGS.has(parent.tagName.toLowerCase())) {
      const charIdx = range.startContainer.nodeType === Node.TEXT_NODE ? range.startOffset : 0;
      return { inlineEl: parent, closeSpan: inSyntax, charIndexInClose: charIdx };
    }
  }

  let curr: Node | null = range.startContainer;
  let innerEl: HTMLElement | null = null;
  while (curr && curr !== editor) {
    if (curr.nodeType === Node.ELEMENT_NODE) {
      const el = curr as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (BLOCK_TAG_SET.has(tag)) break;
      if (INLINE_MARK_TAGS.has(tag)) {
        innerEl = el;
        break;
      }
    }
    curr = curr.parentNode;
  }
  if (!innerEl) return null;

  const closeSpan = getDirectSyntaxChild(innerEl, "close");
  if (!closeSpan) return null;

  const probe = document.createRange();
  probe.setStart(range.startContainer, range.startOffset);
  probe.setEndBefore(closeSpan);
  if (
    probe.toString().replace(/\u200B/g, "").length === 0 &&
    !probe.cloneContents().querySelector("img, br")
  ) {
    return { inlineEl: innerEl, closeSpan, charIndexInClose: 0 };
  }
  return null;
}

function stepOutAfterInline(editor: HTMLElement, inlineEl: HTMLElement): void {
  const parent = inlineEl.parentNode;
  if (!parent) return;
  let next = inlineEl.nextSibling;
  while (
    next &&
    next.nodeType === Node.ELEMENT_NODE &&
    (next as HTMLElement).hasAttribute("data-ghost")
  ) {
    next = next.nextSibling;
  }

  if (next && next.nodeType === Node.TEXT_NODE) {
    const tn = next as Text;
    const val = tn.nodeValue || "";
    if (val.startsWith("\u200B")) {
      placeCaret(tn, 1);
      syncLiveMarkdownSyntax(editor);
      return;
    }
    if (val.length > 0) {
      placeCaret(tn, 0);
      syncLiveMarkdownSyntax(editor);
      return;
    }
  }

  const anchor = document.createTextNode("\u200B");
  parent.insertBefore(anchor, next);
  placeCaret(anchor, 1);
  syncLiveMarkdownSyntax(editor);
}

function insertActiveInlinePair(
  editor: HTMLElement,
  range: Range,
  tag: "code" | "strong" | "em" | "s" | "mark",
  delimiter: string,
): boolean {
  const el = document.createElement(tag);
  el.setAttribute(MD_ACTIVE_ATTR, "true");
  const openSpan = createSyntaxSpan("open", delimiter);
  const anchor = document.createTextNode("\u200B");
  const closeSpan = createSyntaxSpan("close", delimiter);
  el.appendChild(openSpan);
  el.appendChild(anchor);
  el.appendChild(closeSpan);

  range.deleteContents();
  range.insertNode(el);
  placeCaret(anchor, 1);
  syncLiveMarkdownSyntax(editor);
  return true;
}

function upgradeEmptyItalicToBold(editor: HTMLElement, emEl: HTMLElement): boolean {
  const strong = document.createElement("strong");
  strong.setAttribute(MD_ACTIVE_ATTR, "true");
  const openSpan = createSyntaxSpan("open", "**");
  const anchor = document.createTextNode("\u200B");
  const closeSpan = createSyntaxSpan("close", "**");
  strong.appendChild(openSpan);
  strong.appendChild(anchor);
  strong.appendChild(closeSpan);
  emEl.replaceWith(strong);
  placeCaret(anchor, 1);
  syncLiveMarkdownSyntax(editor);
  return true;
}

export function wrapSelectionWithDelimiter(editor: HTMLElement, key: string): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return false;
  if (isInsideTag(range.commonAncestorContainer, editor, ["pre", "code"])) return false;

  const selectedText = range.toString();
  if (!selectedText) return false;

  if (key === "`" || key === "*") {
    const tag = key === "`" ? "code" : "em";
    const delimiter = key;
    const el = document.createElement(tag);
    el.setAttribute(MD_ACTIVE_ATTR, "true");
    const openSpan = createSyntaxSpan("open", delimiter);
    const contentNode = document.createTextNode(selectedText);
    const closeSpan = createSyntaxSpan("close", delimiter);
    el.appendChild(openSpan);
    el.appendChild(contentNode);
    el.appendChild(closeSpan);
    range.deleteContents();
    range.insertNode(el);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(contentNode);
    sel.removeAllRanges();
    sel.addRange(nextRange);
    syncLiveMarkdownSyntax(editor);
    return true;
  }

  const pair = SELECTION_WRAP_DELIMITERS[key];
  if (!pair) return false;

  const wrappedNode = document.createTextNode(`${pair[0]}${selectedText}${pair[1]}`);
  range.deleteContents();
  range.insertNode(wrappedNode);
  const nextRange = document.createRange();
  nextRange.setStart(wrappedNode, pair[0].length);
  nextRange.setEnd(wrappedNode, pair[0].length + selectedText.length);
  sel.removeAllRanges();
  sel.addRange(nextRange);
  return true;
}

/**
 * Handles Obsidian-style auto-pairing, overtyping closing delimiters, and selection wrapping
 * for `` ` ``, `*`, `~`, `=`, `(`, `)`, `[`, `]`, and `"`.
 */
export function handleMarkdownDelimiterKeyDown(editor: HTMLElement, key: string): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;

  if (!range.collapsed) {
    if (["(", "[", '"', "`", "*"].includes(key)) {
      return wrapSelectionWithDelimiter(editor, key);
    }
    return false;
  }

  if (isInsideTag(range.startContainer, editor, ["pre"])) return false;

  // 1. Overtyping closing bracket/quote characters (`)`, `]`, `"`).
  if (CLOSING_PLAIN_PAIR_CHARS.has(key) && range.startContainer.nodeType === Node.TEXT_NODE) {
    const tn = range.startContainer as Text;
    const val = tn.nodeValue || "";
    const off = range.startOffset;
    if (val[off] === key) {
      placeCaret(tn, off + 1);
      // Completing `)` in `[label](https://...)` immediately upgrades into rendered link!
      if (key === ")") {
        applyInlineMarkdownAtCaret(editor);
      }
      syncLiveMarkdownSyntax(editor);
      return true;
    }
  }

  // 2. Check if caret sits at the closing delimiter of an active inline mark (for overtype or ```` ``` ````).
  const overtype = getInlineAtCaretForOvertype(editor, range);
  if (overtype) {
    const { inlineEl, closeSpan, charIndexInClose } = overtype;
    const tag = inlineEl.tagName.toLowerCase();
    const rule = INLINE_LIVE_RULES[tag];
    if (rule && rule.delimiter[0] === key) {
      const innerEmpty = getTextWithoutArtifacts(inlineEl).length === 0;

      // Empty `*|*` + `*` -> upgrade to bold `**|**`!
      if (tag === "em" && key === "*" && innerEmpty) {
        return upgradeEmptyItalicToBold(editor, inlineEl);
      }

      // Empty `` `|` `` at start of an empty paragraph + `` ` `` -> degrade to plain `` `` `` for fenced code blocks!
      if (tag === "code" && key === "`" && innerEmpty) {
        const block = getClosestBlock(inlineEl, editor);
        if (
          block &&
          ["p", "div"].includes(block.tagName.toLowerCase()) &&
          getTextWithoutArtifacts(block).length === 0 &&
          block.querySelectorAll("img").length === 0
        ) {
          const tn = document.createTextNode("``");
          inlineEl.replaceWith(tn);
          placeCaret(tn, 2);
          syncLiveMarkdownSyntax(editor);
          return true;
        }
      }

      // Overtype across single- or multi-char delimiter (`*` inside `**`, `` ` `` inside `` ` ``, etc.)
      if (charIndexInClose + 1 < rule.delimiter.length) {
        const closeTextNode = closeSpan.firstChild;
        if (closeTextNode) {
          placeCaret(closeTextNode, charIndexInClose + 1);
          return true;
        }
      }

      if (innerEmpty) {
        // Exiting an empty pair removes the empty element cleanly.
        const parent = inlineEl.parentNode;
        const next = inlineEl.nextSibling;
        inlineEl.remove();
        if (parent) {
          if (next && next.nodeType === Node.TEXT_NODE) {
            placeCaret(next, 0);
          } else {
            const pBlock = parent instanceof HTMLElement ? parent : null;
            if (pBlock && !hasVisibleContent(pBlock)) {
              ensureElementHasBreakIfEmpty(pBlock);
              placeCaretAtStart(pBlock);
            } else {
              const fallback = document.createTextNode("\u200B");
              parent.insertBefore(fallback, next);
              placeCaret(fallback, 1);
            }
          }
        }
        syncLiveMarkdownSyntax(editor);
        return true;
      }

      stepOutAfterInline(editor, inlineEl);
      return true;
    }
  }

  // Don't auto-pair inside existing `<code>` or `[data-md-syntax]`.
  if (isInsideTag(range.startContainer, editor, ["code"])) return false;
  if (isInsideMarkdownSyntax(range.startContainer, editor)) return false;

  const beforeInNode =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? (range.startContainer.nodeValue || "").slice(0, range.startOffset).replace(/\u200B/g, "")
      : "";

  // 3. Auto-pair `` ` `` -> `` `|` `` (unless closing an earlier unclosed `` ` `` in the same text node!)
  if (key === "`") {
    if (beforeInNode.endsWith("\\")) return false;
    if (countUnpairedToken(beforeInNode, "`") % 2 === 1) {
      // Let browser insert the closing backtick so `applyInlineMarkdownAtCaret` closes cleanly!
      return false;
    }
    return insertActiveInlinePair(editor, range, "code", "`");
  }

  // 4. Auto-pair `*` -> `*|*` (only at clean boundary; never mid-word like `2*3`, and never if closing an odd `*`).
  if (key === "*") {
    if (!isDelimiterOpenAllowed(beforeInNode)) return false;
    const starCount = countUnpairedToken(beforeInNode.replace(/\*\*/g, ""), "*");
    if (starCount % 2 === 1) return false;
    return insertActiveInlinePair(editor, range, "em", "*");
  }

  // 5. Auto-pair `~~` (`~~|~~`) and `==` (`==|==`) on the 2nd consecutive char when opening!
  if ((key === "~" || key === "=") && range.startContainer.nodeType === Node.TEXT_NODE) {
    if (beforeInNode.endsWith(key)) {
      const prefixBeforeFirst = beforeInNode.slice(0, -1);
      if (prefixBeforeFirst.endsWith(key)) return false;
      if (!isDelimiterOpenAllowed(prefixBeforeFirst)) return false;

      const tn = range.startContainer as Text;
      const off = range.startOffset;
      const val = tn.nodeValue || "";
      const tag = key === "~" ? "s" : "mark";
      const delim = `${key}${key}`;

      tn.nodeValue = val.slice(0, off - 1) + val.slice(off);
      const nextR = document.createRange();
      nextR.setStart(tn, off - 1);
      nextR.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nextR);
      return insertActiveInlinePair(editor, nextR, tag, delim);
    }
    return false;
  }

  // 6. Auto-pair plain brackets/quotes `(`, `[`, `"`.
  const plainPair = COLLAPSED_PLAIN_PAIRS[key];
  if (plainPair) {
    if (key === '"') {
      if (!isDelimiterOpenAllowed(beforeInNode)) return false;
      if (countUnpairedToken(beforeInNode, '"') % 2 === 1) return false;
    } else if (key === "(" || key === "[") {
      // Allow `[` after whitespace/punctuation, and `(` directly after `]` (links!) or whitespace/punctuation.
      const prevCh = beforeInNode.slice(-1);
      const allowParenAfterLinkLabel = key === "(" && prevCh === "]";
      if (!allowParenAfterLinkLabel && !isDelimiterOpenAllowed(beforeInNode)) return false;
    }

    const pairNode = document.createTextNode(`${plainPair[0]}${plainPair[1]}`);
    range.deleteContents();
    range.insertNode(pairNode);
    placeCaret(pairNode, 1);
    return true;
  }

  return false;
}

/**
 * Unwraps an empty auto-paired inline element (`*|*`, `**|**`, `~~|~~`, `==|==`) back into
 * plain delimiter text when the user presses Space immediately inside it, so `* ` lists and
 * spaced symbols (`2 * 3`) continue to work naturally.
 */
export function unwrapEmptyInlinePairOnSpace(editor: HTMLElement): boolean {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return false;

  const overtype = getInlineAtCaretForOvertype(editor, range);
  if (!overtype) return false;

  const tag = overtype.inlineEl.tagName.toLowerCase();
  if (!["em", "strong", "s", "mark"].includes(tag)) return false;
  if (getTextWithoutArtifacts(overtype.inlineEl).length > 0) return false;

  const rule = INLINE_LIVE_RULES[tag];
  if (!rule) return false;

  const tn = document.createTextNode(rule.delimiter);
  overtype.inlineEl.replaceWith(tn);
  placeCaret(tn, rule.delimiter.length);
  return true;
}

/**
 * Handles smart Backspace inside empty pairs (deletes both delimiters at once) and at the
 * boundary immediately after heading/blockquote/inline syntax markers.
 */
export function handleMarkdownDelimiterBackspace(editor: HTMLElement): boolean {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return false;
  if (isInsideTag(range.startContainer, editor, ["pre"])) return false;

  // 1. Inside an empty plain pair `(|)`, `[|]`, `"|"` -> delete both!
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const tn = range.startContainer as Text;
    const val = tn.nodeValue || "";
    const off = range.startOffset;
    if (off > 0 && off < val.length) {
      const prevCh = val[off - 1];
      const nextCh = val[off];
      if (
        (prevCh === "(" && nextCh === ")") ||
        (prevCh === "[" && nextCh === "]") ||
        (prevCh === '"' && nextCh === '"')
      ) {
        tn.nodeValue = val.slice(0, off - 1) + val.slice(off + 1);
        placeCaret(tn, off - 1);
        return true;
      }
    }
  }

  // 2. Trailing zero-width exit anchor right after an inline mark: step into its closing delimiter
  //    and erase one closing delimiter character so Backspace unwraps like Obsidian without a dead key.
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const tn = range.startContainer as Text;
    if ((tn.nodeValue || "") === "\u200B" && range.startOffset === 1) {
      const prev = tn.previousSibling;
      if (
        prev &&
        prev.nodeType === Node.ELEMENT_NODE &&
        INLINE_MARK_TAGS.has((prev as HTMLElement).tagName.toLowerCase())
      ) {
        const prevInline = prev as HTMLElement;
        tn.remove();
        activateInlineElement(prevInline, null);
        const closeSpan = getDirectSyntaxChild(prevInline, "close");
        const lastText = closeSpan ? getLastDescendantTextNode(closeSpan) : null;
        if (lastText && (lastText.nodeValue || "").length > 0) {
          const val = lastText.nodeValue || "";
          lastText.nodeValue = val.slice(0, -1);
          placeCaret(lastText, lastText.nodeValue.length);
          reconcileActiveMarkdownSyntax(editor);
          syncLiveMarkdownSyntax(editor);
          return true;
        }
        placeCaretAtEnd(prevInline);
        syncLiveMarkdownSyntax(editor);
        return false;
      }
    }
  }

  // 3. Inside an active inline mark.
  let activeInline: HTMLElement | null = null;
  let curr: Node | null = range.startContainer;
  while (curr && curr !== editor) {
    if (curr.nodeType === Node.ELEMENT_NODE) {
      const el = curr as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (BLOCK_TAG_SET.has(tag)) break;
      if (INLINE_MARK_TAGS.has(tag) && el.hasAttribute(MD_ACTIVE_ATTR)) {
        activeInline = el;
        break;
      }
    }
    curr = curr.parentNode;
  }

  if (activeInline) {
    const openSpan = getDirectSyntaxChild(activeInline, "open");
    const closeSpan = getDirectSyntaxChild(activeInline, "close");

    // Empty active inline pair (not inside openSpan) -> delete the entire pair!
    if (
      getTextWithoutArtifacts(activeInline).length === 0 &&
      !activeInline.querySelector("img") &&
      (!openSpan || !openSpan.contains(range.startContainer))
    ) {
      const parent = activeInline.parentNode;
      const prevSib = activeInline.previousSibling;
      const nextSib = activeInline.nextSibling;
      activeInline.remove();
      if (prevSib && prevSib.nodeType === Node.TEXT_NODE) {
        placeCaret(prevSib, prevSib.nodeValue?.length ?? 0);
      } else if (nextSib && nextSib.nodeType === Node.TEXT_NODE) {
        placeCaret(nextSib, 0);
      } else if (parent instanceof HTMLElement) {
        ensureElementHasBreakIfEmpty(parent);
        placeCaretAtStart(parent);
      }
      syncLiveMarkdownSyntax(editor);
      return true;
    }

    // Caret sits right after `<span data-md-syntax="open">` on non-empty inline mark -> remove 1 char from openSpan!
    if (
      openSpan &&
      !openSpan.contains(range.startContainer) &&
      !closeSpan?.contains(range.startContainer)
    ) {
      const probe = document.createRange();
      probe.setStartAfter(openSpan);
      probe.setEnd(range.startContainer, range.startOffset);
      if (
        probe.toString().replace(/\u200B/g, "").length === 0 &&
        !probe.cloneContents().querySelector("img, br")
      ) {
        const openTxt = openSpan.textContent || "";
        if (openTxt.length > 0) {
          openSpan.textContent = openTxt.slice(0, -1);
          reconcileActiveMarkdownSyntax(editor);
          syncLiveMarkdownSyntax(editor);
          return true;
        }
      }
    }
  }

  // 3. Heading or Blockquote: caret immediately after `<span data-md-syntax="heading|blockquote">` -> delete space & unwrap to `<p>`.
  const block = getClosestBlock(range.startContainer, editor);
  if (block && block.hasAttribute(MD_ACTIVE_ATTR)) {
    const spec = getBlockSyntaxPrefix(block);
    const blockSpan = spec ? getDirectSyntaxChild(block, spec.kind) : null;
    if (blockSpan && !blockSpan.contains(range.startContainer)) {
      const probe = document.createRange();
      probe.setStartAfter(blockSpan);
      probe.setEnd(range.startContainer, range.startOffset);
      if (
        probe.toString().replace(/\u200B/g, "").length === 0 &&
        !probe.cloneContents().querySelector("img, br")
      ) {
        const spanText = (blockSpan.textContent || "").replace(/\u00A0/g, " ");
        if (spanText.endsWith(" ")) {
          blockSpan.textContent = spanText.slice(0, -1);
          if (blockSpan.firstChild) {
            placeCaret(blockSpan.firstChild, blockSpan.textContent.length);
          }
          reconcileActiveMarkdownSyntax(editor);
          syncLiveMarkdownSyntax(editor);
          return true;
        }
      }
    }
  }

  return false;
}

export function toggleInlineWrapperCommand(
  editor: HTMLElement,
  tagName: "code" | "mark" | "s",
): boolean {
  if (tagName === "s") {
    stripSyntaxBeforeExecCommand(editor);
    document.execCommand("strikeThrough", false);
    syncLiveMarkdownSyntax(editor);
    return true;
  }

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;

  const existing = isInsideTag(range.commonAncestorContainer, editor, [tagName]);
  if (existing) {
    existing.querySelectorAll(`:scope > [${MD_SYNTAX_ATTR}]`).forEach((s) => s.remove());
    const text = (existing.textContent || "").replace(/\u200B/g, "");
    const tn = document.createTextNode(text);
    existing.parentNode?.replaceChild(tn, existing);
    const nextRange = document.createRange();
    nextRange.setStart(tn, 0);
    nextRange.setEnd(tn, text.length);
    sel.removeAllRanges();
    sel.addRange(nextRange);
    syncLiveMarkdownSyntax(editor);
    return true;
  }

  if (range.collapsed) return false;
  if (isInsideTag(range.commonAncestorContainer, editor, ["pre"])) return false;

  const selectedText = range.toString();
  if (!selectedText) return false;

  const el = document.createElement(tagName);
  el.textContent = selectedText;
  range.deleteContents();
  range.insertNode(el);
  const nextRange = document.createRange();
  nextRange.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(nextRange);
  syncLiveMarkdownSyntax(editor);
  return true;
}

/**
 * Cleans live syntax markers right before calling `document.execCommand` (toolbar Bold/Italic/etc.)
 * so browser commands wrap content without cloning or styling syntax delimiter spans.
 */
export function stripSyntaxBeforeExecCommand(editor: HTMLElement): void {
  const bookmark = getCaretBookmark(editor);
  const actives = Array.from(
    editor.querySelectorAll(`[${MD_ACTIVE_ATTR}="true"]`),
  ) as HTMLElement[];
  for (let i = actives.length - 1; i >= 0; i -= 1) {
    deactivateElement(editor, actives[i]!);
  }
  if (bookmark) {
    restoreCaretBookmark(editor, bookmark);
  }
}

export function wrapSelectionAsLink(editor: HTMLElement, rawUrl: string): boolean {
  const safeHref = sanitizeHttpUrl(rawUrl);
  if (!safeHref) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return false;

  const label = range.toString().trim();
  if (!label) return false;

  const a = document.createElement("a");
  a.href = safeHref;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = label;

  range.deleteContents();
  range.insertNode(a);
  const anchor = document.createTextNode("\u200B");
  a.parentNode?.insertBefore(anchor, a.nextSibling);
  placeCaret(anchor, 1);
  syncLiveMarkdownSyntax(editor);
  return true;
}

function isInlineContentEdge(
  inlineEl: HTMLElement,
  range: Range,
  edge: "start" | "end",
  options?: { allowBeforeClose?: boolean },
): boolean {
  const openSpan = getDirectSyntaxChild(inlineEl, "open");
  const closeSpan = getDirectSyntaxChild(inlineEl, "close");

  if (edge === "end") {
    if (closeSpan?.contains(range.startContainer)) {
      const tailProbe = document.createRange();
      tailProbe.setStart(range.startContainer, range.startOffset);
      tailProbe.setEnd(closeSpan, closeSpan.childNodes.length);
      return tailProbe.toString().replace(/\u200B/g, "").length === 0;
    }
    if (closeSpan && !options?.allowBeforeClose) {
      return false;
    }
    const probe = document.createRange();
    probe.setStart(range.startContainer, range.startOffset);
    if (closeSpan) {
      probe.setEndBefore(closeSpan);
    } else {
      probe.setEnd(inlineEl, inlineEl.childNodes.length);
    }
    if (probe.toString().replace(/\u200B/g, "").length > 0) return false;
    return !probe.cloneContents().querySelector("img, br");
  }

  if (openSpan?.contains(range.startContainer)) {
    const headProbe = document.createRange();
    headProbe.setStart(openSpan, 0);
    headProbe.setEnd(range.startContainer, range.startOffset);
    return headProbe.toString().replace(/\u200B/g, "").length === 0;
  }
  if (openSpan && !options?.allowBeforeClose) {
    return false;
  }

  const probe = document.createRange();
  if (openSpan) {
    probe.setStartAfter(openSpan);
  } else {
    probe.setStart(inlineEl, 0);
  }
  probe.setEnd(range.startContainer, range.startOffset);
  if (probe.toString().replace(/\u200B/g, "").length > 0) return false;
  return !probe.cloneContents().querySelector("img, br");
}

function findOuterInlineAtEdge(
  editor: HTMLElement,
  range: Range,
  edge: "start" | "end",
  options?: { allowBeforeClose?: boolean },
): HTMLElement | null {
  if (isInsideTag(range.startContainer, editor, ["pre"])) return null;

  let outer: HTMLElement | null = null;
  let curr: Node | null = range.startContainer;
  while (curr && curr !== editor) {
    if (curr.nodeType === Node.ELEMENT_NODE) {
      const el = curr as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (BLOCK_TAG_SET.has(tag)) break;
      if (INLINE_MARK_TAGS.has(tag)) {
        if (!isInlineContentEdge(el, range, edge, options)) break;
        outer = el;
      }
    }
    curr = curr.parentNode;
  }
  return outer;
}

function moveCaretAfterInline(inlineEl: HTMLElement): boolean {
  const parent = inlineEl.parentNode;
  if (!parent) return false;
  let next = inlineEl.nextSibling;
  while (
    next &&
    next.nodeType === Node.ELEMENT_NODE &&
    (next as HTMLElement).hasAttribute("data-ghost")
  ) {
    next = next.nextSibling;
  }

  if (next && next.nodeType === Node.TEXT_NODE) {
    const tn = next as Text;
    const val = tn.nodeValue || "";
    if (val.startsWith("\u200B")) {
      placeCaret(tn, 1);
      return true;
    }
  }

  const anchor = document.createTextNode("\u200B");
  parent.insertBefore(anchor, next);
  placeCaret(anchor, 1);
  return true;
}

function moveCaretBeforeInline(inlineEl: HTMLElement): boolean {
  const parent = inlineEl.parentNode;
  if (!parent) return false;
  const prev = inlineEl.previousSibling;

  if (prev && prev.nodeType === Node.TEXT_NODE) {
    const tn = prev as Text;
    const val = tn.nodeValue || "";
    if (val.endsWith("\u200B")) {
      placeCaret(tn, val.length - 1);
      return true;
    }
  }

  const anchor = document.createTextNode("\u200B");
  parent.insertBefore(anchor, inlineEl);
  placeCaret(anchor, 0);
  return true;
}

function enterInlineAtRightEdge(editor: HTMLElement, inlineEl: HTMLElement): void {
  activateInlineElement(inlineEl, null);
  const closeSpan = getDirectSyntaxChild(inlineEl, "close");
  if (closeSpan) {
    const lastText = getLastDescendantTextNode(closeSpan);
    if (lastText) {
      placeCaret(lastText, lastText.nodeValue?.length ?? 0);
      syncLiveMarkdownSyntax(editor);
      return;
    }
  }
  placeCaretAtEnd(inlineEl);
  syncLiveMarkdownSyntax(editor);
}

/**
 * Obsidian-style inline formatting navigation:
 * - ArrowRight at the end of content inside an active inline mark steps cleanly outside and hides markers.
 * - ArrowLeft immediately after an inline mark enters its closing syntax so delimiters can be edited or deleted.
 * - Transparently skips over `\u200B` boundary anchors.
 */
export function resolveInlineBoundaryOnArrow(
  editor: HTMLElement,
  key: "ArrowLeft" | "ArrowRight",
): boolean {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return false;
  if (isInsideTag(range.startContainer, editor, ["pre"])) return false;

  const node = range.startContainer;
  const offset = range.startOffset;

  if (key === "ArrowRight") {
    const outerRight = findOuterInlineAtEdge(editor, range, "end");
    if (outerRight) {
      moveCaretAfterInline(outerRight);
      syncLiveMarkdownSyntax(editor);
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const tn = node as Text;
      const val = tn.nodeValue || "";
      if (offset < val.length && val[offset] === "\u200B") {
        if (offset === val.length - 1) {
          const next = tn.nextSibling;
          if (
            next &&
            next.nodeType === Node.ELEMENT_NODE &&
            INLINE_MARK_TAGS.has((next as HTMLElement).tagName.toLowerCase())
          ) {
            const nextInline = next as HTMLElement;
            placeCaretAtStart(nextInline);
            syncLiveMarkdownSyntax(editor);
            return true;
          }
        }
        placeCaret(tn, offset + 1);
        return true;
      }
    }
    return false;
  }

  // key === "ArrowLeft"
  const outerLeft = findOuterInlineAtEdge(editor, range, "start");
  if (outerLeft) {
    moveCaretBeforeInline(outerLeft);
    syncLiveMarkdownSyntax(editor);
    return true;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const tn = node as Text;
    const val = tn.nodeValue || "";
    if (offset > 0 && val[offset - 1] === "\u200B") {
      if (offset === 1) {
        const prev = tn.previousSibling;
        if (
          prev &&
          prev.nodeType === Node.ELEMENT_NODE &&
          INLINE_MARK_TAGS.has((prev as HTMLElement).tagName.toLowerCase())
        ) {
          enterInlineAtRightEdge(editor, prev as HTMLElement);
          return true;
        }
      }
      if (offset > 1) {
        placeCaret(tn, offset - 1);
        return true;
      }
    } else if (offset === 0) {
      const prev = tn.previousSibling;
      if (
        prev &&
        prev.nodeType === Node.ELEMENT_NODE &&
        INLINE_MARK_TAGS.has((prev as HTMLElement).tagName.toLowerCase())
      ) {
        enterInlineAtRightEdge(editor, prev as HTMLElement);
        return true;
      }
    }
  }

  return false;
}

export function exitInlineMarkOnClick(editor: HTMLElement, clientX: number): boolean {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return false;
  if (isInsideTag(range.startContainer, editor, ["pre"])) return false;

  const outerRight = findOuterInlineAtEdge(editor, range, "end", { allowBeforeClose: true });
  if (!outerRight) return false;

  const block = getClosestBlock(outerRight, editor);
  if (block) {
    const tailRange = document.createRange();
    tailRange.setStartAfter(outerRight);
    tailRange.setEnd(block, block.childNodes.length);
    if (tailRange.toString().replace(/\u200B/g, "").length > 0) {
      return false;
    }
  }

  const rect = outerRight.getBoundingClientRect();
  if (rect.width > 0 && clientX > rect.right + 1) {
    const moved = moveCaretAfterInline(outerRight);
    if (moved) syncLiveMarkdownSyntax(editor);
    return moved;
  }
  return false;
}
