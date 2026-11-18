import {
  HEADING_TAG_SET,
  INLINE_WRAPPER_TAGS,
  NOTE_IMAGE_BLOCK_ATTR,
  NOTE_IMAGE_TAIL_ATTR,
  applyImageBlockAlignment,
  getClosestBlock,
  getCollapsedSelectionRange,
  getEditableScope,
  getTextWithoutArtifacts,
  getTopLevelBlock,
  hasVisibleContent,
  hasVisibleFragmentContent,
  inferImageAlignmentFromContext,
  isCaretAtBlockBoundaryStart,
  isCaretAtEndOfScope,
  isCaretAtStartOfScope,
  isCaretOnVisualEdgeLine,
  normalizeEmptyBreak,
  placeCaretAtEnd,
  placeCaretAtStart,
  resolveFocusTarget,
  syncImageBlockAlignments,
} from "./note-dom";
import { createTaskListItem } from "./note-specs";
import { expandHorizontalRuleAndFocus, syncLiveMarkdownSyntax } from "./note-live-preview";

export { applyImageBlockAlignment, inferImageAlignmentFromContext, syncImageBlockAlignments };

export function isImageBlockElement(node: Node | null): boolean {
  return (
    Boolean(node) &&
    node!.nodeType === Node.ELEMENT_NODE &&
    (node as HTMLElement).hasAttribute(NOTE_IMAGE_BLOCK_ATTR)
  );
}

export function createImageAtomBlock(
  img: HTMLImageElement,
  align?: "left" | "right",
): HTMLDivElement {
  const block = document.createElement("div");
  block.setAttribute(NOTE_IMAGE_BLOCK_ATTR, "true");
  block.contentEditable = "false";
  if (align) {
    applyImageBlockAlignment(block, align);
  }
  img.draggable = false;
  img.setAttribute("draggable", "false");
  block.appendChild(img);
  return block;
}

function isExclusiveImageContainer(el: HTMLElement): boolean {
  if (el.querySelectorAll("img").length !== 1) return false;
  if (el.querySelector("ul, ol, pre, blockquote, hr, h1, h2, h3, h4, h5, h6")) return false;
  return getTextWithoutArtifacts(el).trim().length === 0;
}

function unwrapExclusiveImgWrapper(img: HTMLImageElement, stopAt: HTMLElement): HTMLElement {
  let curr: HTMLElement = img;
  while (
    curr.parentElement &&
    curr.parentElement !== stopAt &&
    ["DIV", "P"].includes(curr.parentElement.tagName) &&
    isExclusiveImageContainer(curr.parentElement)
  ) {
    curr = curr.parentElement;
  }
  return curr;
}

function normalizeImageAtomAttributes(block: HTMLElement, img: HTMLImageElement): void {
  block.setAttribute(NOTE_IMAGE_BLOCK_ATTR, "true");
  block.contentEditable = "false";
  if (block.style.margin === "8px 0" || block.style.margin === "8px 0px") {
    block.style.margin = "";
    if (!block.getAttribute("style")) {
      block.removeAttribute("style");
    }
  }
  img.draggable = false;
  img.setAttribute("draggable", "false");
  Array.from(block.childNodes).forEach((child) => {
    if (child !== img) {
      child.remove();
    }
  });
}

function isInlineRootNode(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return true;
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as HTMLElement;
  if (el.hasAttribute(NOTE_IMAGE_BLOCK_ATTR)) return false;
  return el.tagName === "BR" || INLINE_WRAPPER_TAGS.has(el.tagName.toLowerCase());
}

