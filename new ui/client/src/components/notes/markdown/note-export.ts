import { HEADING_TAG_SET, stripLiveSyntaxArtifacts } from "./note-dom";

export function noteHtmlToMarkdown(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  stripLiveSyntaxArtifacts(doc.body);

  const renderInline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.nodeValue || "").replace(/\u200B/g, "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(renderInline).join("");
    if (tag === "br") return "\n";
    if (tag === "strong" || tag === "b") return inner ? `**${inner}**` : "";
    if (tag === "em" || tag === "i") return inner ? `*${inner}*` : "";
    if (tag === "s" || tag === "del" || tag === "strike") return inner ? `~~${inner}~~` : "";
    if (tag === "mark") return inner ? `==${inner}==` : "";
    if (tag === "code") return inner ? `\`${inner}\`` : "";
    if (tag === "a") {
      const href = el.getAttribute("href") || "";
      return href ? `[${inner || href}](${href})` : inner;
    }
    if (tag === "input" || tag === "img") return "";
    return inner;
  };

  const renderBlock = (node: Node, indent = ""): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.nodeValue || "").replace(/\u200B/g, "").trim();
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "hr") return "---";
    if (tag === "pre") {
      const codeEl = el.querySelector("code");
      const lang = codeEl?.getAttribute("data-lang") || "";
      const code = (codeEl?.textContent || el.textContent || "").replace(/\u200B/g, "").trimEnd();
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    if (HEADING_TAG_SET.has(tag)) {
      const level = Number.parseInt(tag.slice(1), 10) || 1;
      const text = renderInline(el).trim();
      return text ? `${"#".repeat(level)} ${text}` : "";
    }
    if (tag === "blockquote") {
      const text = renderInline(el).trim();
      return text
        ? text
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")
        : "";
    }
    if (tag === "ul" || tag === "ol") {
      const start = Number.parseInt(el.getAttribute("start") || "1", 10) || 1;
      return Array.from(el.children)
        .filter((c) => c.tagName.toLowerCase() === "li")
        .map((li, idx) => {
          const isTask = li.hasAttribute("data-task");
          const input = li.querySelector(
            ':scope > input[type="checkbox"]',
          ) as HTMLInputElement | null;
          const isChecked =
            li.getAttribute("data-checked") === "true" || Boolean(input?.hasAttribute("checked"));
          const nested = Array.from(li.children).filter((c) => ["UL", "OL"].includes(c.tagName));
          const ownText = Array.from(li.childNodes)
            .filter(
              (c) =>
                c.nodeType !== Node.ELEMENT_NODE || !["UL", "OL"].includes((c as Element).tagName),
            )
            .map(renderInline)
            .join("")
            .trim();
          const prefix = isTask
            ? `- [${isChecked ? "x" : " "}] `
            : tag === "ol"
              ? `${start + idx}. `
              : "- ";
          const nestedMd = nested.map((n) => renderBlock(n, `${indent}  `)).filter(Boolean);
          return [`${indent}${prefix}${ownText}`, ...nestedMd].join("\n");
        })
        .filter(Boolean)
        .join("\n");
    }

    const text = renderInline(el).trim();
    return text;
  };

  return Array.from(doc.body.childNodes)
    .map((n) => renderBlock(n))
    .filter(Boolean)
    .join("\n");
}
