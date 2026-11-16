import {
  HEADING_TAG_SET,
  MD_BULLET_ATTR,
  MD_DELIM_ATTR,
  MD_SYNTAX_ATTR,
  MD_URL_ATTR,
  normalizeEmptyBreak,
} from "./note-dom";

export type SyntaxKind =
  "heading" | "blockquote" | "list" | "code-open" | "code-close" | "open" | "close";

export interface InlineLiveRule {
  tag: "code" | "strong" | "em" | "s" | "mark";
  delimiter: string;
}

export const INLINE_LIVE_RULES: Record<string, InlineLiveRule> = {
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

export const SELECTION_WRAP_DELIMITERS: Record<string, [string, string]> = {
  "(": ["(", ")"],
  "[": ["[", "]"],
  '"': ['"', '"'],
};

export const COLLAPSED_PLAIN_PAIRS: Record<string, [string, string]> = {
  "(": ["(", ")"],
  "[": ["[", "]"],
  '"': ['"', '"'],
};

export const CLOSING_PLAIN_PAIR_CHARS = new Set([")", "]", '"']);

export type BlockRevealMode = "line" | "prefix";

export type BlockSyntaxSpec =
  | {
      kind: "heading" | "blockquote" | "list";
      revealMode: BlockRevealMode;
      prefixText: string;
      isTask?: boolean;
    }
  | {
      kind: "code";
      revealMode: "line";
      openPrefix: string;
      closePrefix: string;
    };

export type ParsedMarkdownBlockPrefix =
  | { type: "heading"; level: number; rest: string }
  | { type: "blockquote"; rest: string }
  | { type: "task"; bullet: "-" | "*" | "+"; checked: boolean; rest: string }
  | { type: "bullet"; bullet: "-" | "*" | "+"; rest: string }
  | { type: "ordered"; start: number; delim: "." | ")"; rest: string };

export const CODE_OPEN_PREFIX_REGEX = /^```([a-zA-Z0-9_+#.-]*)$/;
export const CODE_CLOSE_PREFIX_REGEX = /^```$/;

export function createSyntaxSpan(kind: SyntaxKind, text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.setAttribute(MD_SYNTAX_ATTR, kind);
  span.setAttribute("spellcheck", "false");
  span.textContent = text;
  return span;
}

export function createLinkCloseSyntaxSpan(href: string): HTMLSpanElement {
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

export function getDirectSyntaxChild(el: HTMLElement, kind: SyntaxKind): HTMLSpanElement | null {
  for (const child of Array.from(el.children)) {
    if (child.tagName === "SPAN" && child.getAttribute(MD_SYNTAX_ATTR) === kind) {
      return child as HTMLSpanElement;
    }
  }
  return null;
}

export function getLiBulletMarker(li: HTMLElement): "-" | "*" | "+" {
  const raw = li.getAttribute(MD_BULLET_ATTR);
  return raw === "*" || raw === "+" ? raw : "-";
}

export function getLiDelimMarker(li: HTMLElement): "." | ")" {
  return li.getAttribute(MD_DELIM_ATTR) === ")" ? ")" : ".";
}

export function applyLiMarkerAttrs(
  li: HTMLElement,
  attrs?: { bullet?: "-" | "*" | "+"; delim?: "." | ")" },
): void {
  if (attrs?.bullet && attrs.bullet !== "-") {
    li.setAttribute(MD_BULLET_ATTR, attrs.bullet);
  } else {
    li.removeAttribute(MD_BULLET_ATTR);
  }
  if (attrs?.delim === ")") {
    li.setAttribute(MD_DELIM_ATTR, ")");
  } else {
    li.removeAttribute(MD_DELIM_ATTR);
  }
}

export function getOrderedListIndex(li: HTMLElement): number {
  const ol = li.parentElement;
  if (!ol || ol.tagName.toLowerCase() !== "ol") return 1;
  const startAttr = Number.parseInt(ol.getAttribute("start") || "1", 10);
  const safeStart = Number.isFinite(startAttr) ? startAttr : 1;
  const siblings = Array.from(ol.children).filter((child) => child.tagName.toLowerCase() === "li");
  const idx = Math.max(0, siblings.indexOf(li));
  return safeStart + idx;
}

export function getBlockSyntaxSpec(block: HTMLElement): BlockSyntaxSpec | null {
  const tag = block.tagName.toLowerCase();
  if (HEADING_TAG_SET.has(tag)) {
    const level = Number.parseInt(tag.slice(1), 10);
    return { kind: "heading", revealMode: "line", prefixText: `${"#".repeat(level)} ` };
  }
  if (tag === "blockquote") {
    return { kind: "blockquote", revealMode: "prefix", prefixText: "> " };
  }
  if (tag === "li") {
    const parentTag = block.parentElement?.tagName.toLowerCase();
    if (block.hasAttribute("data-task")) {
      const bullet = getLiBulletMarker(block);
      const checked = block.getAttribute("data-checked") === "true";
      return {
        kind: "list",
        revealMode: "prefix",
        prefixText: `${bullet} [${checked ? "x" : " "}] `,
        isTask: true,
      };
    }
    if (parentTag === "ol") {
      const num = getOrderedListIndex(block);
      const delim = getLiDelimMarker(block);
      return { kind: "list", revealMode: "prefix", prefixText: `${num}${delim} ` };
    }
    if (parentTag === "ul") {
      return { kind: "list", revealMode: "prefix", prefixText: `${getLiBulletMarker(block)} ` };
    }
  }
  if (tag === "pre") {
    const codeEl = block.querySelector(":scope > code");
    const lang = codeEl?.getAttribute("data-lang") || "";
    return {
      kind: "code",
      revealMode: "line",
      openPrefix: `\`\`\`${lang}`,
      closePrefix: "```",
    };
  }
  return null;
}

export function parseMarkdownBlockPrefix(text: string): ParsedMarkdownBlockPrefix | null {
  const heading = /^(#{1,6}) ([\s\S]*)$/.exec(text);
  if (heading) {
    return { type: "heading", level: heading[1]!.length, rest: heading[2]! };
  }
  const quote = /^> ([\s\S]*)$/.exec(text);
  if (quote) {
    return { type: "blockquote", rest: quote[1]! };
  }
  const task = /^([-*+]) \[([ xX])\] ([\s\S]*)$/.exec(text);
  if (task) {
    return {
      type: "task",
      bullet: task[1]! as "-" | "*" | "+",
      checked: task[2]!.toLowerCase() === "x",
      rest: task[3]!,
    };
  }
  const bullet = /^([-*+]) ([\s\S]*)$/.exec(text);
  if (bullet) {
    return { type: "bullet", bullet: bullet[1]! as "-" | "*" | "+", rest: bullet[2]! };
  }
  const ordered = /^(\d{1,4})([.)]) ([\s\S]*)$/.exec(text);
  if (ordered) {
    return {
      type: "ordered",
      start: Number.parseInt(ordered[1]!, 10),
      delim: ordered[2]! as "." | ")",
      rest: ordered[3]!,
    };
  }
  return null;
}

export function createTaskListItem(
  checked: boolean,
  contentNodes?: DocumentFragment,
  bullet: "-" | "*" | "+" = "-",
): HTMLLIElement {
  const li = document.createElement("li");
  li.setAttribute("data-task", "true");
  li.setAttribute("data-checked", String(checked));
  applyLiMarkerAttrs(li, { bullet });

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
  normalizeEmptyBreak(contentSpan);

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

export function createListItemWithContent(
  trailingFrag: DocumentFragment,
  attrs?: { bullet?: "-" | "*" | "+"; delim?: "." | ")" },
): HTMLLIElement {
  const li = document.createElement("li");
  applyLiMarkerAttrs(li, attrs);
  li.appendChild(trailingFrag);
  normalizeEmptyBreak(li);
  return li;
}

export function mergeListWithAdjacentSiblings(list: HTMLUListElement | HTMLOListElement): void {
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

export function splitListAroundItem(
  list: HTMLElement,
  li: HTMLElement,
  replacement: Node | Node[],
): void {
  const parent = list.parentNode;
  if (!parent) return;
  const items = Array.from(list.children);
  const idx = items.indexOf(li);
  if (idx < 0) return;

  const replacementNodes = Array.isArray(replacement) ? replacement : [replacement];
  const afterItems = items.slice(idx + 1);
  li.remove();

  const frag = document.createDocumentFragment();
  for (const node of replacementNodes) {
    frag.appendChild(node);
  }

  if (afterItems.length > 0) {
    const newList = list.cloneNode(false) as HTMLElement;
    if (newList.tagName === "OL") {
      const startAttr = Number.parseInt(list.getAttribute("start") || "1", 10);
      newList.setAttribute("start", String((Number.isFinite(startAttr) ? startAttr : 1) + idx + 1));
    }
    afterItems.forEach((item) => newList.appendChild(item));
    frag.appendChild(newList);
  }

  if (list.children.length === 0) {
    parent.replaceChild(frag, list);
  } else {
    parent.insertBefore(frag, list.nextSibling);
  }
}