export function normalizeEditorImageBlocks(editor: HTMLElement): boolean {
  let mutated = false;

  editor.querySelectorAll(`[${NOTE_IMAGE_BLOCK_ATTR}]`).forEach((el) => {
    if (!el.querySelector("img")) {
      el.remove();
      mutated = true;
    }
  });

  if (!editor.querySelector("img")) {
    editor.querySelectorAll(`p[${NOTE_IMAGE_TAIL_ATTR}]`).forEach((p) => {
      if (!hasVisibleContent(p as HTMLElement)) {
        p.remove();
        mutated = true;
      } else {
        p.removeAttribute(NOTE_IMAGE_TAIL_ATTR);
      }
    });
    return mutated;
  }

  for (const img of Array.from(editor.querySelectorAll("img"))) {
    if (!img.isConnected || !editor.contains(img)) continue;

    if (img.parentElement === editor) {
      const atom = createImageAtomBlock(img.cloneNode(true) as HTMLImageElement);
      img.replaceWith(atom);
      mutated = true;
      continue;
    }

    const parent = img.parentElement;
    if (
      parent &&
      parent.parentElement === editor &&
      parent.tagName === "DIV" &&
      isExclusiveImageContainer(parent)
    ) {
      const hadAttr = parent.hasAttribute(NOTE_IMAGE_BLOCK_ATTR);
      const wasIsolated = parent.contentEditable === "false";
      normalizeImageAtomAttributes(parent, img);
      if (!hadAttr || !wasIsolated) mutated = true;
      continue;
    }

    const topBlock = getTopLevelBlock(img, editor);
    if (!topBlock) continue;

    if (topBlock.tagName === "P" && isExclusiveImageContainer(topBlock)) {
      const atom = createImageAtomBlock(img);
      topBlock.replaceWith(atom);
      mutated = true;
      continue;
    }

    if (topBlock.tagName === "UL" || topBlock.tagName === "OL") {
      const directLi = Array.from(topBlock.children).find(
        (child) => child.tagName === "LI" && child.contains(img),
      ) as HTMLLIElement | undefined;
      const li = directLi || (img.closest("li") as HTMLLIElement | null);
      if (li && li.parentElement === topBlock) {
        const pivot = unwrapExclusiveImgWrapper(img, li);
        const afterRange = document.createRange();
        afterRange.setStartAfter(pivot);
        afterRange.setEnd(li, li.childNodes.length);
        const trailingLiFrag = afterRange.extractContents();

        const trailingSiblings: HTMLLIElement[] = [];
        let sib = li.nextElementSibling;
        while (sib) {
          const next = sib.nextElementSibling;
          if (sib.tagName === "LI") {
            trailingSiblings.push(sib as HTMLLIElement);
          }
          sib = next;
        }

        pivot.remove();
        const atom = createImageAtomBlock(img);
        const anchor = topBlock.nextSibling;
        editor.insertBefore(atom, anchor);

        const trailingHasContent = hasVisibleFragmentContent(trailingLiFrag);
        if (trailingHasContent || trailingSiblings.length > 0) {
          const contList = document.createElement(topBlock.tagName.toLowerCase());
          if (topBlock.hasAttribute("data-task-list")) {
            contList.setAttribute("data-task-list", "true");
          }
          if (trailingHasContent) {
            if (topBlock.hasAttribute("data-task-list")) {
              contList.appendChild(createTaskListItem(false, trailingLiFrag));
            } else {
              const newLi = document.createElement("li");
              newLi.appendChild(trailingLiFrag);
              normalizeEmptyBreak(newLi);
              contList.appendChild(newLi);
            }
          }
          for (const t of trailingSiblings) {
            contList.appendChild(t);
          }
          editor.insertBefore(contList, anchor);
        }

        if (!hasVisibleContent(li)) {
          li.remove();
        }
        if (!topBlock.querySelector("li")) {
          topBlock.remove();
        }
        mutated = true;
        continue;
      }
    }

    const pivot = unwrapExclusiveImgWrapper(img, topBlock);
    const afterRange = document.createRange();
    afterRange.setStartAfter(pivot);
    afterRange.setEnd(topBlock, topBlock.childNodes.length);
    const trailingFrag = afterRange.extractContents();
    pivot.remove();

    const atom = createImageAtomBlock(img);
    const anchor = topBlock.nextSibling;
    editor.insertBefore(atom, anchor);

    if (hasVisibleFragmentContent(trailingFrag)) {
      const topTag = topBlock.tagName.toLowerCase();
      const afterTag = HEADING_TAG_SET.has(topTag) || topTag === "blockquote" ? topTag : "p";
      const trailingBlock = document.createElement(afterTag);
      trailingBlock.appendChild(trailingFrag);
      normalizeEmptyBreak(trailingBlock);
      editor.insertBefore(trailingBlock, anchor);
    }

    if (!hasVisibleContent(topBlock)) {
      topBlock.remove();
    }
    mutated = true;
  }

  let inlineRun: Node[] = [];
  const flushInlineRun = (beforeNode: Node | null) => {
    if (inlineRun.length === 0) return;
    const hasTextOrInline = inlineRun.some((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (
          (node.nodeValue || "")
            .replace(/\u00A0/g, " ")
            .replace(/\u200B/g, "")
            .trim().length > 0
        );
      }
      return node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName !== "BR";
    });
    if (!hasTextOrInline) {
      inlineRun.forEach((n) => n.parentNode?.removeChild(n));
    } else {
      const p = document.createElement("p");
      for (const n of inlineRun) {
        p.appendChild(n);
      }
      normalizeEmptyBreak(p);
      editor.insertBefore(p, beforeNode);
    }
    inlineRun = [];
    mutated = true;
  };

  for (const child of Array.from(editor.childNodes)) {
    if (isInlineRootNode(child)) {
      inlineRun.push(child);
    } else {
      flushInlineRun(child);
    }
  }
  flushInlineRun(null);

  syncImageTailParagraphs(editor);
  if (syncImageBlockAlignments(editor)) {
    mutated = true;
  }

  const lastEl = editor.lastElementChild as HTMLElement | null;
  if (lastEl && isImageBlockElement(lastEl)) {
    const pTail = document.createElement("p");
    pTail.setAttribute(NOTE_IMAGE_TAIL_ATTR, "true");
    pTail.appendChild(document.createElement("br"));
    editor.appendChild(pTail);
    mutated = true;
  }

  return mutated;
}

