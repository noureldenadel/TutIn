import {
  BLOCK_TAG_SET,
  HEADING_TAG_SET,
  cleanTrailingEmptyNodes,
  ensureElementHasBreakIfEmpty,
  getCaretBookmark,
  getClosestBlock,
  getCollapsedSelectionRange,
  getFirstEditableTarget,
  getTaskContentSpan,
  getTextWithoutArtifacts,
  hasVisibleContent,
  isInsideTag,
  placeCaret,
  placeCaretAtEnd,
  placeCaretAtStart,
  restoreCaretBookmark,
  sanitizeHttpUrl,
} from "./note-dom";
import { syncLiveMarkdownSyntax, unwrapBlockSyntaxToParagraph } from "./note-live-preview";

export function createTaskListItem(
  checked: boolean,
  contentNodes?: DocumentFragment,
): HTMLLIElement {
  const li = document.createElement("li");
  li.setAttribute("data-task", "true");
  li.setAttribute("data-checked", String(checked));

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.setAttribute("data-task-checkbox", "true");
  checkbox.contentEditable = "false";
  checkbox.checked = checked;
  if (checked) {
    checkbox.setAttribute("checked", "");
  }

  const contentSpan = document.createElement("span");
  contentSpan.setAttribute("data-task-content", "true");
  if (contentNodes && contentNodes.childNodes.length > 0) {
    contentSpan.appendChild(contentNodes);
  }
  cleanTrailingEmptyNodes(contentSpan);
  ensureElementHasBreakIfEmpty(contentSpan);

  li.appendChild(checkbox);
  li.appendChild(contentSpan);
  return li;
}

export function toggleTaskCheckboxElement(input: HTMLInputElement): void {
  const checked = input.checked;
  if (checked) {
    input.setAttribute("checked", "");
  } else {
    input.removeAttribute("checked");
  }
  const li = input.closest("li[data-task]");
  if (li) {
    li.setAttribute("data-checked", String(checked));
  }
}

function getPreviousBrBeforeCaret(container: HTMLElement, caretRange: Range): HTMLElement | null {
  const brs = Array.from(container.querySelectorAll("br"));
  let lastBrBefore: HTMLElement | null = null;
  for (const br of brs) {
    if (br.closest("pre")) continue;
    const brRange = document.createRange();
    brRange.setStartAfter(br);
    brRange.collapse(true);
    try {
      if (brRange.compareBoundaryPoints(Range.START_TO_START, caretRange) <= 0) {
        lastBrBefore = br;
      }
    } catch {
      // ignore cross-tree comparison errors
    }
  }
  return lastBrBefore;
}

function findBlockOrWrapInlineRun(editor: HTMLElement, range: Range): HTMLElement | null {
  const block = getClosestBlock(range.startContainer, editor);
  if (block && editor.contains(block)) {
    return block;
  }

  const container = range.startContainer;
  const offset = range.startOffset;

  if (container === editor) {
    const childAtBefore = offset > 0 ? editor.childNodes[offset - 1] : editor.childNodes[0];
    if (childAtBefore) {
      if (childAtBefore.nodeType === Node.ELEMENT_NODE) {
        const el = childAtBefore as HTMLElement;
        if (BLOCK_TAG_SET.has(el.tagName.toLowerCase())) {
          placeCaretAtEnd(el);
          return el;
        }
      }
      const p = document.createElement("p");
      editor.insertBefore(p, childAtBefore);
      p.appendChild(childAtBefore);
      placeCaretAtEnd(p);
      return p;
    }
    return null;
  }

  let directChild: Node | null = container;
  while (directChild && directChild.parentNode !== editor) {
    directChild = directChild.parentNode;
  }
  if (!directChild || directChild === editor) return null;

  const isInlineNode = (n: Node) =>
    n.nodeType === Node.TEXT_NODE ||
    (n.nodeType === Node.ELEMENT_NODE &&
      !BLOCK_TAG_SET.has((n as HTMLElement).tagName.toLowerCase()) &&
      !["ul", "ol", "hr", "table"].includes((n as HTMLElement).tagName.toLowerCase()));

  if (!isInlineNode(directChild)) return null;

  const inlineRun: Node[] = [directChild];
  let prev = directChild.previousSibling;
  while (prev && isInlineNode(prev)) {
    inlineRun.unshift(prev);
    prev = prev.previousSibling;
  }
  let next = directChild.nextSibling;
  while (next && isInlineNode(next)) {
    inlineRun.push(next);
    next = next.nextSibling;
  }

  const p = document.createElement("p");
  editor.insertBefore(p, inlineRun[0]!);
  for (const node of inlineRun) {
    p.appendChild(node);
  }
  placeCaret(container, offset);
  return p;
}

interface LineBlockContext {
  block: HTMLElement;
  editableScope: HTMLElement;
  prevBr: HTMLElement | null;
  lineBeforeText: string;
  extractTriggerAndSplitLine: () => DocumentFragment;
}

