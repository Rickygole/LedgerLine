import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDateTime } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { balanceMessage, budgetTotals, isVisible } from "@/lib/rules/validate";
import { lineVariance, spendSummary, VARIANCE_NOTE_KEY } from "@/lib/rules/spend";
import type { FormDefinition, Answers } from "@/lib/rules/types";
import type { Snapshot } from "@/lib/snapshot";
import { displayScalar, questionLabel, tableRows } from "./format";
import { formatBytes } from "./upload-rules";

export type ReportPdfInput = {
  initiativeName: string;
  periodLabel: string;
  referenceNo: string;
  revision: number;
  revisionKind: "submit" | "correction";
  revisionReason: string | null;
  revisionActor: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  orgName: string;
  ein: string;
  awardAmount: number;
  definition: FormDefinition;
  snapshot: Snapshot;
};

const PAGE = { width: 612, height: 792 };
const MARGIN = 54;
const BODY = 10;
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.38, 0.42, 0.48);
const RULE = rgb(0.8, 0.83, 0.87);
const HEAD_FILL = rgb(0.94, 0.95, 0.97);

export function pdfFilename(referenceNo: string, revision: number): string {
  const safe = referenceNo.replace(/[^A-Za-z0-9-]/g, "");
  return `${safe || "report"}-revision-${revision}.pdf`;
}

class Writer {
  doc: PDFDocument;
  regular!: PDFFont;
  bold!: PDFFont;
  page!: PDFPage;
  y = 0;
  private charset!: Set<number>;

  constructor(doc: PDFDocument) {
    this.doc = doc;
  }

  async init() {
    this.regular = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.charset = new Set(this.regular.getCharacterSet());
    this.addPage();
  }

  clean(text: string): string {
    let out = "";
    for (const char of text.replace(/\r\n?/g, "\n").replace(/\t/g, " ")) {
      const code = char.codePointAt(0) as number;
      out += code === 10 || this.charset.has(code) ? char : "?";
    }
    return out;
  }

  addPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 18) this.addPage();
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of this.clean(text).split("\n")) {
      const words = paragraph.split(" ");
      let line = "";
      for (let word of words) {
        while (font.widthOfTextAtSize(word, size) > width) {
          let cut = word.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut -= 1;
          if (line) {
            lines.push(line);
            line = "";
          }
          lines.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        const next = line ? `${line} ${word}` : word;
        if (line && font.widthOfTextAtSize(next, size) > width) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  paragraph(text: string, opts: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const size = opts.size ?? BODY;
    const font = opts.bold ? this.bold : this.regular;
    const lead = size * 1.35;
    for (const line of this.wrap(text, font, size, PAGE.width - MARGIN * 2)) {
      this.ensure(lead);
      this.y -= lead;
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font, color: opts.color ?? INK });
    }
    this.y -= opts.gap ?? 4;
  }

  heading(text: string) {
    this.ensure(40);
    this.y -= 10;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 4 },
      end: { x: PAGE.width - MARGIN, y: this.y + 4 },
      thickness: 0.6,
      color: RULE,
    });
    this.y -= 6;
    this.paragraph(text, { bold: true, size: 13, gap: 6 });
  }

  pair(label: string, value: string) {
    const labelWidth = 150;
    const width = PAGE.width - MARGIN * 2 - labelWidth;
    const lines = this.wrap(value || "Not provided", this.regular, BODY, width);
    const lead = BODY * 1.35;
    this.ensure(lead * lines.length);
    this.y -= lead;
    this.page.drawText(this.clean(label), { x: MARGIN, y: this.y, size: BODY, font: this.bold, color: MUTED });
    lines.forEach((line, index) => {
      if (index > 0) {
        this.ensure(lead);
        this.y -= lead;
      }
      this.page.drawText(line, { x: MARGIN + labelWidth, y: this.y, size: BODY, font: this.regular, color: INK });
    });
    this.y -= 2;
  }

  table(headers: string[], rows: string[][], widths: number[], right: boolean[], footer: string[][] = []) {
    const total = PAGE.width - MARGIN * 2;
    const sum = widths.reduce((a, b) => a + b, 0);
    const cols = widths.map((w) => (w / sum) * total);
    const size = 9;
    const lead = size * 1.3;
    const pad = 4;
    const draw = (cells: string[], font: PDFFont, fill: boolean) => {
      const wrapped = cells.map((cell, i) => this.wrap(cell, font, size, cols[i] - pad * 2));
      const height = Math.max(...wrapped.map((w) => w.length)) * lead + pad * 2;
      this.ensure(height);
      if (fill)
        this.page.drawRectangle({ x: MARGIN, y: this.y - height, width: total, height, color: HEAD_FILL });
      let x = MARGIN;
      wrapped.forEach((lines, i) => {
        lines.forEach((line, n) => {
          const w = font.widthOfTextAtSize(line, size);
          this.page.drawText(line, {
            x: right[i] ? x + cols[i] - pad - w : x + pad,
            y: this.y - pad - lead * (n + 1) + 3,
            size,
            font,
            color: INK,
          });
        });
        x += cols[i];
      });
      this.y -= height;
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: MARGIN + total, y: this.y },
        thickness: 0.5,
        color: RULE,
      });
    };
    this.y -= 2;
    draw(headers, this.bold, true);
    for (const row of rows) draw(row, this.regular, false);
    for (const row of footer) draw(row, this.bold, false);
    this.y -= 6;
  }
}

