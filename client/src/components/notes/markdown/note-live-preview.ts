import {
  BLOCK_TAG_SET,
  HEADING_TAG_SET,
  HR_LINE_REGEX,
  INLINE_MARK_TAGS,
  MD_ACTIVE_ATTR,
  MD_HR_ACTIVE_ATTR,
  MD_HR_SYNTAX_ATTR,
  MD_SYNTAX_ATTR,
  MD_URL_ATTR,
  cleanTrailingEmptyNodes,
  convertStandaloneHrLines,
  doesRangeCrossElementScope,
  doesRangeOverlapElement,
  doesRangeOverlapHr,
  ensureElementHasBreakIfEmpty,
  getClosestBlock,
  getCollapsedSelectionRange,
  getEditableScope,
  getFirstEditableTarget,
  getLiOwnChildLimit,
  getTextWithoutArtifacts,
  getTopLevelBlock,
  hasOwnInlineContent,
  hasVisibleContent,
  isCaretAtBlockBoundaryStart,
  isCaretAtEndOfScope,
  isCaretAtStartOfScope,
  isCaretOnVisualEdgeLine,
  isInsideTag,
  isStandaloneHrBlock,
  normalizeEmptyBreak,
  placeCaret,
  placeCaretAtEnd,
  placeCaretAtStart,
  sanitizeHttpUrl,
  stripZeroWidth,
} from "./note-dom";
import {
  CODE_CLOSE_PREFIX_REGEX,
  CODE_OPEN_PREFIX_REGEX,
  INLINE_LIVE_RULES,
  applyLiMarkerAttrs,
  createLinkCloseSyntaxSpan,
  createListItemWithContent,
  createSyntaxSpan,
  createTaskListItem,
  getBlockSyntaxSpec,
  getDirectSyntaxChild,
  getLiBulletMarker,
  getLiDelimMarker,
  getOrderedListIndex,
  mergeListWithAdjacentSiblings,
  parseMarkdownBlockPrefix,
  splitListAroundItem,
} from "./note-specs";

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
    const isCaretInNode = Boolean(range && range.collapsed && range.startContainer === tn);
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

export interface SyncLiveMarkdownOptions {
  clearAll?: boolean;
  forcedPrefixBlocks?: ReadonlySet<HTMLElement>;
  revealAllPrefixBlocks?: boolean;
}

interface ActiveMarksSelection {
  activeBlocks: HTMLElement[];
  activeHrs: HTMLElement[];
  activeInlines: HTMLElement[];
}

function getActiveMarksForSelection(
  editor: HTMLElement,
  range: Range,
  options?: SyncLiveMarkdownOptions,
): ActiveMarksSelection {
  if (range.collapsed) {
    const preEl = isInsideTag(range.startContainer, editor, ["pre"]);
    if (preEl) {
      return { activeBlocks: [preEl], activeHrs: [], activeInlines: [] };
    }

    const startBlock = getClosestBlock(range.startContainer, editor);
    let activeBlocks: HTMLElement[] = [];
    if (startBlock) {
      if (startBlock.hasAttribute(MD_HR_ACTIVE_ATTR)) {
        activeBlocks = [startBlock];
      } else {
        const spec = getBlockSyntaxSpec(startBlock);
        if (spec?.revealMode === "line") {
          activeBlocks = [startBlock];
        } else if (spec?.revealMode === "prefix") {
          const syntaxSpan = getDirectSyntaxChild(startBlock, spec.kind);
          if (syntaxSpan && syntaxSpan.contains(range.startContainer)) {
            const cleanText = stripZeroWidth(
              (syntaxSpan.textContent || "").replace(/\u00A0/g, " "),
            );
            const caretOff = getLogicalCaretOffsetInNode(
              syntaxSpan,
              range.startContainer,
              range.startOffset,
            );
            if (caretOff < cleanText.length || !cleanText.endsWith(" ")) {
              activeBlocks = [startBlock];
            }
          }
        }
      }
    }

    const activeInlines: HTMLElement[] = [];
    let curr: Node | null = range.startContainer;
    while (curr && curr !== editor) {
      if (curr.nodeType === Node.ELEMENT_NODE) {
        const el = curr as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (BLOCK_TAG_SET.has(tag)) break;
        if (INLINE_MARK_TAGS.has(tag)) {
          activeInlines.push(el);
        }
      }
      curr = curr.parentNode;
    }

    return { activeBlocks, activeHrs: [], activeInlines };
  }

  const blockSelector = `h1, h2, h3, h4, h5, h6, blockquote, li, pre, [${MD_HR_ACTIVE_ATTR}]`;
  const activeBlocks = (Array.from(editor.querySelectorAll(blockSelector)) as HTMLElement[]).filter(
    (el) => {
      const tag = el.tagName.toLowerCase();
      if (tag !== "pre" && isInsideTag(el, editor, ["pre"])) return false;
      const limit = tag === "li" ? getLiOwnChildLimit(el) : undefined;
      if (!doesRangeOverlapElement(range, el, limit)) return false;

      if (el.hasAttribute(MD_HR_ACTIVE_ATTR)) return true;
      const spec = getBlockSyntaxSpec(el);
      if (!spec || spec.revealMode === "line") return true;

      if (options?.revealAllPrefixBlocks || options?.forcedPrefixBlocks?.has(el)) {
        return true;
      }
      const syntaxSpan = getDirectSyntaxChild(el, spec.kind);
      if (syntaxSpan && doesRangeOverlapElement(range, syntaxSpan)) {
        return true;
      }
      return doesRangeCrossElementScope(range, el, limit);
    },
  );

  const activeHrs = (Array.from(editor.querySelectorAll("hr")) as HTMLElement[]).filter(
    (hr) => !isInsideTag(hr, editor, ["pre"]) && doesRangeOverlapHr(range, hr),
  );

  const inlineSelector = "code, mark, strong, b, em, i, s, del, strike, a";
  const activeInlines = (
    Array.from(editor.querySelectorAll(inlineSelector)) as HTMLElement[]
  ).filter((el) => !el.closest("pre") && doesRangeOverlapElement(range, el));

  return { activeBlocks, activeHrs, activeInlines };
}

function expandHorizontalRule(hr: HTMLElement): HTMLElement {
  const syntaxAttr = hr.getAttribute(MD_HR_SYNTAX_ATTR);
  const hrText = syntaxAttr && HR_LINE_REGEX.test(syntaxAttr) ? syntaxAttr : "---";
  const p = document.createElement("p");
  p.setAttribute(MD_HR_ACTIVE_ATTR, hrText);
  p.setAttribute(MD_ACTIVE_ATTR, "true");
  p.appendChild(document.createTextNode(hrText));
  hr.replaceWith(p);
  return p;
}