export function syncImageTailParagraphs(editor: HTMLElement): void {
  editor.querySelectorAll(`p[${NOTE_IMAGE_TAIL_ATTR}]`).forEach((p) => {
    if (hasVisibleContent(p as HTMLElement)) {
      p.removeAttribute(NOTE_IMAGE_TAIL_ATTR);
    }
  });
}

function getAdjacentImageBlock(
  editor: HTMLElement,
  block: HTMLElement,
  direction: "prev" | "next",
): HTMLElement | null {
  if (block.tagName.toLowerCase() === "li") {
    const topBlock = getTopLevelBlock(block, editor);
    if (!topBlock || (topBlock.tagName !== "UL" && topBlock.tagName !== "OL")) return null;
    if (direction === "prev") {
      if (topBlock.querySelector("li") !== block) return null;
      return isImageBlockElement(topBlock.previousElementSibling)
        ? (topBlock.previousElementSibling as HTMLElement)
        : null;
    }
    const items = topBlock.querySelectorAll("li");
    if (items[items.length - 1] !== block) return null;
    return isImageBlockElement(topBlock.nextElementSibling)
      ? (topBlock.nextElementSibling as HTMLElement)
      : null;
  }

  const topBlock = block.parentElement === editor ? block : getTopLevelBlock(block, editor);
  if (!topBlock) return null;
  const sibling =
    direction === "prev" ? topBlock.previousElementSibling : topBlock.nextElementSibling;
  return isImageBlockElement(sibling) ? (sibling as HTMLElement) : null;
}

export function resolveImageBoundaryBeforeBackspace(editor: HTMLElement): HTMLImageElement | null {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return null;
  const block = getClosestBlock(range.startContainer, editor);
  if (!block || block.tagName.toLowerCase() === "li") return null;
  if (!isCaretAtStartOfScope(block, range)) return null;

  const prevImgBlock = getAdjacentImageBlock(editor, block, "prev");
  if (!prevImgBlock) return null;

  if (
    block.tagName.toLowerCase() === "p" &&
    !hasVisibleContent(block) &&
    block.nextElementSibling
  ) {
    block.remove();
  }
  return prevImgBlock.querySelector("img");
}