function getLineContextAtCaret(editor: HTMLElement, initialRange: Range): LineBlockContext | null {
  const block = findBlockOrWrapInlineRun(editor, initialRange);
  if (!block || !editor.contains(block)) return null;

  const sel = window.getSelection();
  const range =
    sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).startContainer)
      ? sel.getRangeAt(0)
      : initialRange;

  const editableScope =
    block.tagName.toLowerCase() === "li" && block.hasAttribute("data-task")
      ? getTaskContentSpan(block) || block
      : block;

  if (!editableScope.contains(range.startContainer)) return null;

  const prevBr = getPreviousBrBeforeCaret(editableScope, range);
  const prefixRange = document.createRange();
  if (prevBr && editableScope.contains(prevBr)) {
    prefixRange.setStartAfter(prevBr);
  } else {
    prefixRange.setStart(editableScope, 0);
  }
  prefixRange.setEnd(range.startContainer, range.startOffset);

  const rawFragment = prefixRange.cloneContents();
  const lineBeforeText = getTextWithoutArtifacts(rawFragment);

  const extractTriggerAndSplitLine = (): DocumentFragment => {
    prefixRange.deleteContents();
    editableScope.querySelectorAll("[data-ghost]").forEach((s) => s.remove());

    const afterRange = document.createRange();
    if (prevBr && editableScope.contains(prevBr)) {
      afterRange.setStartAfter(prevBr);
    } else {
      afterRange.setStart(editableScope, 0);
    }
    const nextBr = Array.from(editableScope.querySelectorAll("br")).find((br) => {
      if (br === prevBr) return false;
      const r = document.createRange();
      r.setStartBefore(br);
      r.collapse(true);
      try {
        return afterRange.compareBoundaryPoints(Range.START_TO_START, r) <= 0;
      } catch {
        return false;
      }
    });

    if (prevBr && editableScope.contains(prevBr)) {
      const tailFromPrevRange = document.createRange();
      tailFromPrevRange.setStartAfter(prevBr);
      tailFromPrevRange.setEnd(editableScope, editableScope.childNodes.length);
      const restOfBlockFrag = tailFromPrevRange.extractContents();
      prevBr.remove();

      const tempContainer = document.createElement("div");
      tempContainer.appendChild(restOfBlockFrag);

      const secondBr = tempContainer.querySelector("br");
      let currentLineFrag: DocumentFragment;
      if (secondBr) {
        const currentRange = document.createRange();
        currentRange.setStart(tempContainer, 0);
        currentRange.setEndBefore(secondBr);
        currentLineFrag = currentRange.extractContents();
        secondBr.remove();

        const hasTailNodes = Array.from(tempContainer.childNodes).some(
          (n) => n.nodeType !== Node.TEXT_NODE || (n.nodeValue || "").trim().length > 0,
        );
        if (hasTailNodes) {
          const tailBlock = document.createElement("p");
          while (tempContainer.firstChild) {
            tailBlock.appendChild(tempContainer.firstChild);
          }
          ensureElementHasBreakIfEmpty(tailBlock);
          block.parentNode?.insertBefore(tailBlock, block.nextSibling);
        }
      } else {
        currentLineFrag = document.createDocumentFragment();
        while (tempContainer.firstChild) {
          currentLineFrag.appendChild(tempContainer.firstChild);
        }
      }

      const splitBlock = document.createElement("p");
      splitBlock.appendChild(currentLineFrag);
      block.parentNode?.insertBefore(splitBlock, block.nextSibling);
      ensureElementHasBreakIfEmpty(block);

      splitBlock.setAttribute("data-split-target", "true");
      const frag = document.createDocumentFragment();
      while (splitBlock.firstChild) {
        frag.appendChild(splitBlock.firstChild);
      }
      return frag;
    }

    if (nextBr) {
      const restRange = document.createRange();
      restRange.setStartAfter(nextBr);
      restRange.setEnd(editableScope, editableScope.childNodes.length);
      const afterLines = restRange.extractContents();
      const hadMoreNodes = Array.from(afterLines.childNodes).some(
        (n) => n.nodeType !== Node.TEXT_NODE || (n.nodeValue || "").trim().length > 0,
      );
      if (hadMoreNodes) {
        nextBr.remove();
        const tailBlock = document.createElement("p");
        tailBlock.appendChild(afterLines);
        ensureElementHasBreakIfEmpty(tailBlock);
        block.parentNode?.insertBefore(tailBlock, block.nextSibling);
      }
    }

    const frag = document.createDocumentFragment();
    while (editableScope.firstChild) {
      frag.appendChild(editableScope.firstChild);
    }
    return frag;
  };

  return {
    block,
    editableScope,
    prevBr,
    lineBeforeText,
    extractTriggerAndSplitLine,
  };
}