export function deactivateElement(
  editor: HTMLElement,
  el: HTMLElement,
  preserveCaret = true,
): HTMLElement | null {
  const tag = el.tagName.toLowerCase();
  const sel = preserveCaret && typeof window !== "undefined" ? window.getSelection() : null;
  const activeRange = sel && sel.rangeCount > 0 && sel.isCollapsed ? sel.getRangeAt(0) : null;
  const hadCaretInsideEl = Boolean(activeRange && el.contains(activeRange.startContainer));
  el.removeAttribute(MD_ACTIVE_ATTR);

  if (el.hasAttribute(MD_HR_ACTIVE_ATTR)) {
    el.removeAttribute(MD_HR_ACTIVE_ATTR);
    const hrSyntax = isStandaloneHrBlock(el);
    if (hrSyntax) {
      const hr = document.createElement("hr");
      hr.setAttribute(MD_HR_SYNTAX_ATTR, hrSyntax);
      el.replaceWith(hr);
      return hr;
    }
    normalizeEmptyBreak(el);
    return null;
  }

  Array.from(el.children).forEach((child) => {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      (child as HTMLElement).hasAttribute(MD_SYNTAX_ATTR)
    ) {
      child.remove();
    }
  });

  if (INLINE_MARK_TAGS.has(tag)) {
    const remainingText = stripZeroWidth(el.textContent || "");
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
      return null;
    }
    cleanTrailingEmptyNodes(el);
    return null;
  }

  cleanTrailingEmptyNodes(el);
  const scope = getEditableScope(el);
  if (scope !== el) {
    normalizeEmptyBreak(scope);
  } else if (tag === "li" && !hasOwnInlineContent(el)) {
    if (!el.querySelector(":scope > br")) {
      const firstNested = el.querySelector(":scope > ul, :scope > ol");
      el.insertBefore(document.createElement("br"), firstNested);
    }
  } else {
    normalizeEmptyBreak(el);
  }
  if (
    preserveCaret &&
    hadCaretInsideEl &&
    activeRange &&
    !activeRange.startContainer.isConnected &&
    el.isConnected
  ) {
    placeCaretAtStart(el);
  }
  return null;
}

function hasZeroWidthTextChild(el: HTMLElement): boolean {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE && (child.nodeValue || "").includes("\u200B")) {
      return true;
    }
  }
  return false;
}

function activateBlockElement(block: HTMLElement, caretNode: Node | null): void {
  const spec = getBlockSyntaxSpec(block);
  if (!spec) return;

  if (block.getAttribute(MD_ACTIVE_ATTR) !== "true") {
    block.setAttribute(MD_ACTIVE_ATTR, "true");
  }

  if (spec.kind === "code") {
    let codeEl = block.querySelector(":scope > code") as HTMLElement | null;
    if (!codeEl) {
      codeEl = document.createElement("code");
      while (block.firstChild) {
        if (
          block.firstChild.nodeType === Node.ELEMENT_NODE &&
          (block.firstChild as HTMLElement).hasAttribute(MD_SYNTAX_ATTR)
        ) {
          block.firstChild.remove();
        } else {
          codeEl.appendChild(block.firstChild);
        }
      }
      normalizeEmptyBreak(codeEl);
      block.appendChild(codeEl);
    }
    cleanZeroWidthInsideElement(codeEl);

    let openSpan = getDirectSyntaxChild(block, "code-open");
    if (!openSpan) {
      openSpan = createSyntaxSpan("code-open", spec.openPrefix);
      block.insertBefore(openSpan, codeEl);
    } else if (
      (!caretNode || !openSpan.contains(caretNode)) &&
      openSpan.textContent !== spec.openPrefix
    ) {
      openSpan.textContent = spec.openPrefix;
    }

    if (!getDirectSyntaxChild(block, "code-close")) {
      block.appendChild(createSyntaxSpan("code-close", spec.closePrefix));
    }

    if (caretNode === block) {
      placeCaretAtStart(codeEl);
    }
    return;
  }

  cleanZeroWidthInsideElement(block);

  if (spec.kind === "list" && spec.isTask) {
    let contentSpan = block.querySelector(":scope > span[data-task-content]") as HTMLElement | null;
    if (!contentSpan) {
      contentSpan = document.createElement("span");
      contentSpan.setAttribute("data-task-content", "true");
      block.appendChild(contentSpan);
    }
    cleanZeroWidthInsideElement(contentSpan);

    let span = getDirectSyntaxChild(block, "list");
    if (!span) {
      span = createSyntaxSpan("list", spec.prefixText);
      block.insertBefore(span, contentSpan);
    } else if ((!caretNode || !span.contains(caretNode)) && span.textContent !== spec.prefixText) {
      span.textContent = spec.prefixText;
    }

    if (!hasVisibleContent(contentSpan)) {
      const emptyBr = contentSpan.querySelector(":scope > br");
      if (emptyBr) emptyBr.remove();
      if (!hasZeroWidthTextChild(contentSpan)) {
        const anchor = document.createTextNode("\u200B");
        contentSpan.appendChild(anchor);
        if (caretNode === block || caretNode === contentSpan) {
          placeCaret(anchor, 1);
        }
      }
    } else if (caretNode === block) {
      placeCaretAtStart(contentSpan);
    }
    return;
  }

  const existingSpan = getDirectSyntaxChild(block, spec.kind);
  if (existingSpan) {
    if (
      spec.kind === "list" &&
      (!caretNode || !existingSpan.contains(caretNode)) &&
      existingSpan.textContent !== spec.prefixText
    ) {
      existingSpan.textContent = spec.prefixText;
    }
    return;
  }

  const hadCaretOnElement = caretNode === block;
  if (!hasOwnInlineContent(block)) {
    const emptyBr = block.querySelector(":scope > br");
    if (emptyBr) emptyBr.remove();
  }

  const span = createSyntaxSpan(spec.kind, spec.prefixText);
  block.insertBefore(span, block.firstChild);

  if (!hasOwnInlineContent(block) && !hasZeroWidthTextChild(block)) {
    const anchor = document.createTextNode("\u200B");
    block.insertBefore(anchor, span.nextSibling);
    if (hadCaretOnElement) {
      placeCaret(anchor, 1);
    }
  } else if (hadCaretOnElement) {
    placeCaretAtStart(block);
  }
}