export function resolveImageBoundaryBeforeDelete(editor: HTMLElement): HTMLImageElement | null {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return null;
  const block = getClosestBlock(range.startContainer, editor);
  if (!block) return null;
  const scope = getEditableScope(block);
  if (!isCaretAtEndOfScope(scope, range)) return null;

  const nextImgBlock = getAdjacentImageBlock(editor, block, "next");
  return nextImgBlock ? nextImgBlock.querySelector("img") : null;
}

export function resolveArrowIntoImageBlock(
  editor: HTMLElement,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
): HTMLImageElement | null {
  const range = getCollapsedSelectionRange(editor);
  if (!range) return null;
  const block = getClosestBlock(range.startContainer, editor);
  if (!block) return null;

  const scope = getEditableScope(block);

  if (key === "ArrowRight") {
    if (!isCaretAtEndOfScope(scope, range)) return null;
    const nextImgBlock = getAdjacentImageBlock(editor, block, "next");
    return nextImgBlock ? nextImgBlock.querySelector("img") : null;
  }

  if (key === "ArrowLeft") {
    if (!isCaretAtBlockBoundaryStart(block, range)) return null;
    const prevImgBlock = getAdjacentImageBlock(editor, block, "prev");
    return prevImgBlock ? prevImgBlock.querySelector("img") : null;
  }

  if (key === "ArrowDown") {
    const nextImgBlock = getAdjacentImageBlock(editor, block, "next");
    if (!nextImgBlock) return null;
    if (!isCaretOnVisualEdgeLine(scope, range, "last")) return null;
    return nextImgBlock.querySelector("img");
  }

  const prevImgBlock = getAdjacentImageBlock(editor, block, "prev");
  if (!prevImgBlock) return null;
  if (!isCaretOnVisualEdgeLine(scope, range, "first")) return null;
  return prevImgBlock.querySelector("img");
}

export function moveCaretOutOfImageBlock(
  editor: HTMLElement,
  imgEl: HTMLImageElement,
  direction: "before" | "after" | "enter",
): { nextSelectedImage: HTMLImageElement | null; mutatedDom: boolean } {
  const block = getTopLevelBlock(imgEl, editor);
  if (!block) return { nextSelectedImage: null, mutatedDom: false };

  if (direction === "before") {
    const prev = block.previousElementSibling as HTMLElement | null;
    if (prev && isImageBlockElement(prev)) {
      return { nextSelectedImage: prev.querySelector("img"), mutatedDom: false };
    }
    if (prev && prev.tagName === "HR") {
      editor.focus({ preventScroll: true });
      expandHorizontalRuleAndFocus(editor, prev, "end");
      return { nextSelectedImage: null, mutatedDom: false };
    }
    if (prev) {
      editor.focus({ preventScroll: true });
      placeCaretAtEnd(resolveFocusTarget(prev, "end"));
      syncLiveMarkdownSyntax(editor);
      return { nextSelectedImage: null, mutatedDom: false };
    }
    const pBefore = document.createElement("p");
    pBefore.appendChild(document.createElement("br"));
    editor.insertBefore(pBefore, block);
    editor.focus({ preventScroll: true });
    placeCaretAtStart(pBefore);
    syncLiveMarkdownSyntax(editor);
    return { nextSelectedImage: null, mutatedDom: true };
  }

  const next = block.nextElementSibling as HTMLElement | null;
  if (direction === "after" && next && isImageBlockElement(next)) {
    return { nextSelectedImage: next.querySelector("img"), mutatedDom: false };
  }
  if (direction === "after" && next && next.tagName === "HR") {
    editor.focus({ preventScroll: true });
    expandHorizontalRuleAndFocus(editor, next, "start");
    return { nextSelectedImage: null, mutatedDom: false };
  }

  const canReuseNext =
    direction === "enter"
      ? Boolean(next && next.tagName === "P" && !hasVisibleContent(next))
      : Boolean(next && !isImageBlockElement(next) && next.tagName !== "HR");

  if (canReuseNext && next) {
    editor.focus({ preventScroll: true });
    placeCaretAtStart(resolveFocusTarget(next, "start"));
    syncLiveMarkdownSyntax(editor);
    return { nextSelectedImage: null, mutatedDom: false };
  }

  const pAfter = document.createElement("p");
  if (direction !== "enter" && !block.nextElementSibling) {
    pAfter.setAttribute(NOTE_IMAGE_TAIL_ATTR, "true");
  }
  pAfter.appendChild(document.createElement("br"));
  editor.insertBefore(pAfter, block.nextSibling);
  editor.focus({ preventScroll: true });
  placeCaretAtStart(pAfter);
  syncLiveMarkdownSyntax(editor);
  return { nextSelectedImage: null, mutatedDom: true };
}