function resolveReplacementTarget(editor: HTMLElement, originalBlock: HTMLElement): HTMLElement {
  const splitTarget = editor.querySelector('[data-split-target="true"]') as HTMLElement | null;
  if (splitTarget) {
    splitTarget.removeAttribute("data-split-target");
    return splitTarget;
  }
  return originalBlock;
}

function mergeListWithAdjacentSiblings(list: HTMLUListElement | HTMLOListElement): void {
  const isTask = list.hasAttribute("data-task-list");
  const tag = list.tagName.toLowerCase();

  const prev = list.previousElementSibling;
  if (
    prev &&
    prev.tagName.toLowerCase() === tag &&
    prev.hasAttribute("data-task-list") === isTask
  ) {
    while (list.firstChild) {
      prev.appendChild(list.firstChild);
    }
    list.remove();
    list = prev as HTMLUListElement | HTMLOListElement;
  }

  const next = list.nextElementSibling;
  if (
    next &&
    next.tagName.toLowerCase() === tag &&
    next.hasAttribute("data-task-list") === isTask
  ) {
    while (next.firstChild) {
      list.appendChild(next.firstChild);
    }
    next.remove();
  }
}

function createListItemWithContent(trailingFrag: DocumentFragment): HTMLLIElement {
  const li = document.createElement("li");
  li.appendChild(trailingFrag);
  cleanTrailingEmptyNodes(li);
  ensureElementHasBreakIfEmpty(li);
  return li;
}

function insertBlockReplacement(
  editor: HTMLElement,
  target: HTMLElement,
  replacement: HTMLElement,
  focusTarget?: HTMLElement,
): void {
  const parent = target.parentNode || editor;
  if (parent.contains(target)) {
    parent.replaceChild(replacement, target);
  } else {
    editor.appendChild(replacement);
  }
  if (replacement.tagName === "UL" || replacement.tagName === "OL") {
    mergeListWithAdjacentSiblings(replacement as HTMLUListElement | HTMLOListElement);
  }
  placeCaretAtStart(focusTarget || replacement);
}

function splitListAroundItem(list: HTMLElement, li: HTMLElement, replacementNode: Node): void {
  const parent = list.parentNode;
  if (!parent) return;
  const items = Array.from(list.children);
  const idx = items.indexOf(li);
  if (idx < 0) return;

  const afterItems = items.slice(idx + 1);
  li.remove();

  if (list.children.length === 0) {
    parent.replaceChild(replacementNode, list);
  } else {
    parent.insertBefore(replacementNode, list.nextSibling);
  }

  if (afterItems.length > 0) {
    const newList = list.cloneNode(false) as HTMLElement;
    if (newList.tagName === "OL") {
      const startAttr = Number.parseInt(list.getAttribute("start") || "1", 10);
      newList.setAttribute("start", String((Number.isFinite(startAttr) ? startAttr : 1) + idx + 1));
    }
    afterItems.forEach((item) => newList.appendChild(item));
    parent.insertBefore(newList, replacementNode.nextSibling);
  }
}