export function activateInlineElement(inlineEl: HTMLElement, caretNode: Node | null): void {
  const tag = inlineEl.tagName.toLowerCase();
  if (inlineEl.getAttribute(MD_ACTIVE_ATTR) !== "true") {
    inlineEl.setAttribute(MD_ACTIVE_ATTR, "true");
  }
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
 * the current selection (collapsed caret or multi-element drag range), and converts
 * standalone deferred divider lines (`---`) to `<hr>` once cursor/focus leaves them.
 * Returns `true` when a semantic block conversion occurred (so callers can persist changes).
 */
export function syncLiveMarkdownSyntax(
  editor: HTMLElement,
  options?: SyncLiveMarkdownOptions,
): boolean {
  const sel = window.getSelection();
  const rawRange = !options?.clearAll && sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const range =
    rawRange && (editor.contains(rawRange.startContainer) || rawRange.intersectsNode(editor))
      ? rawRange
      : null;

  const nonCollapsedSnap =
    range && !range.collapsed && sel && sel.anchorNode && sel.focusNode
      ? {
          anchorNode: sel.anchorNode,
          anchorOffset: sel.anchorOffset,
          focusNode: sel.focusNode,
          focusOffset: sel.focusOffset,
        }
      : null;

  const { activeBlocks, activeHrs, activeInlines } = range
    ? getActiveMarksForSelection(editor, range, options)
    : { activeBlocks: [], activeHrs: [], activeInlines: [] };

  const replacements = new Map<Node, Node>();
  const expandedHrBlocks: HTMLElement[] = [];
  for (const hr of activeHrs) {
    if (!hr.isConnected) continue;
    const expanded = expandHorizontalRule(hr);
    replacements.set(hr, expanded);
    expandedHrBlocks.push(expanded);
  }

  const activeSet = new Set<HTMLElement>([...activeBlocks, ...expandedHrBlocks, ...activeInlines]);

  const currentActives = Array.from(
    editor.querySelectorAll(`[${MD_ACTIVE_ATTR}="true"]`),
  ) as HTMLElement[];
  // Process bottom-up so inner inline cleanup completes cleanly before ancestor blocks.
  for (let i = currentActives.length - 1; i >= 0; i -= 1) {
    const el = currentActives[i]!;
    if (!activeSet.has(el)) {
      const replacement = deactivateElement(editor, el, !options?.clearAll);
      if (replacement) {
        replacements.set(el, replacement);
      }
    }
  }

  if (range) {
    const caretNode = range.collapsed ? range.startContainer : null;
    for (const block of activeBlocks) {
      if (block.hasAttribute(MD_HR_ACTIVE_ATTR)) {
        if (block.getAttribute(MD_ACTIVE_ATTR) !== "true") {
          block.setAttribute(MD_ACTIVE_ATTR, "true");
        }
      } else {
        activateBlockElement(block, caretNode);
      }
    }
    for (const inlineEl of activeInlines) {
      activateInlineElement(inlineEl, caretNode);
    }
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

  const currentRangeAfterDom =
    !options?.clearAll && sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const effectiveActiveRange =
    currentRangeAfterDom &&
    (editor.contains(currentRangeAfterDom.startContainer) ||
      currentRangeAfterDom.intersectsNode(editor))
      ? currentRangeAfterDom
      : range;

  const semanticConverted = convertStandaloneHrLines(editor, {
    activeRange: options?.clearAll ? null : effectiveActiveRange,
    preserveSyntaxAttr: true,
    onNodeReplaced: (oldNode, newNode) => replacements.set(oldNode, newNode),
  });

  // Ensure a trailing `<hr>` in the live editor always has an editable paragraph after it
  // so the user can click or arrow below the divider cleanly.
  if (!options?.clearAll && editor.lastElementChild?.tagName.toLowerCase() === "hr") {
    const pAfter = document.createElement("p");
    pAfter.appendChild(document.createElement("br"));
    editor.appendChild(pAfter);
  }

  if (nonCollapsedSnap && sel) {
    const resolveEndpoint = (node: Node, offset: number): { node: Node; offset: number } => {
      if (node.isConnected && editor.contains(node)) {
        return { node, offset };
      }
      const directReplacement = replacements.get(node);
      if (directReplacement && directReplacement.isConnected) {
        const textChild = directReplacement.firstChild;
        if (textChild && textChild.nodeType === Node.TEXT_NODE) {
          return {
            node: textChild,
            offset: Math.min(offset, textChild.nodeValue?.length ?? 0),
          };
        }
        return { node: directReplacement, offset: 0 };
      }
      return { node, offset };
    };

    const nextAnchor = resolveEndpoint(nonCollapsedSnap.anchorNode, nonCollapsedSnap.anchorOffset);
    const nextFocus = resolveEndpoint(nonCollapsedSnap.focusNode, nonCollapsedSnap.focusOffset);
    if (
      nextAnchor.node.isConnected &&
      nextFocus.node.isConnected &&
      (sel.isCollapsed ||
        sel.anchorNode !== nextAnchor.node ||
        sel.anchorOffset !== nextAnchor.offset ||
        sel.focusNode !== nextFocus.node ||
        sel.focusOffset !== nextFocus.offset)
    ) {
      try {
        sel.setBaseAndExtent(nextAnchor.node, nextAnchor.offset, nextFocus.node, nextFocus.offset);
      } catch {
        // ignore invalid range restoration
      }
    }
  }

  return semanticConverted;
}

export function clearAllLiveMarkdownSyntax(editor: HTMLElement): boolean {
  return syncLiveMarkdownSyntax(editor, { clearAll: true });
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
  if (HEADING_TAG_SET.has(nextTag)) {
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
  const targetScope = getEditableScope(block);

  if (targetScope !== block) {
    const emptyBr = !hasVisibleContent(targetScope)
      ? targetScope.querySelector(":scope > br")
      : null;
    if (emptyBr) emptyBr.remove();
    const firstNode = targetScope.firstChild;
    if (
      firstNode &&
      firstNode.nodeType === Node.TEXT_NODE &&
      stripZeroWidth(firstNode.nodeValue || "") === ""
    ) {
      firstNode.remove();
    }
    targetScope.insertBefore(extraNode, targetScope.firstChild);
  } else {
    const afterNode = span.nextSibling;
    if (
      afterNode &&
      afterNode.nodeType === Node.TEXT_NODE &&
      stripZeroWidth(afterNode.nodeValue || "") === ""
    ) {
      afterNode.remove();
    }
    block.insertBefore(extraNode, span.nextSibling);
  }

  if (caretInsideSpan) {
    if (spanCaretOffset > expectedPrefix.length) {
      placeCaret(extraNode, spanCaretOffset - expectedPrefix.length);
    } else if (span.firstChild) {
      placeCaret(span.firstChild, spanCaretOffset);
    }
  }
}

function restoreCaretAtTextOffsetInContainer(container: HTMLElement, offset: number): void {
  let remaining = offset;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let curr = walker.nextNode() as Text | null;
  while (curr) {
    const len = stripZeroWidth(curr.nodeValue || "").length;
    if (remaining <= len) {
      placeCaret(curr, Math.min(remaining, curr.nodeValue?.length ?? 0));
      return;
    }
    remaining -= len;
    curr = walker.nextNode() as Text | null;
  }
  placeCaretAtStart(container);
}

function unwrapCodeBlockToParagraphs(pre: HTMLElement): void {
  const openSpan = getDirectSyntaxChild(pre, "code-open");
  const codeEl = pre.querySelector(":scope > code") as HTMLElement | null;
  const closeSpan = getDirectSyntaxChild(pre, "code-close");

  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  let caretPart: "open" | "code" | "close" | null = null;
  let caretOffset = 0;

  if (range && pre.contains(range.startContainer)) {
    if (openSpan?.contains(range.startContainer)) {
      caretPart = "open";
      caretOffset = getLogicalCaretOffsetInNode(openSpan, range.startContainer, range.startOffset);
    } else if (closeSpan?.contains(range.startContainer)) {
      caretPart = "close";
      caretOffset = getLogicalCaretOffsetInNode(closeSpan, range.startContainer, range.startOffset);
    } else if (codeEl?.contains(range.startContainer)) {
      caretPart = "code";
      caretOffset = getLogicalCaretOffsetInNode(codeEl, range.startContainer, range.startOffset);
    }
  }

  const openText = openSpan
    ? stripZeroWidth((openSpan.textContent || "").replace(/\u00A0/g, " "))
    : "";
  const codeText = codeEl ? stripZeroWidth((codeEl.textContent || "").replace(/\u00A0/g, " ")) : "";
  const closeText = closeSpan
    ? stripZeroWidth((closeSpan.textContent || "").replace(/\u00A0/g, " "))
    : "";

  const makePara = (text: string): HTMLParagraphElement => {
    const p = document.createElement("p");
    if (text) p.appendChild(document.createTextNode(text));
    normalizeEmptyBreak(p);
    return p;
  };

  const frag = document.createDocumentFragment();
  const openP = makePara(openText);
  frag.appendChild(openP);

  const codePs: HTMLParagraphElement[] = [];
  if (codeText.length > 0 || caretPart === "code") {
    for (const line of codeText.split("\n")) {
      const p = makePara(line);
      codePs.push(p);
      frag.appendChild(p);
    }
  }

  const closeP = makePara(closeText);
  frag.appendChild(closeP);
  pre.replaceWith(frag);

  if (caretPart === "open") {
    restoreCaretAtTextOffsetInContainer(openP, caretOffset);
  } else if (caretPart === "close") {
    restoreCaretAtTextOffsetInContainer(closeP, caretOffset);
  } else if (caretPart === "code" && codePs.length > 0) {
    let remaining = caretOffset;
    const lines = codeText.split("\n");
    for (let i = 0; i < codePs.length; i += 1) {
      const lineLen = (lines[i] ?? "").length;
      if (remaining <= lineLen || i === codePs.length - 1) {
        restoreCaretAtTextOffsetInContainer(codePs[i]!, Math.min(remaining, lineLen));
        break;
      }
      remaining -= lineLen + 1;
    }
  }
}

function unwrapListItemToParagraph(
  li: HTMLElement,
  stripPrefixSpan: boolean,
): HTMLParagraphElement | null {
  const list = li.parentElement;
  if (!list) return null;

  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const caretInsideOwn = Boolean(
    range &&
    li.contains(range.startContainer) &&
    (() => {
      const firstNested = li.querySelector(":scope > ul, :scope > ol");
      return !firstNested || !firstNested.contains(range.startContainer);
    })(),
  );
  const logicalOffset =
    caretInsideOwn && range
      ? getLogicalCaretOffsetInNode(li, range.startContainer, range.startOffset)
      : 0;

  const nestedLists = Array.from(li.children).filter((child) => {
    const tag = child.tagName.toLowerCase();
    return tag === "ul" || tag === "ol";
  });
  nestedLists.forEach((nl) => nl.remove());

  li.querySelectorAll(":scope > input[data-task-checkbox]").forEach((cb) => cb.remove());
  if (stripPrefixSpan) {
    li.querySelectorAll(`:scope > [${MD_SYNTAX_ATTR}]`).forEach((s) => s.remove());
  } else {
    li.querySelectorAll(`:scope > [${MD_SYNTAX_ATTR}]`).forEach((s) => {
      const txt = stripZeroWidth(s.textContent || "");
      if (txt) {
        s.replaceWith(document.createTextNode(txt));
      } else {
        s.remove();
      }
    });
  }

  const p = document.createElement("p");
  const taskSpan = li.querySelector(":scope > span[data-task-content]");
  if (taskSpan) {
    while (li.firstChild) {
      if (li.firstChild === taskSpan) {
        while (taskSpan.firstChild) p.appendChild(taskSpan.firstChild);
        taskSpan.remove();
      } else {
        p.appendChild(li.firstChild);
      }
    }
  } else {
    while (li.firstChild) {
      p.appendChild(li.firstChild);
    }
  }
  p.normalize();
  normalizeEmptyBreak(p);

  splitListAroundItem(list, li, [p, ...nestedLists]);
  for (const nl of nestedLists) {
    const tag = nl.tagName.toLowerCase();
    if ((tag === "ul" || tag === "ol") && nl.isConnected) {
      mergeListWithAdjacentSiblings(nl as HTMLUListElement | HTMLOListElement);
    }
  }

  if (caretInsideOwn) {
    restoreCaretAtTextOffsetInContainer(p, logicalOffset);
  }
  return p;
}

function convertListItemKind(
  li: HTMLElement,
  span: HTMLSpanElement,
  target:
    | { kind: "bullet"; bullet: "-" | "*" | "+"; rest: string }
    | { kind: "ordered"; start: number; delim: "." | ")"; rest: string }
    | { kind: "task"; bullet: "-" | "*" | "+"; checked: boolean; rest: string },
): void {
  const parentList = li.parentElement;
  if (!parentList) return;

  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const caretInsideSpan = Boolean(range && span.contains(range.startContainer));
  const spanOffset = caretInsideSpan && range ? range.startOffset : 0;

  const targetListTag = target.kind === "ordered" ? "ol" : "ul";
  const isTargetTask = target.kind === "task";
  const sameContainer =
    parentList.tagName.toLowerCase() === targetListTag &&
    parentList.hasAttribute("data-task-list") === isTargetTask;

  const nestedLists = Array.from(li.children).filter((child) => {
    const tag = child.tagName.toLowerCase();
    return tag === "ul" || tag === "ol";
  });
  nestedLists.forEach((nl) => nl.remove());

  const contentFrag = document.createDocumentFragment();
  if (target.rest) {
    contentFrag.appendChild(document.createTextNode(target.rest));
  }
  const existingTaskSpan = li.querySelector(":scope > span[data-task-content]");
  if (existingTaskSpan) {
    while (existingTaskSpan.firstChild) contentFrag.appendChild(existingTaskSpan.firstChild);
  } else {
    for (const child of Array.from(li.childNodes)) {
      if (child === span) continue;
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        ((child as HTMLElement).hasAttribute("data-task-checkbox") ||
          (child as HTMLElement).hasAttribute(MD_SYNTAX_ATTR))
      ) {
        continue;
      }
      contentFrag.appendChild(child);
    }
  }

  const newLi =
    target.kind === "task"
      ? createTaskListItem(target.checked, contentFrag, target.bullet)
      : createListItemWithContent(
          contentFrag,
          target.kind === "bullet" ? { bullet: target.bullet } : { delim: target.delim },
        );
  nestedLists.forEach((nl) => newLi.appendChild(nl));

  if (sameContainer) {
    parentList.replaceChild(newLi, li);
    if (target.kind === "ordered" && parentList.firstElementChild === newLi) {
      if (target.start !== 1) parentList.setAttribute("start", String(target.start));
      else parentList.removeAttribute("start");
    }
  } else {
    const newList = document.createElement(targetListTag);
    if (isTargetTask) newList.setAttribute("data-task-list", "true");
    if (target.kind === "ordered" && target.start !== 1) {
      newList.setAttribute("start", String(target.start));
    }
    newList.appendChild(newLi);
    if (parentList.children.length === 1) {
      parentList.replaceWith(newList);
    } else {
      splitListAroundItem(parentList, li, newList);
    }
    mergeListWithAdjacentSiblings(newList as HTMLUListElement | HTMLOListElement);
  }

  const spec = getBlockSyntaxSpec(newLi);
  if (!spec || spec.kind !== "list") return;

  newLi.setAttribute(MD_ACTIVE_ATTR, "true");
  const newSpan = createSyntaxSpan("list", spec.prefixText);
  const scope = getEditableScope(newLi);
  if (spec.isTask && scope !== newLi) {
    newLi.insertBefore(newSpan, scope);
  } else {
    newLi.insertBefore(newSpan, newLi.firstChild);
  }

  if (!hasOwnInlineContent(newLi)) {
    const emptyBr = scope.querySelector(":scope > br");
    if (emptyBr) emptyBr.remove();
    if (!hasZeroWidthTextChild(scope)) {
      scope.insertBefore(
        document.createTextNode("\u200B"),
        spec.isTask ? null : newSpan.nextSibling,
      );
    }
  }

  if (caretInsideSpan && newSpan.firstChild) {
    if (target.rest && spanOffset > spec.prefixText.length) {
      restoreCaretAtTextOffsetInContainer(scope, spanOffset - spec.prefixText.length);
    } else {
      placeCaret(newSpan.firstChild, Math.min(spanOffset, newSpan.textContent?.length ?? 0));
    }
  }
}

function syncCanonicalPrefixInSpan(
  block: HTMLElement,
  span: HTMLSpanElement,
  canonicalPrefix: string,
  rest: string,
): void {
  if (rest) {
    pushSpilledTextAfterBlockSyntax(block, span, canonicalPrefix, rest);
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
  cleanZeroWidthInsideElement(getEditableScope(block));
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
    const raw = stripZeroWidth((span.textContent || "").replace(/\u00A0/g, " "));
    const match = /^(#{1,6})([ ])(.*)$/.exec(raw);
    if (!match) {
      unwrapBlockSyntaxToParagraph(block, false);
      return;
    }
    const hashes = match[1]!;
    syncCanonicalPrefixInSpan(block, span, `${hashes} `, match[3] || "");
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
    const raw = stripZeroWidth((span.textContent || "").replace(/\u00A0/g, " "));
    const match = /^(>[ ])(.*)$/.exec(raw);
    if (!match) {
      unwrapBlockSyntaxToParagraph(block, false);
      return;
    }
    syncCanonicalPrefixInSpan(block, span, "> ", match[2] || "");
    return;
  }

  if (tag === "li") {
    const span = getDirectSyntaxChild(block, "list");
    if (!span) {
      unwrapListItemToParagraph(block, true);
      return;
    }
    const raw = stripZeroWidth((span.textContent || "").replace(/\u00A0/g, " "));
    const parsed = parseMarkdownBlockPrefix(raw);
    if (!parsed || parsed.type === "heading" || parsed.type === "blockquote") {
      unwrapListItemToParagraph(block, false);
      return;
    }

    const parentTag = block.parentElement?.tagName.toLowerCase();
    const isTask = block.hasAttribute("data-task");

    if (parsed.type === "task" && isTask) {
      applyLiMarkerAttrs(block, { bullet: parsed.bullet });
      block.setAttribute("data-checked", String(parsed.checked));
      const input = block.querySelector(
        ":scope > input[data-task-checkbox]",
      ) as HTMLInputElement | null;
      if (input) {
        input.checked = parsed.checked;
        if (parsed.checked) input.setAttribute("checked", "");
        else input.removeAttribute("checked");
      }
      syncCanonicalPrefixInSpan(
        block,
        span,
        `${parsed.bullet} [${parsed.checked ? "x" : " "}] `,
        parsed.rest,
      );
      return;
    }

    if (parsed.type === "bullet" && parentTag === "ul" && !isTask) {
      applyLiMarkerAttrs(block, { bullet: parsed.bullet });
      syncCanonicalPrefixInSpan(block, span, `${parsed.bullet} `, parsed.rest);
      return;
    }

    if (parsed.type === "ordered" && parentTag === "ol") {
      const ol = block.parentElement as HTMLOListElement;
      if (ol.firstElementChild === block) {
        if (parsed.start !== 1) ol.setAttribute("start", String(parsed.start));
        else ol.removeAttribute("start");
      }
      applyLiMarkerAttrs(block, { delim: parsed.delim });
      const idx = getOrderedListIndex(block);
      syncCanonicalPrefixInSpan(block, span, `${idx}${parsed.delim} `, parsed.rest);
      return;
    }

    if (parsed.type === "task") {
      convertListItemKind(block, span, {
        kind: "task",
        bullet: parsed.bullet,
        checked: parsed.checked,
        rest: parsed.rest,
      });
    } else if (parsed.type === "bullet") {
      convertListItemKind(block, span, {
        kind: "bullet",
        bullet: parsed.bullet,
        rest: parsed.rest,
      });
    } else {
      convertListItemKind(block, span, {
        kind: "ordered",
        start: parsed.start,
        delim: parsed.delim,
        rest: parsed.rest,
      });
    }
    return;
  }

  if (tag === "pre") {
    const codeEl = block.querySelector(":scope > code") as HTMLElement | null;
    const openSpan = getDirectSyntaxChild(block, "code-open");
    const closeSpan = getDirectSyntaxChild(block, "code-close");
    if (!codeEl || !openSpan || !closeSpan) {
      unwrapCodeBlockToParagraphs(block);
      return;
    }
    const openRaw = stripZeroWidth((openSpan.textContent || "").replace(/\u00A0/g, " "));
    const closeRaw = stripZeroWidth((closeSpan.textContent || "").replace(/\u00A0/g, " "));
    const openMatch = CODE_OPEN_PREFIX_REGEX.exec(openRaw);
    const closeOk = CODE_CLOSE_PREFIX_REGEX.test(closeRaw);
    if (!openMatch || !closeOk || openSpan.querySelector("br") || closeSpan.querySelector("br")) {
      unwrapCodeBlockToParagraphs(block);
      return;
    }
    const nextLang = openMatch[1] || "";
    if (nextLang) {
      if (codeEl.getAttribute("data-lang") !== nextLang) {
        codeEl.setAttribute("data-lang", nextLang);
      }
    } else if (codeEl.hasAttribute("data-lang")) {
      codeEl.removeAttribute("data-lang");
    }
    cleanZeroWidthInsideElement(codeEl);
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
  const openSpan = getDirectSyntaxChild(inlineEl, "open");
  const closeSpan = getDirectSyntaxChild(inlineEl, "close");
  if (!openSpan || !closeSpan) {
    unwrapBrokenInlineToPlainText(inlineEl);
    return;
  }

  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

  let openVal = (openSpan.textContent || "").replace(/\u200B/g, "");
  let closeVal = (closeSpan.textContent || "").replace(/\u200B/g, "");

  // Seamlessly convert between `<em>` (`*`/`_`) and `<strong>` (`**`/`__`) when delimiters are edited
  if (
    (tag === "em" || tag === "i") &&
    ((openVal === "**" && closeVal === "**") || (openVal === "__" && closeVal === "__"))
  ) {
    replaceBlockTagPreservingCaret(inlineEl, "strong", inlineEl.parentElement ?? inlineEl);
    return;
  }
  if (
    (tag === "strong" || tag === "b") &&
    ((openVal === "*" && closeVal === "*") || (openVal === "_" && closeVal === "_"))
  ) {
    replaceBlockTagPreservingCaret(inlineEl, "em", inlineEl.parentElement ?? inlineEl);
    return;
  }

  const expected =
    (tag === "em" || tag === "i") && openVal.startsWith("_")
      ? "_"
      : (tag === "strong" || tag === "b") && openVal.startsWith("__")
        ? "__"
        : rule.delimiter;

  // Handle typing spilling inside openSpan (e.g. "`foo" -> openSpan="`", push "foo" inside el;
  // or "bar`" -> push "bar" before el).
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
  closeVal = (closeSpan.textContent || "").replace(/\u200B/g, "");
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

function promotePlainBlockPrefixAtCaret(editor: HTMLElement): void {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return;
  const block = getClosestBlock(range.startContainer, editor);
  if (!block || block.parentElement !== editor) return;
  const tag = block.tagName.toLowerCase();
  if (tag !== "p" && tag !== "div") return;
  if (block.querySelector("img, ul, ol, pre, blockquote, hr")) return;
  if (Array.from(block.querySelectorAll("br")).some((br) => br.nextSibling !== null)) return;

  const first = block.firstChild;
  if (!first || first.nodeType !== Node.TEXT_NODE) return;
  const cleanVal = stripZeroWidth((first.nodeValue || "").replace(/\u00A0/g, " "));
  const parsed = parseMarkdownBlockPrefix(cleanVal);
  if (!parsed) return;

  const caretOffsetInBlock = getLogicalCaretOffsetInNode(
    block,
    range.startContainer,
    range.startOffset,
  );

  first.remove();
  if (parsed.rest) {
    block.insertBefore(document.createTextNode(parsed.rest), block.firstChild);
  }
  cleanTrailingEmptyNodes(block);

  if (parsed.type === "heading" || parsed.type === "blockquote") {
    const canonicalPrefix = parsed.type === "blockquote" ? "> " : `${"#".repeat(parsed.level)} `;
    const nextTag = parsed.type === "blockquote" ? "blockquote" : `h${parsed.level}`;
    const kind = parsed.type === "blockquote" ? "blockquote" : "heading";

    const replacement = replaceBlockTagPreservingCaret(block, nextTag, editor);
    const shouldRevealPrefix =
      parsed.type === "heading" || caretOffsetInBlock < canonicalPrefix.length;

    if (!shouldRevealPrefix) {
      normalizeEmptyBreak(replacement);
      if (getTextWithoutArtifacts(replacement).length === 0 && !replacement.querySelector("img")) {
        placeCaretAtStart(replacement);
      } else {
        restoreCaretAtTextOffsetInContainer(
          replacement,
          caretOffsetInBlock - canonicalPrefix.length,
        );
      }
      return;
    }

    replacement.setAttribute(MD_ACTIVE_ATTR, "true");
    const syntaxSpan = createSyntaxSpan(kind, canonicalPrefix);
    replacement.insertBefore(syntaxSpan, replacement.firstChild);

    if (getTextWithoutArtifacts(replacement).length === 0 && !replacement.querySelector("img")) {
      const emptyBr = replacement.querySelector(":scope > br");
      if (emptyBr) emptyBr.remove();
      const anchor = document.createTextNode("\u200B");
      replacement.appendChild(anchor);
      if (caretOffsetInBlock <= canonicalPrefix.length && syntaxSpan.firstChild) {
        placeCaret(syntaxSpan.firstChild, caretOffsetInBlock);
      } else {
        placeCaret(anchor, 1);
      }
      return;
    }

    restoreCaretAtTextOffsetInContainer(replacement, caretOffsetInBlock);
    return;
  }

  const contentFrag = document.createDocumentFragment();
  while (block.firstChild) {
    contentFrag.appendChild(block.firstChild);
  }

  let listEl: HTMLUListElement | HTMLOListElement;
  let li: HTMLLIElement;

  if (parsed.type === "task") {
    listEl = document.createElement("ul");
    listEl.setAttribute("data-task-list", "true");
    li = createTaskListItem(parsed.checked, contentFrag, parsed.bullet);
  } else if (parsed.type === "bullet") {
    listEl = document.createElement("ul");
    li = createListItemWithContent(contentFrag, { bullet: parsed.bullet });
  } else {
    listEl = document.createElement("ol");
    if (parsed.start !== 1) listEl.setAttribute("start", String(parsed.start));
    li = createListItemWithContent(contentFrag, { delim: parsed.delim });
  }

  listEl.appendChild(li);
  block.replaceWith(listEl);
  mergeListWithAdjacentSiblings(listEl);

  const spec = getBlockSyntaxSpec(li);
  if (!spec || spec.kind !== "list") return;

  const scope = getEditableScope(li);
  if (caretOffsetInBlock >= spec.prefixText.length) {
    normalizeEmptyBreak(scope);
    if (!hasOwnInlineContent(li)) {
      placeCaretAtStart(li);
    } else {
      restoreCaretAtTextOffsetInContainer(scope, caretOffsetInBlock - spec.prefixText.length);
    }
    return;
  }

  li.setAttribute(MD_ACTIVE_ATTR, "true");
  const syntaxSpan = createSyntaxSpan("list", spec.prefixText);
  if (spec.isTask && scope !== li) {
    li.insertBefore(syntaxSpan, scope);
  } else {
    li.insertBefore(syntaxSpan, li.firstChild);
  }

  if (!hasOwnInlineContent(li)) {
    const emptyBr = scope.querySelector(":scope > br");
    if (emptyBr) emptyBr.remove();
    const anchor = document.createTextNode("\u200B");
    scope.appendChild(anchor);
    if (caretOffsetInBlock <= spec.prefixText.length && syntaxSpan.firstChild) {
      placeCaret(syntaxSpan.firstChild, caretOffsetInBlock);
    } else {
      placeCaret(anchor, 1);
    }
    return;
  }

  restoreCaretAtTextOffsetInContainer(li, caretOffsetInBlock);
}

/**
 * Reconciles user edits made while syntax markers (`### `, `- `, `1. `, `- [ ] `, `` ``` ``, `` ` ``, `**`, `~~`, `==`, `> `, `[label](url)`)
 * are visible, dynamically changing heading levels, list types, code languages, or unwrapping broken delimiters.
 */
export function reconcileActiveMarkdownSyntax(editor: HTMLElement): void {
  const actives = Array.from(
    editor.querySelectorAll(`[${MD_ACTIVE_ATTR}="true"]`),
  ) as HTMLElement[];
  for (let i = actives.length - 1; i >= 0; i -= 1) {
    const el = actives[i]!;
    if (!el.isConnected) continue;
    const tag = el.tagName.toLowerCase();
    if (el.hasAttribute(MD_HR_ACTIVE_ATTR)) {
      const hrSyntax = isStandaloneHrBlock(el);
      if (hrSyntax) {
        el.setAttribute(MD_HR_ACTIVE_ATTR, hrSyntax);
      } else {
        el.removeAttribute(MD_HR_ACTIVE_ATTR);
        el.removeAttribute(MD_ACTIVE_ATTR);
      }
    } else if (HEADING_TAG_SET.has(tag) || tag === "blockquote" || tag === "li" || tag === "pre") {
      reconcileBlockSyntax(editor, el);
    } else if (INLINE_MARK_TAGS.has(tag)) {
      reconcileInlineElement(el);
    }
  }
  promotePlainBlockPrefixAtCaret(editor);
}

function findTextOffsetAtClientX(tn: Text, clientX: number): number {
  const len = tn.nodeValue?.length ?? 0;
  if (len === 0) return 0;
  const doc = tn.ownerDocument || document;
  let bestOffset = len;
  let bestDist = Infinity;
  for (let i = 0; i <= len; i += 1) {
    const r = doc.createRange();
    r.setStart(tn, i);
    r.collapse(true);
    const rect = r.getBoundingClientRect();
    if (rect.height > 0 || rect.left > 0) {
      const dist = Math.abs(rect.left - clientX);
      if (dist < bestDist) {
        bestDist = dist;
        bestOffset = i;
      }
    }
  }
  return bestOffset;
}

export function expandHorizontalRuleAndFocus(
  editor: HTMLElement,
  hr: HTMLElement,
  placement: "start" | "end" | { clientX: number },
): void {
  const p = expandHorizontalRule(hr);
  const tn = p.firstChild;
  if (tn && tn.nodeType === Node.TEXT_NODE) {
    const textNode = tn as Text;
    const len = textNode.nodeValue?.length ?? 0;
    const offset =
      placement === "start"
        ? 0
        : placement === "end"
          ? len
          : findTextOffsetAtClientX(textNode, placement.clientX);
    placeCaret(textNode, offset);
  } else if (placement === "end") {
    placeCaretAtEnd(p);
  } else {
    placeCaretAtStart(p);
  }
  syncLiveMarkdownSyntax(editor);
}

export function findHorizontalRuleAtClientY(
  editor: HTMLElement,
  clientY: number,
  tolerance = 8,
): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  const hrs = Array.from(editor.querySelectorAll("hr")) as HTMLElement[];
  for (const hr of hrs) {
    if (isInsideTag(hr, editor, ["pre"])) continue;
    const rect = hr.getBoundingClientRect();
    if (rect.width === 0) continue;
    if (clientY >= rect.top - tolerance && clientY <= rect.bottom + tolerance) {
      const center = (rect.top + rect.bottom) / 2;
      const dist = Math.abs(clientY - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = hr;
      }
    }
  }
  return best;
}

export function activateHorizontalRuleAtClient(
  editor: HTMLElement,
  hr: HTMLElement,
  clientX: number,
): boolean {
  if (!editor.contains(hr) || hr.tagName.toLowerCase() !== "hr") return false;
  editor.focus({ preventScroll: true });
  expandHorizontalRuleAndFocus(editor, hr, { clientX });
  return true;
}

function getAdjacentHrSibling(
  editor: HTMLElement,
  block: HTMLElement,
  direction: "prev" | "next",
): HTMLElement | null {
  if (block.tagName.toLowerCase() === "li") {
    const topBlock = getTopLevelBlock(block, editor);
    if (!topBlock || (topBlock.tagName !== "UL" && topBlock.tagName !== "OL")) return null;
    if (direction === "prev") {
      if (topBlock.querySelector("li") !== block) return null;
      const prev = topBlock.previousElementSibling as HTMLElement | null;
      return prev && prev.tagName.toLowerCase() === "hr" ? prev : null;
    }
    const items = topBlock.querySelectorAll("li");
    if (items[items.length - 1] !== block) return null;
    const next = topBlock.nextElementSibling as HTMLElement | null;
    return next && next.tagName.toLowerCase() === "hr" ? next : null;
  }

  const topBlock = block.parentElement === editor ? block : getTopLevelBlock(block, editor);
  if (!topBlock) return null;
  const sibling = (
    direction === "prev" ? topBlock.previousElementSibling : topBlock.nextElementSibling
  ) as HTMLElement | null;
  return sibling && sibling.tagName.toLowerCase() === "hr" ? sibling : null;
}

/**
 * Obsidian-style keyboard navigation into horizontal dividers (`<hr>`):
 * moving the caret into `<hr>` via Arrow keys expands it back to editable `---` syntax.
 */
export function resolveArrowIntoHorizontalRule(
  editor: HTMLElement,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
): boolean {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return false;

  if (range.startContainer === editor) {
    if (key === "ArrowDown" || key === "ArrowRight") {
      const next = editor.childNodes[range.startOffset] as HTMLElement | undefined;
      if (next && next.nodeType === Node.ELEMENT_NODE && next.tagName.toLowerCase() === "hr") {
        expandHorizontalRuleAndFocus(editor, next, "start");
        return true;
      }
    } else {
      const prev = editor.childNodes[range.startOffset - 1] as HTMLElement | undefined;
      if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.tagName.toLowerCase() === "hr") {
        expandHorizontalRuleAndFocus(editor, prev, key === "ArrowLeft" ? "end" : "start");
        return true;
      }
    }
    return false;
  }

  const block = getClosestBlock(range.startContainer, editor);
  if (!block) return false;

  const scope = getEditableScope(block);

  if (key === "ArrowRight") {
    if (!isCaretAtEndOfScope(scope, range)) return false;
    const nextHr = getAdjacentHrSibling(editor, block, "next");
    if (!nextHr) return false;
    expandHorizontalRuleAndFocus(editor, nextHr, "start");
    return true;
  }

  if (key === "ArrowLeft") {
    if (!isCaretAtBlockBoundaryStart(block, range)) return false;
    const prevHr = getAdjacentHrSibling(editor, block, "prev");
    if (!prevHr) return false;
    expandHorizontalRuleAndFocus(editor, prevHr, "end");
    return true;
  }

  const direction = key === "ArrowDown" ? "next" : "prev";
  const edge = key === "ArrowDown" ? "last" : "first";
  const targetHr = getAdjacentHrSibling(editor, block, direction);
  if (!targetHr) return false;
  if (!isCaretOnVisualEdgeLine(scope, range, edge)) return false;

  const caretRects = range.getClientRects();
  const caretRect =
    Array.from(caretRects).find((r) => r.height > 0) ?? range.getBoundingClientRect();
  const placement: "start" | { clientX: number } =
    hasVisibleContent(scope) && caretRect.height > 0 ? { clientX: caretRect.left } : "start";
  expandHorizontalRuleAndFocus(editor, targetHr, placement);
  return true;
}

function getSyntaxSpanFirstTextNode(syntaxSpan: HTMLElement): Text | null {
  const first = syntaxSpan.firstChild;
  if (first && first.nodeType === Node.TEXT_NODE) {
    return first as Text;
  }
  const walker = document.createTreeWalker(syntaxSpan, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

function getPrefixStopOffset(rawText: string): number {
  return rawText.endsWith(" ") ? Math.max(0, rawText.length - 1) : rawText.length;
}

function isFocusRightAfterSyntaxSpan(syntaxSpan: HTMLElement, focusRange: Range): boolean {
  if (syntaxSpan.contains(focusRange.startContainer)) return false;
  const probe = document.createRange();
  try {
    probe.setStartAfter(syntaxSpan);
    probe.setEnd(focusRange.startContainer, focusRange.startOffset);
  } catch {
    return false;
  }
  return (
    stripZeroWidth(probe.toString()).length === 0 && !probe.cloneContents().querySelector("img, br")
  );
}

function getContentStartTargetAfterSyntax(
  block: HTMLElement,
  syntaxSpan: HTMLElement | null,
): { node: Node; offset: number } {
  const scope = getEditableScope(block);
  const firstTarget = getFirstEditableTarget(scope);
  if (syntaxSpan && scope === block && firstTarget.node === block && firstTarget.offset === 0) {
    const idx = Array.prototype.indexOf.call(block.childNodes, syntaxSpan);
    if (idx >= 0) {
      return { node: block, offset: idx + 1 };
    }
  }
  if (firstTarget.node.nodeType === Node.TEXT_NODE && firstTarget.node.nodeValue === "\u200B") {
    return { node: firstTarget.node, offset: 1 };
  }
  return firstTarget;
}

function applyArrowTarget(
  sel: Selection,
  node: Node,
  offset: number,
  shiftKey: boolean,
  explicitAnchor?: { node: Node; offset: number },
): void {
  if (shiftKey && (explicitAnchor || sel.anchorNode)) {
    const anchorNode = explicitAnchor ? explicitAnchor.node : sel.anchorNode!;
    const anchorOffset = explicitAnchor ? explicitAnchor.offset : sel.anchorOffset;
    sel.setBaseAndExtent(anchorNode, anchorOffset, node, offset);
  } else {
    placeCaret(node, offset);
  }
}

/**
 * Obsidian-style keyboard navigation across block prefix markers (`- `, `1. `, `- [ ] `, `> `, and `# `):
 * - On `prefix` blocks, `ArrowLeft` from content start reveals the syntax prefix and stops right before the trailing space (`-| text`);
 *   `ArrowRight` from that stop jumps straight to content start and immediately hides the prefix (`• |text`).
 * - Supports both collapsed caret navigation and `Shift+Arrow` selection expansion/contraction.
 */
export function resolveBlockPrefixOnArrow(
  editor: HTMLElement,
  key: "ArrowLeft" | "ArrowRight",
  shiftKey = false,
): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  if (!shiftKey && !sel.isCollapsed) return false;

  const focusNode = shiftKey ? sel.focusNode : sel.getRangeAt(0).startContainer;
  const focusOffset = shiftKey ? sel.focusOffset : sel.getRangeAt(0).startOffset;
  if (!focusNode || !editor.contains(focusNode)) return false;
  if (isInsideTag(focusNode, editor, ["pre"])) return false;

  const block = getClosestBlock(focusNode, editor);
  if (!block) return false;
  const spec = getBlockSyntaxSpec(block);
  if (!spec || spec.kind === "code") return false;

  const focusRange = document.createRange();
  try {
    focusRange.setStart(focusNode, focusOffset);
    focusRange.collapse(true);
  } catch {
    return false;
  }

  let syntaxSpan = getDirectSyntaxChild(block, spec.kind);

  if (syntaxSpan && syntaxSpan.contains(focusNode)) {
    const rawText = stripZeroWidth((syntaxSpan.textContent || "").replace(/\u00A0/g, " "));
    const caretInSpan = getLogicalCaretOffsetInNode(syntaxSpan, focusNode, focusOffset);
    const stopOffset = getPrefixStopOffset(rawText);

    if (key === "ArrowRight" && caretInSpan >= stopOffset) {
      const target = getContentStartTargetAfterSyntax(block, syntaxSpan);
      applyArrowTarget(sel, target.node, target.offset, shiftKey);
      syncLiveMarkdownSyntax(editor);
      return true;
    }

    if (key === "ArrowLeft" && caretInSpan >= rawText.length && rawText.endsWith(" ")) {
      const spanText = getSyntaxSpanFirstTextNode(syntaxSpan);
      if (spanText) {
        applyArrowTarget(sel, spanText, stopOffset, shiftKey);
        syncLiveMarkdownSyntax(editor);
        return true;
      }
    }

    return false;
  }

  if (key === "ArrowRight") return false;

  const contentScope = getEditableScope(block);
  const atContentStart = syntaxSpan
    ? isFocusRightAfterSyntaxSpan(syntaxSpan, focusRange)
    : isCaretAtStartOfScope(contentScope, focusRange);
  if (!atContentStart) return false;

  let explicitAnchor: { node: Node; offset: number } | undefined;
  const rawAnchorNode = shiftKey ? sel.anchorNode : null;
  const rawAnchorOffset = shiftKey ? sel.anchorOffset : 0;
  const anchorWasAtScopeBoundary = Boolean(
    shiftKey &&
    rawAnchorNode &&
    (rawAnchorNode === block || rawAnchorNode === contentScope) &&
    rawAnchorOffset === 0,
  );

  if (!syntaxSpan) {
    activateBlockElement(block, null);
    syntaxSpan = getDirectSyntaxChild(block, spec.kind);
  }
  if (!syntaxSpan) return false;

  if (shiftKey && rawAnchorNode && (!rawAnchorNode.isConnected || anchorWasAtScopeBoundary)) {
    explicitAnchor = getContentStartTargetAfterSyntax(block, syntaxSpan);
  }

  const spanText = getSyntaxSpanFirstTextNode(syntaxSpan);
  if (!spanText) return false;
  const stopOffset = getPrefixStopOffset(
    stripZeroWidth((syntaxSpan.textContent || "").replace(/\u00A0/g, " ")),
  );
  applyArrowTarget(sel, spanText, stopOffset, shiftKey, explicitAnchor);
  syncLiveMarkdownSyntax(editor);
  return true;
}

/**
 * Returns the closest `prefix`-mode block (`li` or `blockquote`) when `(clientX, clientY)` falls in
 * the left visual marker gutter (`•`, `1.`, `☐`, quote border) along the block's first visual line.
 */
export function findPrefixBlockInGutter(
  editor: HTMLElement,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const candidates = Array.from(editor.querySelectorAll("li, blockquote")) as HTMLElement[];
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const block = candidates[i]!;
    if (isInsideTag(block, editor, ["pre"])) continue;
    const spec = getBlockSyntaxSpec(block);
    if (!spec || spec.revealMode !== "prefix") continue;

    const blockRect = block.getBoundingClientRect();
    if (blockRect.height <= 0) continue;
    if (clientY < blockRect.top - 4 || clientY > blockRect.bottom + 4) continue;

    const scope = getEditableScope(block);
    const firstTarget = getFirstEditableTarget(scope);
    const probe = document.createRange();
    let contentRect: DOMRect | null = null;
    try {
      probe.setStart(firstTarget.node, firstTarget.offset);
      probe.collapse(true);
      const rects = probe.getClientRects();
      const firstRect =
        Array.from(rects).find((r) => r.height > 0) ?? probe.getBoundingClientRect();
      if (firstRect.height > 0) {
        contentRect = firstRect;
      }
    } catch {
      contentRect = null;
    }

    const scopeLeft =
      scope !== block
        ? scope.getBoundingClientRect().left
        : blockRect.left + Number.parseFloat(getComputedStyle(block).paddingLeft || "0");
    const contentLeft = contentRect ? contentRect.left : scopeLeft;
    const lineTop = contentRect ? contentRect.top : blockRect.top;
    const lineBottom = contentRect
      ? contentRect.bottom
      : Math.min(blockRect.bottom, blockRect.top + 32);

    if (
      clientY >= lineTop - 4 &&
      clientY <= lineBottom + 4 &&
      clientX >= blockRect.left - 8 &&
      clientX < contentLeft - 2
    ) {
      return block;
    }
  }
  return null;
}
