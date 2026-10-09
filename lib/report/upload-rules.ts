export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "csv"] as const;

export const FILE_TYPE_HELP = "Use PDF, Word, Excel or CSV.";

export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

export function oversizeMessage(bytes: number): string {
  const megabytes = Math.ceil((bytes / 1024 / 1024) * 10) / 10;
  const limit = MAX_UPLOAD_BYTES / 1024 / 1024;
  return `This file is ${megabytes.toFixed(1)} MB, which is over the ${limit.toFixed(1)} MB limit for one file.`;
}

export function clientCheckUpload(filename: string, bytes: number): string | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) return FILE_TYPE_HELP;
  if (bytes > MAX_UPLOAD_BYTES) return oversizeMessage(bytes);
  if (bytes <= 0) return "The file is empty.";
  return null;
}

export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