function tryAutoLinkBareUrlBeforeCaret(range: Range, insertSpaceAfter: boolean): boolean {
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const textNode = node as Text;
  const val = textNode.nodeValue || "";
  const offset = range.startOffset;
  const before = val.slice(0, offset);
  const after = val.slice(offset);

  const match = /(?:^|(\s))(https?:\/\/[^\s<>"'`]+)$/.exec(before);
  if (!match) return false;

  const leadingWs = match[1] || "";
  let rawUrl = match[2]!;
  let trailingPunct = "";
  while (/[.,;!?:]$/.test(rawUrl)) {
    trailingPunct = rawUrl.slice(-1) + trailingPunct;
    rawUrl = rawUrl.slice(0, -1);
  }
  while (rawUrl.endsWith(")")) {
    const opens = (rawUrl.match(/\(/g) || []).length;
    const closes = (rawUrl.match(/\)/g) || []).length;
    if (closes > opens) {
      trailingPunct = ")" + trailingPunct;
      rawUrl = rawUrl.slice(0, -1);
    } else {
      break;
    }
  }

  const safeHref = sanitizeHttpUrl(rawUrl);
  if (!safeHref) return false;

  const urlStart = match.index + leadingWs.length;
  const beforeText = val.slice(0, urlStart);

  const a = document.createElement("a");
  a.href = safeHref;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = rawUrl;

  const parent = textNode.parentNode;
  if (!parent) return false;

  if (beforeText) {
    parent.insertBefore(document.createTextNode(beforeText), textNode);
  }
  parent.insertBefore(a, textNode);

  if (insertSpaceAfter) {
    const afterStr = `${trailingPunct} ${after}`;
    const afterNode = document.createTextNode(afterStr);
    parent.insertBefore(afterNode, textNode);
    parent.removeChild(textNode);
    placeCaret(afterNode, trailingPunct.length + 1);
    return true;
  }

  if (trailingPunct || after) {
    const afterNode = document.createTextNode(`${trailingPunct}${after}`);
    parent.insertBefore(afterNode, textNode);
    parent.removeChild(textNode);
    placeCaret(afterNode, trailingPunct.length);
  } else {
    const anchor = document.createTextNode("\u200B");
    parent.insertBefore(anchor, textNode);
    parent.removeChild(textNode);
    placeCaret(anchor, 1);
  }
  return true;
}

function replaceWithHorizontalRule(
  editor: HTMLElement,
  target: HTMLElement,
  trailingFrag: DocumentFragment,
): void {
  const hr = document.createElement("hr");
  const pAfter = document.createElement("p");
  pAfter.appendChild(trailingFrag);
  cleanTrailingEmptyNodes(pAfter);
  ensureElementHasBreakIfEmpty(pAfter);
  const parent = target.parentNode || editor;
  parent.insertBefore(hr, target);
  parent.replaceChild(pAfter, target);
  placeCaretAtStart(pAfter);
}

function replaceWithCodeBlock(
  editor: HTMLElement,
  target: HTMLElement,
  lang: string,
  trailingFrag: DocumentFragment,
): void {
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  if (lang) code.setAttribute("data-lang", lang);
  const trailingText = (trailingFrag.textContent || "").replace(/\u200B/g, "");
  if (trailingText) {
    code.textContent = trailingText;
  } else {
    code.appendChild(document.createElement("br"));
  }
  pre.appendChild(code);
  insertBlockReplacement(editor, target, pre, code);
}

export function applyMarkdownOnSpace(editor: HTMLElement): boolean {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return false;

  if (isInsideTag(range.startContainer, editor, ["pre", "code"])) return false;

  const ctx = getLineContextAtCaret(editor, range);
  if (!ctx) return false;

  const trimmedStart = ctx.lineBeforeText.replace(/^\s+/, "");
  const leadingSpaces = ctx.lineBeforeText.length - trimmedStart.length;
  const tag = ctx.block.tagName.toLowerCase();

  // 1. Task checkbox inside an existing bullet `<li>`
  if (tag === "li" && !ctx.block.hasAttribute("data-task")) {
    const taskInLiMatch = /^\[([ xX]?)\]$/.exec(trimmedStart);
    if (taskInLiMatch) {
      const checked = taskInLiMatch[1]?.toLowerCase() === "x";
      const trailingFrag = ctx.extractTriggerAndSplitLine();
      const target = resolveReplacementTarget(editor, ctx.block);
      const taskLi = createTaskListItem(checked, trailingFrag);
      const parentList = target.parentElement;

      if (parentList && parentList.tagName.toLowerCase() === "ul") {
        if (parentList.children.length === 1) {
          parentList.setAttribute("data-task-list", "true");
          parentList.replaceChild(taskLi, target);
          mergeListWithAdjacentSiblings(parentList as HTMLUListElement);
        } else {
          const taskUl = document.createElement("ul");
          taskUl.setAttribute("data-task-list", "true");
          taskUl.appendChild(taskLi);
          splitListAroundItem(parentList, target, taskUl);
          mergeListWithAdjacentSiblings(taskUl);
        }
      } else {
        const taskUl = document.createElement("ul");
        taskUl.setAttribute("data-task-list", "true");
        taskUl.appendChild(taskLi);
        target.parentNode?.replaceChild(taskUl, target);
        mergeListWithAdjacentSiblings(taskUl);
      }
      placeCaretAtStart(taskLi);
      return true;
    }
  }

  if (tag !== "li") {
    // 2. Direct Task checkbox
    const taskMatch = /^(?:[-*+]\s+)?\[([ xX]?)\]$/.exec(trimmedStart);
    if (taskMatch) {
      const checked = taskMatch[1]?.toLowerCase() === "x";
      const trailingFrag = ctx.extractTriggerAndSplitLine();
      const target = resolveReplacementTarget(editor, ctx.block);
      const taskUl = document.createElement("ul");
      taskUl.setAttribute("data-task-list", "true");
      const taskLi = createTaskListItem(checked, trailingFrag);
      taskUl.appendChild(taskLi);
      insertBlockReplacement(editor, target, taskUl, taskLi);
      return true;
    }

    // 3. Horizontal rule
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmedStart)) {
      const trailingFrag = ctx.extractTriggerAndSplitLine();
      const target = resolveReplacementTarget(editor, ctx.block);
      replaceWithHorizontalRule(editor, target, trailingFrag);
      return true;
    }

    // 4. Fenced code block
    const codeBlockMatch = /^```([a-zA-Z0-9_-]*)$/.exec(trimmedStart);
    if (codeBlockMatch) {
      const trailingFrag = ctx.extractTriggerAndSplitLine();
      const target = resolveReplacementTarget(editor, ctx.block);
      replaceWithCodeBlock(editor, target, codeBlockMatch[1] || "", trailingFrag);
      return true;
    }

    // 5. Headings # .. ######
    const headingMatch = /^(#{1,6})$/.exec(trimmedStart);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const nextHeadingTag = `h${level}`;
      if (tag !== nextHeadingTag || ctx.prevBr) {
        const trailingFrag = ctx.extractTriggerAndSplitLine();
        const target = resolveReplacementTarget(editor, ctx.block);
        const heading = document.createElement(nextHeadingTag);
        heading.appendChild(trailingFrag);
        cleanTrailingEmptyNodes(heading);
        ensureElementHasBreakIfEmpty(heading);
        insertBlockReplacement(editor, target, heading);
        syncLiveMarkdownSyntax(editor);
        return true;
      }
    }

    // 6. Blockquote >
    if (trimmedStart === ">" && (tag !== "blockquote" || ctx.prevBr)) {
      const trailingFrag = ctx.extractTriggerAndSplitLine();
      const target = resolveReplacementTarget(editor, ctx.block);
      const bq = document.createElement("blockquote");
      bq.appendChild(trailingFrag);
      cleanTrailingEmptyNodes(bq);
      ensureElementHasBreakIfEmpty(bq);
      insertBlockReplacement(editor, target, bq);
      syncLiveMarkdownSyntax(editor);
      return true;
    }

    // 7. Unordered bullet list
    if (/^[-*+]$/.test(trimmedStart)) {
      const trailingFrag = ctx.extractTriggerAndSplitLine();
      const target = resolveReplacementTarget(editor, ctx.block);
      const prevEl = target.previousElementSibling;

      if (leadingSpaces >= 2 && prevEl && prevEl.tagName === "UL" && prevEl.lastElementChild) {
        const parentLi = prevEl.lastElementChild as HTMLElement;
        let subUl = parentLi.querySelector(":scope > ul") as HTMLUListElement | null;
        if (!subUl) {
          subUl = document.createElement("ul");
          parentLi.appendChild(subUl);
        }
        const li = createListItemWithContent(trailingFrag);
        subUl.appendChild(li);
        target.remove();
        placeCaretAtStart(li);
        return true;
      }

      const ul = document.createElement("ul");
      const li = createListItemWithContent(trailingFrag);
      ul.appendChild(li);
      insertBlockReplacement(editor, target, ul, li);
      return true;
    }

    // 8. Ordered list
    const orderedMatch = /^(\d{1,4})[.)]$/.exec(trimmedStart);
    if (orderedMatch) {
      const startNum = Number.parseInt(orderedMatch[1]!, 10);
      const trailingFrag = ctx.extractTriggerAndSplitLine();
      const target = resolveReplacementTarget(editor, ctx.block);
      const ol = document.createElement("ol");
      if (Number.isFinite(startNum) && startNum !== 1) {
        ol.setAttribute("start", String(startNum));
      }
      const li = createListItemWithContent(trailingFrag);
      ol.appendChild(li);
      insertBlockReplacement(editor, target, ol, li);
      return true;
    }
  }

  // 9. Auto-link bare URL
  if (!isInsideTag(range.startContainer, editor, ["a", "code", "pre"])) {
    if (tryAutoLinkBareUrlBeforeCaret(range, true)) {
      return true;
    }
  }

  return false;
}

function exitBlockToParagraph(block: HTMLElement): HTMLElement {
  const p = document.createElement("p");
  p.appendChild(document.createElement("br"));
  block.parentNode?.insertBefore(p, block.nextSibling);
  placeCaretAtStart(p);
  return p;
}

function handleEnterInsideCodeBlock(pre: HTMLElement, range: Range, shiftKey: boolean): boolean {
  const code = pre.querySelector("code") || pre;

  if (shiftKey) {
    exitBlockToParagraph(pre);
    return true;
  }

  const beforeRange = document.createRange();
  beforeRange.setStart(code, 0);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const afterRange = document.createRange();
  afterRange.setStart(range.startContainer, range.startOffset);
  afterRange.setEnd(code, code.childNodes.length);

  const beforeText = beforeRange.toString().replace(/\u200B/g, "");
  const afterText = afterRange.toString().replace(/\u200B/g, "");

  if (afterText.length === 0 && beforeText.endsWith("\n")) {
    const trimmed = beforeText.slice(0, -1);
    code.textContent = trimmed;
    if (!trimmed) code.appendChild(document.createElement("br"));
    exitBlockToParagraph(pre);
    return true;
  }

  const nlNode = document.createTextNode("\n");
  range.deleteContents();
  range.insertNode(nlNode);

  if (afterText.length === 0) {
    code.querySelectorAll("br[data-code-eol]").forEach((br) => br.remove());
    const eolBr = document.createElement("br");
    eolBr.setAttribute("data-code-eol", "true");
    nlNode.parentNode?.insertBefore(eolBr, nlNode.nextSibling);
  }

  placeCaret(nlNode, 1);
  return true;
}

function outdentListItem(li: HTMLElement): boolean {
  const list = li.parentElement;
  if (!list) return false;
  const parentLi = list.parentElement;

  if (!parentLi || parentLi.tagName.toLowerCase() !== "li" || !parentLi.parentElement) {
    const bookmark = getCaretBookmark(li);
    const isTask = li.hasAttribute("data-task");
    const p = document.createElement("p");
    if (isTask) {
      const span = getTaskContentSpan(li);
      if (span) {
        while (span.firstChild) p.appendChild(span.firstChild);
      }
    } else {
      Array.from(li.childNodes).forEach((child) => {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          ["ul", "ol"].includes((child as HTMLElement).tagName.toLowerCase())
        ) {
          return;
        }
        p.appendChild(child);
      });
    }
    cleanTrailingEmptyNodes(p);
    ensureElementHasBreakIfEmpty(p);
    splitListAroundItem(list, li, p);
    if (bookmark && !isTask) {
      restoreCaretBookmark(p, bookmark);
    } else {
      placeCaretAtStart(p);
    }
    return true;
  }

  const grandList = parentLi.parentElement;
  const siblingsAfter: HTMLElement[] = [];
  let next = li.nextElementSibling as HTMLElement | null;
  while (next) {
    siblingsAfter.push(next);
    next = next.nextElementSibling as HTMLElement | null;
  }

  if (siblingsAfter.length > 0) {
    let childSub = li.querySelector(":scope > ul, :scope > ol") as HTMLElement | null;
    if (!childSub) {
      childSub = list.cloneNode(false) as HTMLElement;
      li.appendChild(childSub);
    }
    siblingsAfter.forEach((sib) => childSub!.appendChild(sib));
  }

  grandList.insertBefore(li, parentLi.nextSibling);
  if (list.children.length === 0) {
    list.remove();
  }
  placeCaretAtStart(li);
  return true;
}

function indentListItem(li: HTMLElement): boolean {
  const prevLi = li.previousElementSibling as HTMLElement | null;
  const list = li.parentElement;
  if (!prevLi || !list || prevLi.tagName.toLowerCase() !== "li") return true;

  const isTask = li.hasAttribute("data-task");
  const listTag = list.tagName.toLowerCase();
  let subList = Array.from(prevLi.children).find(
    (c) => c.tagName.toLowerCase() === listTag && c.hasAttribute("data-task-list") === isTask,
  ) as HTMLElement | undefined;

  if (!subList) {
    subList = document.createElement(listTag);
    if (isTask) subList.setAttribute("data-task-list", "true");
    prevLi.appendChild(subList);
  }
  subList.appendChild(li);
  placeCaretAtStart(li);
  return true;
}

export function applyMarkdownOnEnter(editor: HTMLElement, shiftKey: boolean): boolean {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return false;

  const pre = isInsideTag(range.startContainer, editor, ["pre"]);
  if (pre) {
    return handleEnterInsideCodeBlock(pre, range, shiftKey);
  }

  if (shiftKey) return false;

  const ctx = getLineContextAtCaret(editor, range);
  if (!ctx) return false;

  const tag = ctx.block.tagName.toLowerCase();
  const trimmed = ctx.lineBeforeText.trim();

  if (tag !== "li" && !isInsideTag(range.startContainer, editor, ["code"])) {
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      const trailingFrag = ctx.extractTriggerAndSplitLine();
      const target = resolveReplacementTarget(editor, ctx.block);
      replaceWithHorizontalRule(editor, target, trailingFrag);
      return true;
    }

    const codeMatch = /^```([a-zA-Z0-9_-]*)$/.exec(trimmed);
    if (codeMatch) {
      const trailingFrag = ctx.extractTriggerAndSplitLine();
      const target = resolveReplacementTarget(editor, ctx.block);
      replaceWithCodeBlock(editor, target, codeMatch[1] || "", trailingFrag);
      return true;
    }
  }

  if (tag === "li" && ctx.block.hasAttribute("data-task")) {
    const scope = ctx.editableScope;
    const nestedLists = Array.from(ctx.block.querySelectorAll(":scope > ul, :scope > ol"));
    if (!hasVisibleContent(scope) && nestedLists.length === 0) {
      return outdentListItem(ctx.block);
    }

    const afterRange = document.createRange();
    afterRange.setStart(range.startContainer, range.startOffset);
    afterRange.setEnd(scope, scope.childNodes.length);
    const afterFrag = afterRange.extractContents();
    cleanTrailingEmptyNodes(scope);
    ensureElementHasBreakIfEmpty(scope);

    const newTaskLi = createTaskListItem(false, afterFrag);
    ctx.block.parentNode?.insertBefore(newTaskLi, ctx.block.nextSibling);
    placeCaretAtStart(newTaskLi);
    return true;
  }

  if (tag === "li" && !ctx.block.hasAttribute("data-task")) {
    const ownText = Array.from(ctx.block.childNodes)
      .filter(
        (n) => n.nodeType !== Node.ELEMENT_NODE || !["UL", "OL"].includes((n as Element).tagName),
      )
      .map((n) => getTextWithoutArtifacts(n))
      .join("")
      .trim();
    const hasImg = Array.from(ctx.block.children).some(
      (el) =>
        el.tagName === "IMG" || (!["UL", "OL"].includes(el.tagName) && el.querySelector("img")),
    );
    if (!ownText && !hasImg && !ctx.block.querySelector(":scope > ul, :scope > ol")) {
      return outdentListItem(ctx.block);
    }
  }

  if (tag === "blockquote") {
    const afterRange = document.createRange();
    afterRange.setStart(range.startContainer, range.startOffset);
    afterRange.setEnd(ctx.block, ctx.block.childNodes.length);
    const afterText = getTextWithoutArtifacts(afterRange.cloneContents()).trim();

    if (trimmed === "" && afterText === "") {
      if (ctx.prevBr) {
        const tailRange = document.createRange();
        tailRange.setStartBefore(ctx.prevBr);
        tailRange.setEnd(ctx.block, ctx.block.childNodes.length);
        tailRange.deleteContents();
      }
      if (!hasVisibleContent(ctx.block)) {
        const p = document.createElement("p");
        p.appendChild(document.createElement("br"));
        ctx.block.parentNode?.replaceChild(p, ctx.block);
        placeCaretAtStart(p);
      } else {
        exitBlockToParagraph(ctx.block);
      }
      syncLiveMarkdownSyntax(editor);
      return true;
    }

    const br = document.createElement("br");
    range.deleteContents();
    range.insertNode(br);
    if (afterText === "" && !br.nextSibling) {
      const sentinel = document.createElement("br");
      br.parentNode?.insertBefore(sentinel, br.nextSibling);
    }
    const r = document.createRange();
    r.setStartAfter(br);
    r.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    return true;
  }

  // Heading Enter: if caret sits at start of heading BEFORE syntax span, insert <p> above;
  // otherwise split into <p> below and collapse heading markers immediately.
  if (HEADING_TAG_SET.has(tag)) {
    const firstTextTarget = getFirstEditableTarget(ctx.block);
    const syntaxSpan = ctx.block.querySelector(':scope > span[data-md-syntax="heading"]');
    if (syntaxSpan && syntaxSpan.contains(range.startContainer)) {
      const p = document.createElement("p");
      p.appendChild(document.createElement("br"));
      ctx.block.parentNode?.insertBefore(p, ctx.block);
      placeCaret(firstTextTarget.node, firstTextTarget.offset);
      syncLiveMarkdownSyntax(editor);
      return true;
    }

    const afterRange = document.createRange();
    afterRange.setStart(range.startContainer, range.startOffset);
    afterRange.setEnd(ctx.block, ctx.block.childNodes.length);
    const afterFrag = afterRange.extractContents();
    ensureElementHasBreakIfEmpty(ctx.block);

    const p = document.createElement("p");
    p.appendChild(afterFrag);
    cleanTrailingEmptyNodes(p);
    ensureElementHasBreakIfEmpty(p);
    ctx.block.parentNode?.insertBefore(p, ctx.block.nextSibling);
    placeCaretAtStart(p);
    syncLiveMarkdownSyntax(editor);
    return true;
  }

  if (!isInsideTag(range.startContainer, editor, ["a", "code", "pre"])) {
    tryAutoLinkBareUrlBeforeCaret(range, false);
  }

  return false;
}

