import {
  BLOCK_TAG_SET,
  INLINE_MARK_TAGS,
  MD_ACTIVE_ATTR,
  MD_SYNTAX_ATTR,
  ensureElementHasBreakIfEmpty,
  getClosestBlock,
  getCollapsedSelectionRange,
  getLastDescendantTextNode,
  getTextWithoutArtifacts,
  hasOwnInlineContent,
  hasVisibleContent,
  isInsideMarkdownSyntax,
  isInsideTag,
  placeCaret,
  placeCaretAtEnd,
  placeCaretAtStart,
  restoreCaretBookmark,
  sanitizeHttpUrl,
  getCaretBookmark,
  stripZeroWidth,
} from "./note-dom";
import {
  CLOSING_PLAIN_PAIR_CHARS,
  COLLAPSED_PLAIN_PAIRS,
  INLINE_LIVE_RULES,
  SELECTION_WRAP_DELIMITERS,
  createSyntaxSpan,
  getBlockSyntaxSpec,
  getDirectSyntaxChild,
} from "./note-specs";
import {
  activateInlineElement,
  deactivateElement,
  reconcileActiveMarkdownSyntax,
  syncLiveMarkdownSyntax,
} from "./note-live-preview";

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
  if (codeMatch && stripZeroWidth(codeMatch[1]!).length > 0) {
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
    stripZeroWidth(probe.toString()).length === 0 &&
    !probe.cloneContents().querySelector("img, br")
  ) {
    return { inlineEl: innerEl, closeSpan, charIndexInClose: 0 };
  }
  return null;
}