export function placeCaretInEditableBlockAtY(editor: HTMLElement, clientY: number): boolean {
  const children = Array.from(editor.children) as HTMLElement[];
  const editableBlocks = children.filter((el) => !isImageBlockElement(el) && el.tagName !== "HR");
  if (editableBlocks.length === 0) {
    const p = document.createElement("p");
    p.setAttribute(NOTE_IMAGE_TAIL_ATTR, "true");
    p.appendChild(document.createElement("br"));
    editor.appendChild(p);
    editor.focus({ preventScroll: true });
    placeCaretAtStart(p);
    syncLiveMarkdownSyntax(editor);
    return true;
  }

  const imageBlocks = children.filter((el) => isImageBlockElement(el));
  const lastImageBlock = imageBlocks[imageBlocks.length - 1] ?? null;
  if (lastImageBlock && clientY > lastImageBlock.getBoundingClientRect().bottom) {
    const blocksAfterLastImage = editableBlocks.filter((el) =>
      Boolean(lastImageBlock.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    if (blocksAfterLastImage.length === 0) {
      const pTail = document.createElement("p");
      pTail.setAttribute(NOTE_IMAGE_TAIL_ATTR, "true");
      pTail.appendChild(document.createElement("br"));
      editor.appendChild(pTail);
      editor.focus({ preventScroll: true });
      placeCaretAtStart(pTail);
      syncLiveMarkdownSyntax(editor);
      return true;
    }
    const lastAfter = blocksAfterLastImage[blocksAfterLastImage.length - 1]!;
    if (clientY >= lastAfter.getBoundingClientRect().top) {
      editor.focus({ preventScroll: true });
      placeCaretAtEnd(resolveFocusTarget(lastAfter, "end"));
      syncLiveMarkdownSyntax(editor);
      return true;
    }
    let closestAfter = blocksAfterLastImage[0]!;
    let minAfterDist = Infinity;
    for (const el of blocksAfterLastImage) {
      const rect = el.getBoundingClientRect();
      const dist =
        clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      if (dist < minAfterDist) {
        minAfterDist = dist;
        closestAfter = el;
      }
    }
    editor.focus({ preventScroll: true });
    placeCaretAtEnd(resolveFocusTarget(closestAfter, "end"));
    syncLiveMarkdownSyntax(editor);
    return true;
  }

  const lastChild = children[children.length - 1];
  if (
    lastChild &&
    lastChild.tagName === "HR" &&
    clientY > lastChild.getBoundingClientRect().bottom + 8
  ) {
    const pTail = document.createElement("p");
    pTail.setAttribute(NOTE_IMAGE_TAIL_ATTR, "true");
    pTail.appendChild(document.createElement("br"));
    editor.appendChild(pTail);
    editor.focus({ preventScroll: true });
    placeCaretAtStart(pTail);
    syncLiveMarkdownSyntax(editor);
    return true;
  }
  if (lastChild && clientY > lastChild.getBoundingClientRect().bottom) {
    const target = editableBlocks[editableBlocks.length - 1]!;
    editor.focus({ preventScroll: true });
    placeCaretAtEnd(resolveFocusTarget(target, "end"));
    syncLiveMarkdownSyntax(editor);
    return true;
  }

  let closest = editableBlocks[0]!;
  let minDist = Infinity;
  for (const el of editableBlocks) {
    const rect = el.getBoundingClientRect();
    const dist =
      clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    if (dist < minDist) {
      minDist = dist;
      closest = el;
    }
  }
  editor.focus({ preventScroll: true });
  placeCaretAtEnd(resolveFocusTarget(closest, "end"));
  syncLiveMarkdownSyntax(editor);
  return true;
}