function isCaretAtStartOfScope(scope: HTMLElement, range: Range): boolean {
  const before = document.createRange();
  before.setStart(scope, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const frag = before.cloneContents();
  frag.querySelectorAll("[data-ghost], [data-task-checkbox]").forEach((el) => el.remove());
  const text = (frag.textContent || "").replace(/\u00A0/g, " ").replace(/\u200B/g, "");
  if (text.length > 0) return false;
  if (frag.querySelector("img, br")) return false;
  return true;
}

export function applyMarkdownOnBackspace(editor: HTMLElement): boolean {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return false;

  const block = getClosestBlock(range.startContainer, editor);
  if (!block) return false;
  const tag = block.tagName.toLowerCase();

  if (tag === "li" && block.hasAttribute("data-task")) {
    const scope = getTaskContentSpan(block) || block;
    if (scope.contains(range.startContainer) && isCaretAtStartOfScope(scope, range)) {
      const list = block.parentElement;
      if (!hasVisibleContent(scope)) {
        return outdentListItem(block);
      }
      const plainLi = document.createElement("li");
      while (scope.firstChild) plainLi.appendChild(scope.firstChild);
      Array.from(block.children).forEach((child) => {
        if (child !== scope && !child.hasAttribute("data-task-checkbox")) {
          plainLi.appendChild(child);
        }
      });
      ensureElementHasBreakIfEmpty(plainLi);
      if (list && list.children.length === 1) {
        list.removeAttribute("data-task-list");
        list.replaceChild(plainLi, block);
        mergeListWithAdjacentSiblings(list as HTMLUListElement);
      } else if (list) {
        const plainUl = document.createElement("ul");
        plainUl.appendChild(plainLi);
        splitListAroundItem(list, block, plainUl);
        mergeListWithAdjacentSiblings(plainUl);
      }
      placeCaretAtStart(plainLi);
      return true;
    }
  }

  if (tag === "li" && !block.hasAttribute("data-task") && isCaretAtStartOfScope(block, range)) {
    return outdentListItem(block);
  }

  if (
    (HEADING_TAG_SET.has(tag) || tag === "blockquote" || tag === "pre") &&
    isCaretAtStartOfScope(block, range)
  ) {
    if (tag === "pre") {
      const text = (block.textContent || "").replace(/\u200B/g, "");
      if (text.trim().length > 0) return false;
    } else if (block.querySelector(":scope > [data-md-syntax]")) {
      // Caret is before the visible `#`/`>` prefix at offset 0: on line 1 preserve the block,
      // otherwise demote with literal prefix text and let Backspace merge onto the previous line.
      if (!block.previousElementSibling) {
        return true;
      }
      unwrapBlockSyntaxToParagraph(block, false);
      return false;
    }
    const p = document.createElement("p");
    block.querySelectorAll(":scope > [data-md-syntax]").forEach((s) => s.remove());
    while (block.firstChild) {
      if (block.firstChild.nodeName === "CODE") {
        while (block.firstChild.firstChild) p.appendChild(block.firstChild.firstChild);
        block.firstChild.remove();
      } else {
        p.appendChild(block.firstChild);
      }
    }
    ensureElementHasBreakIfEmpty(p);
    block.parentNode?.replaceChild(p, block);
    placeCaretAtStart(p);
    syncLiveMarkdownSyntax(editor);
    return true;
  }

  return false;
}

export function applyMarkdownOnTab(editor: HTMLElement, shiftKey: boolean): boolean {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return false;

  const pre = isInsideTag(range.startContainer, editor, ["pre"]);
  if (pre) {
    if (!shiftKey) {
      const spaces = document.createTextNode("  ");
      range.deleteContents();
      range.insertNode(spaces);
      placeCaret(spaces, 2);
    } else if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const tn = range.startContainer as Text;
      const val = tn.nodeValue || "";
      const off = range.startOffset;
      const before = val.slice(0, off);
      const spacesMatch = /( {1,2})$/.exec(before);
      if (spacesMatch) {
        const removeLen = spacesMatch[1]!.length;
        tn.nodeValue = val.slice(0, off - removeLen) + val.slice(off);
        placeCaret(tn, off - removeLen);
      }
    }
    return true;
  }

  const block = getClosestBlock(range.startContainer, editor);
  if (block && block.tagName.toLowerCase() === "li") {
    return shiftKey ? outdentListItem(block) : indentListItem(block);
  }

  return false;
}