function stepOutAfterInline(editor: HTMLElement, inlineEl: HTMLElement): void {
  const parent = inlineEl.parentNode;
  if (!parent) return;
  const next = inlineEl.nextSibling;

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

function upgradeInlineElementTag(
  inlineEl: HTMLElement,
  nextTag: "strong" | "em",
  nextDelimiter: string,
): HTMLElement {
  const replacement = document.createElement(nextTag);
  replacement.setAttribute(MD_ACTIVE_ATTR, "true");
  while (inlineEl.firstChild) {
    replacement.appendChild(inlineEl.firstChild);
  }
  const openSpan = getDirectSyntaxChild(replacement, "open");
  const closeSpan = getDirectSyntaxChild(replacement, "close");
  if (openSpan) openSpan.textContent = nextDelimiter;
  if (closeSpan) closeSpan.textContent = nextDelimiter;
  inlineEl.replaceWith(replacement);
  return replacement;
}

function getEnclosingFullSelectionInline(range: Range, editor: HTMLElement): HTMLElement | null {
  let curr: Node | null = range.commonAncestorContainer;
  let inlineEl: HTMLElement | null = null;
  while (curr && curr !== editor) {
    if (curr.nodeType === Node.ELEMENT_NODE) {
      const el = curr as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (BLOCK_TAG_SET.has(tag)) break;
      if (INLINE_MARK_TAGS.has(tag)) {
        inlineEl = el;
        break;
      }
    }
    curr = curr.parentNode;
  }
  if (!inlineEl) return null;

  const openSpan = getDirectSyntaxChild(inlineEl, "open");
  const closeSpan = getDirectSyntaxChild(inlineEl, "close");

  const beforeProbe = document.createRange();
  if (openSpan) {
    beforeProbe.setStartAfter(openSpan);
  } else {
    beforeProbe.setStart(inlineEl, 0);
  }
  beforeProbe.setEnd(range.startContainer, range.startOffset);
  if (stripZeroWidth(beforeProbe.toString()).length > 0) return null;

  const afterProbe = document.createRange();
  afterProbe.setStart(range.endContainer, range.endOffset);
  if (closeSpan) {
    afterProbe.setEndBefore(closeSpan);
  } else {
    afterProbe.setEnd(inlineEl, inlineEl.childNodes.length);
  }
  if (stripZeroWidth(afterProbe.toString()).length > 0) return null;

  return inlineEl;
}

function selectInlineContent(sel: Selection, inlineEl: HTMLElement): void {
  const openSpan = getDirectSyntaxChild(inlineEl, "open");
  const closeSpan = getDirectSyntaxChild(inlineEl, "close");
  const nextRange = document.createRange();
  if (openSpan && openSpan.nextSibling) {
    nextRange.setStartBefore(openSpan.nextSibling);
  } else {
    nextRange.setStart(inlineEl, 0);
  }
  if (closeSpan && closeSpan.previousSibling) {
    nextRange.setEndAfter(closeSpan.previousSibling);
  } else {
    nextRange.setEnd(inlineEl, inlineEl.childNodes.length);
  }
  sel.removeAllRanges();
  sel.addRange(nextRange);
}

export function wrapSelectionWithDelimiter(editor: HTMLElement, key: string): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return false;
  if (isInsideTag(range.commonAncestorContainer, editor, ["pre", "code"])) return false;

  const selectedText = range.toString();
  if (!selectedText) return false;

  // 1. Pressing `*` or `_` a second time (`**` / `__`) on a selection already inside `<em>`
  //    upgrades `<em>` in-place to `<strong>` (Bold), and a 3rd press (`***`) adds inner `<em>` (Bold+Italic).
  if (key === "*" || key === "_") {
    const enclosingInline = getEnclosingFullSelectionInline(range, editor);
    if (enclosingInline) {
      const enclosingTag = enclosingInline.tagName.toLowerCase();
      if (enclosingTag === "em" || enclosingTag === "i") {
        const parentTag = enclosingInline.parentElement?.tagName.toLowerCase();
        if (parentTag === "strong" || parentTag === "b") {
          // Already `***text***` (`<strong><em>text</em></strong>`)
          return true;
        }
        const openSpan = getDirectSyntaxChild(enclosingInline, "open");
        const existingChar = openSpan?.textContent?.[0] || "*";
        if (existingChar === key) {
          const upgraded = upgradeInlineElementTag(enclosingInline, "strong", `${key}${key}`);
          selectInlineContent(sel, upgraded);
          syncLiveMarkdownSyntax(editor);
          return true;
        }
      }
    }
  }

  // 2. Pressing `~` or `=` a second time (`~~` / `==`) on a selection already wrapped in `~...~` or `=...=`
  //    upgrades it into `<s data-md-active="true">` or `<mark data-md-active="true">`.
  if (
    (key === "~" || key === "=") &&
    range.startContainer === range.endContainer &&
    range.startContainer.nodeType === Node.TEXT_NODE
  ) {
    const tn = range.startContainer as Text;
    const val = tn.nodeValue || "";
    const startOff = range.startOffset;
    const endOff = range.endOffset;
    if (startOff > 0 && endOff < val.length && val[startOff - 1] === key && val[endOff] === key) {
      const tag = key === "~" ? "s" : "mark";
      const delimiter = `${key}${key}`;
      const el = document.createElement(tag);
      el.setAttribute(MD_ACTIVE_ATTR, "true");
      const openSpan = createSyntaxSpan("open", delimiter);
      const contentNode = document.createTextNode(selectedText);
      const closeSpan = createSyntaxSpan("close", delimiter);
      el.appendChild(openSpan);
      el.appendChild(contentNode);
      el.appendChild(closeSpan);

      const replaceRange = document.createRange();
      replaceRange.setStart(tn, startOff - 1);
      replaceRange.setEnd(tn, endOff + 1);
      replaceRange.deleteContents();
      replaceRange.insertNode(el);

      const nextRange = document.createRange();
      nextRange.selectNodeContents(contentNode);
      sel.removeAllRanges();
      sel.addRange(nextRange);
      syncLiveMarkdownSyntax(editor);
      return true;
    }
  }

  // 3. Single-char live inline wrappers (`` ` ``, `*`, `_`).
  if (key === "`" || key === "*" || key === "_") {
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

  // 4. Plain pair wrappers (`(`, `[`, `"`, first `~`, first `=`).
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
 * for `` ` ``, `*`, `_`, `~`, `=`, `(`, `)`, `[`, `]`, and `"`.
 */
export function handleMarkdownDelimiterKeyDown(editor: HTMLElement, key: string): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;

  if (!range.collapsed) {
    if (["(", "[", '"', "`", "*", "_", "~", "="].includes(key)) {
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
      if (key === ")") {
        applyInlineMarkdownAtCaret(editor);
      }
      syncLiveMarkdownSyntax(editor);
      return true;
    }
  }

  // 2. Check if caret sits at the closing delimiter of an active inline mark.
  const overtype = getInlineAtCaretForOvertype(editor, range);
  if (overtype) {
    const { inlineEl, closeSpan, charIndexInClose } = overtype;
    const tag = inlineEl.tagName.toLowerCase();
    const rule = INLINE_LIVE_RULES[tag];
    const openSpan = getDirectSyntaxChild(inlineEl, "open");
    const activeDelimChar = openSpan?.textContent?.[0] || rule?.delimiter[0];
    if (rule && activeDelimChar === key) {
      const innerEmpty = getTextWithoutArtifacts(inlineEl).length === 0;

      if ((tag === "em" || tag === "i") && (key === "*" || key === "_") && innerEmpty) {
        const upgraded = upgradeInlineElementTag(inlineEl, "strong", `${key}${key}`);
        const anchor = Array.from(upgraded.childNodes).find(
          (n) => n.nodeType === Node.TEXT_NODE,
        ) as Text | undefined;
        if (anchor) {
          placeCaret(anchor, anchor.nodeValue?.length ?? 0);
        }
        syncLiveMarkdownSyntax(editor);
        return true;
      }

      if ((tag === "strong" || tag === "b") && (key === "*" || key === "_") && innerEmpty) {
        const block = getClosestBlock(inlineEl, editor);
        if (
          block &&
          ["p", "div"].includes(block.tagName.toLowerCase()) &&
          getTextWithoutArtifacts(block).length === 0 &&
          block.querySelectorAll("img").length === 0
        ) {
          const tn = document.createTextNode(`${key}${key}${key}`);
          inlineEl.replaceWith(tn);
          placeCaret(tn, 3);
          syncLiveMarkdownSyntax(editor);
          return true;
        }
      }

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

      if (charIndexInClose + 1 < rule.delimiter.length) {
        const closeTextNode = closeSpan.firstChild;
        if (closeTextNode) {
          placeCaret(closeTextNode, charIndexInClose + 1);
          return true;
        }
      }

      if (innerEmpty) {
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

  if (isInsideTag(range.startContainer, editor, ["code"])) return false;
  if (isInsideMarkdownSyntax(range.startContainer, editor)) return false;

  const beforeInNode =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? stripZeroWidth((range.startContainer.nodeValue || "").slice(0, range.startOffset))
      : "";

  // 3. Auto-pair `` ` `` -> `` `|` `` (skip 3rd backtick for fenced blocks & odd backtick closes).
  if (key === "`") {
    if (beforeInNode.endsWith("\\") || beforeInNode.endsWith("``")) return false;
    if (countUnpairedToken(beforeInNode, "`") % 2 === 1) {
      return false;
    }
    return insertActiveInlinePair(editor, range, "code", "`");
  }

  // 4. Auto-pair `*` -> `*|*`
  if (key === "*") {
    if (!isDelimiterOpenAllowed(beforeInNode)) return false;
    const starCount = countUnpairedToken(beforeInNode.replace(/\*\*/g, ""), "*");
    if (starCount % 2 === 1) return false;
    return insertActiveInlinePair(editor, range, "em", "*");
  }

  // 5. Auto-pair `~~` and `==` on the 2nd consecutive char when opening
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
 * plain delimiter text when Space is pressed immediately inside it.
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
 * Handles Backspace inside auto-paired plain delimiters (`()`, `[]`, `""`) and immediately after
 * an opening block/inline syntax marker (`### `, `> `, `- `, `**`, `` ` ``, etc.).
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

  // 2. Trailing zero-width exit anchor right after an inline mark -> step into closing delimiter.
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

    if (
      openSpan &&
      !openSpan.contains(range.startContainer) &&
      !closeSpan?.contains(range.startContainer)
    ) {
      const probe = document.createRange();
      probe.setStartAfter(openSpan);
      probe.setEnd(range.startContainer, range.startOffset);
      if (
        stripZeroWidth(probe.toString()).length === 0 &&
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

  // 4. Block syntax prefix (`heading`, `blockquote`, non-empty `list`):
  //    caret immediately after `[data-md-syntax]` -> delete trailing space & unwrap to `<p>`.
  //    (Empty list items fall through to `applyMarkdownOnBackspace` for clean list exit/outdent.)
  const block = getClosestBlock(range.startContainer, editor);
  if (block && block.hasAttribute(MD_ACTIVE_ATTR)) {
    const spec = getBlockSyntaxSpec(block);
    if (spec && spec.kind !== "code") {
      if (spec.kind === "list" && !hasOwnInlineContent(block)) {
        return false;
      }
      const blockSpan = getDirectSyntaxChild(block, spec.kind);
      if (blockSpan && !blockSpan.contains(range.startContainer)) {
        const probe = document.createRange();
        probe.setStartAfter(blockSpan);
        probe.setEnd(range.startContainer, range.startOffset);
        if (
          stripZeroWidth(probe.toString()).length === 0 &&
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
    const text = stripZeroWidth(existing.textContent || "");
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
      return stripZeroWidth(tailProbe.toString()).length === 0;
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
    if (stripZeroWidth(probe.toString()).length > 0) return false;
    return !probe.cloneContents().querySelector("img, br");
  }

  if (openSpan?.contains(range.startContainer)) {
    const headProbe = document.createRange();
    headProbe.setStart(openSpan, 0);
    headProbe.setEnd(range.startContainer, range.startOffset);
    return stripZeroWidth(headProbe.toString()).length === 0;
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
  if (stripZeroWidth(probe.toString()).length > 0) return false;
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
  const next = inlineEl.nextSibling;

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
            placeCaretAtStart(next as HTMLElement);
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
    if (stripZeroWidth(tailRange.toString()).length > 0) {
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
