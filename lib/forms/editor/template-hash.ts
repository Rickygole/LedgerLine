import { createHash } from "node:crypto";
import { normalizedTemplate } from "@/lib/forms/editor/draft-core";

export function templateSha(paragraphs: string[]): string {
  return createHash("sha256").update(normalizedTemplate(paragraphs)).digest("hex");
}
