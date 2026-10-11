import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";

function streamText(doc: PDFDocument, ref: unknown): string {
  const stream = doc.context.lookup(ref as PDFRef) as PDFRawStream;
  return Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
}

function parseMap(source: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const match of source.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g)) {
    const hex = match[2];
    let text = "";
    for (let i = 0; i < hex.length; i += 4) text += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    map.set(parseInt(match[1], 16), text);
  }
  return map;
}

export async function pdfText(bytes: Uint8Array): Promise<string> {
  return (await pdfPages(bytes)).flat().join("\n");
}

export async function pdfPages(bytes: Uint8Array): Promise<string[][]> {
  const doc = await PDFDocument.load(bytes);
  const pages: string[][] = [];
  for (const page of doc.getPages()) {
    const lines: string[] = [];
    pages.push(lines);
    const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    const maps = new Map<string, Map<number, string>>();
    for (const [name, ref] of fonts.entries()) {
      const font = doc.context.lookup(ref, PDFDict);
      const unicode = font.get(PDFName.of("ToUnicode"));
      if (unicode) maps.set(name.toString().slice(1), parseMap(streamText(doc, unicode)));
    }
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    const content = refs.map((ref) => streamText(doc, ref)).join("\n");
    let current = new Map<number, string>();
    for (const match of content.matchAll(/\/(\S+) [\d.]+ Tf|<([0-9A-Fa-f]+)>\s*Tj/g)) {
      if (match[1]) {
        current = maps.get(match[1]) ?? new Map();
        continue;
      }
      const hex = match[2];
      let text = "";
      for (let i = 0; i < hex.length; i += 4) text += current.get(parseInt(hex.slice(i, i + 4), 16)) ?? "";
      lines.push(text);
    }
  }
  return pages;
}
