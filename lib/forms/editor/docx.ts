import mammoth from "mammoth";
import {
  attachStructure,
  collapse,
  splitParagraphs,
  type TemplateCell,
  type TemplateStructure,
} from "@/lib/forms/editor/draft-core";

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function linesOf(fragment: string): string[] {
  return decode(
    fragment
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split(/\r?\n/)
    .map((line) => collapse(line))
    .filter((line) => line.length > 0);
}

function structureFromHtml(html: string): { lines: string[]; structure: TemplateStructure } {
  const lines: string[] = [];
  const structure: TemplateStructure = { headings: [], tables: [], listItems: [] };
  const block = /<(h[1-6]|p|li|table)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = block.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = match[2];
    if (tag === "table") {
      const first = lines.length + 1;
      const rows: TemplateCell[][] = [];
      for (const row of inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells: TemplateCell[] = [];
        for (const cell of row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
          const cellLines = linesOf(cell[1]);
          const paragraph = cellLines.length > 0 ? lines.length + 1 : null;
          lines.push(...cellLines);
          cells.push({ text: cellLines.join(" "), paragraph });
        }
        rows.push(cells);
      }
      if (lines.length >= first) structure.tables.push({ first, last: lines.length, rows });
      continue;
    }
    const found = linesOf(inner);
    if (found.length === 0) continue;
    const at = lines.length + 1;
    lines.push(...found);
    if (tag.startsWith("h")) structure.headings.push({ paragraph: at, text: found.join(" ") });
    else if (tag === "li") for (let n = 0; n < found.length; n += 1) structure.listItems.push(at + n);
  }
  return { lines, structure };
}

export async function readTemplate(buffer: Buffer): Promise<string[]> {
  const raw = await mammoth.extractRawText({ buffer });
  const paragraphs = splitParagraphs(raw.value);
  try {
    const html = await mammoth.convertToHtml({ buffer });
    const { lines, structure } = structureFromHtml(html.value);
    const aligned = lines.length === paragraphs.length && lines.every((line, index) => line === paragraphs[index]);
    if (aligned) attachStructure(paragraphs, structure);
  } catch {
    return paragraphs;
  }
  return paragraphs;
}