export function toggleTaskListCommand(editor: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.getRangeAt(0).startContainer)) {
    return false;
  }
  const range = sel.getRangeAt(0);
  const block = findBlockOrWrapInlineRun(editor, range);
  if (!block) return false;

  const tag = block.tagName.toLowerCase();
  if (tag === "li" && block.hasAttribute("data-task")) {
    const input = block.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
    if (input) {
      input.checked = !input.checked;
      toggleTaskCheckboxElement(input);
      return true;
    }
  }

  if (tag === "li") {
    const frag = document.createDocumentFragment();
    Array.from(block.childNodes).forEach((child) => {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        ["UL", "OL"].includes((child as HTMLElement).tagName)
      ) {
        return;
      }
      frag.appendChild(child);
    });
    const taskLi = createTaskListItem(false, frag);
    const parentList = block.parentElement;
    if (parentList && parentList.tagName === "UL" && parentList.children.length === 1) {
      parentList.setAttribute("data-task-list", "true");
      parentList.replaceChild(taskLi, block);
      mergeListWithAdjacentSiblings(parentList as HTMLUListElement);
    } else if (parentList) {
      const taskUl = document.createElement("ul");
      taskUl.setAttribute("data-task-list", "true");
      taskUl.appendChild(taskLi);
      splitListAroundItem(parentList, block, taskUl);
      mergeListWithAdjacentSiblings(taskUl);
    }
    placeCaretAtEnd(taskLi);
    return true;
  }

  const frag = document.createDocumentFragment();
  block.querySelectorAll(":scope > [data-md-syntax]").forEach((s) => s.remove());
  while (block.firstChild) {
    frag.appendChild(block.firstChild);
  }
  const taskUl = document.createElement("ul");
  taskUl.setAttribute("data-task-list", "true");
  const taskLi = createTaskListItem(false, frag);
  taskUl.appendChild(taskLi);
  block.parentNode?.replaceChild(taskUl, block);
  mergeListWithAdjacentSiblings(taskUl);
  placeCaretAtEnd(taskLi);
  syncLiveMarkdownSyntax(editor);
  return true;
}