function budgetSection(w: Writer, input: ReportPdfInput) {
  const lines = input.snapshot.budget.map((line) => ({ ...line, rowId: String(line.position) }));
  const totals = budgetTotals(lines);
  const spend = spendSummary(lines, input.awardAmount);
  const dash = "-";
  if (lines.length === 0) {
    w.paragraph("No budget lines.");
    return;
  }
  const headers = ["Line", "Category", "Description", "Approved budget"];
  const widths = [28, 52, 240, 80];
  const right = [true, false, false, true];
  if (spend.entered) {
    headers.push("Actual spent", "Variance");
    widths.push(80, 70);
    right.push(true, true);
  }
  const rows = lines.map((line) => {
    const base = [String(line.position), line.category, line.description || "No description", formatCurrency(line.amount)];
    if (!spend.entered) return base;
    const variance = lineVariance(line);
    return [
      ...base,
      line.actual === null || line.actual === undefined ? dash : formatCurrency(line.actual),
      variance === null ? dash : formatCurrency(variance),
    ];
  });
  const pad = (label: string, amount: string, extra: string[] = []) => {
    const cells = ["", "", label, amount];
    if (spend.entered) cells.push(...(extra.length ? extra : ["", ""]));
    return cells;
  };
  w.table(headers, rows, widths, right, [
    pad("Personal services (PS) subtotal", formatCurrency(totals.ps)),
    pad("Other than personal services (OTPS) subtotal", formatCurrency(totals.otps)),
    pad("Total", formatCurrency(totals.total), [formatCurrency(spend.actual), formatCurrency(spend.variance)]),
    pad("Award", formatCurrency(input.awardAmount)),
  ]);
  w.paragraph(balanceMessage(totals.total, input.awardAmount).message, { bold: true });
  if (spend.entered) {
    w.paragraph(
      `Unspent balance: ${formatCurrency(spend.unspent)} (${spend.unspentPercent.toFixed(1)}% of the award)`,
    );
    const note = input.snapshot.answers[VARIANCE_NOTE_KEY];
    if (typeof note === "string" && note.trim() !== "") w.paragraph(`Variance explanation: ${note.trim()}`);
  }
}

function answersSection(w: Writer, input: ReportPdfInput, questions: FormDefinition["sections"][number]["questions"]) {
  const answers: Answers = input.snapshot.answers;
  for (const question of questions) {
    if (!isVisible(question, answers)) continue;
    const value = answers[question.key];
    w.paragraph(questionLabel(question.label), { bold: true, size: 9, color: MUTED, gap: 1 });
    if (question.type === "table") {
      const columns = question.columns ?? [];
      const rows = tableRows(question, value);
      if (rows.length === 0) {
        w.paragraph("No rows entered.");
        continue;
      }
      w.table(
        columns.map((c) => c.label),
        rows,
        columns.map((c) => (c.type === "text" ? 2 : 1)),
        columns.map((c) => c.type !== "text"),
      );
      continue;
    }
    const shown = displayScalar(question, value);
    w.paragraph(shown === "" ? "Not answered" : shown, { gap: 8 });
  }
}

export async function buildReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${input.initiativeName}, ${input.periodLabel}`);
  doc.setSubject(`Submitted report ${input.referenceNo}`);
  doc.setProducer("LedgerLine");
  doc.setCreator("LedgerLine");
  const w = new Writer(doc);
  await w.init();

  w.paragraph(input.initiativeName, { bold: true, size: 18, gap: 2 });
  w.paragraph(`${input.periodLabel} report`, { size: 12, color: MUTED, gap: 10 });
  w.pair("Reference number", input.referenceNo);
  w.pair("Revision", String(input.revision));
  w.pair("Organization", input.orgName);
  w.pair("EIN", input.ein);
  w.pair("Award", formatCurrency(input.awardAmount));
  w.pair("Submitted by", input.submittedByName ?? "Not recorded");
  w.pair("Submitted at", input.submittedAt ? `${formatDateTime(input.submittedAt)} ET` : "Not recorded");
  if (input.revisionKind === "correction") {
    w.pair("Corrected by", input.revisionActor ?? "Council Finance");
    if (input.revisionReason) w.pair("Reason for correction", input.revisionReason);
  }

  for (const section of input.definition.sections) {
    w.heading(section.title);
    if (section.kind === "budget") budgetSection(w, input);
    else answersSection(w, input, section.questions);
  }

  const certification = input.snapshot.certification;
  if (certification) {
    w.heading("Certification");
    w.paragraph(certification.statement, { bold: true });
    w.pair("Certified by", certification.name);
    w.pair("Title", certification.title);
    w.pair("Certified on", `${formatDateTime(certification.certifiedAt)} ET`);
  }

  w.heading("Attachments");
  if (input.snapshot.attachments.length === 0) w.paragraph("No files were attached.");
  for (const file of input.snapshot.attachments) w.paragraph(`${file.filename} (${formatBytes(file.bytes)})`, { gap: 2 });

  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const label = w.clean(`${input.referenceNo}  |  Revision ${input.revision}  |  Page ${index + 1} of ${pages.length}`);
    page.drawText(label, { x: MARGIN, y: MARGIN - 20, size: 8, font: w.regular, color: MUTED });
  });
  return doc.save();
}
