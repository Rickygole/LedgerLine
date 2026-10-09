export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = ["pdf", "docx", "xlsx", "csv"] as const;

export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

export function clientCheckUpload(filename: string, bytes: number): string | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) return "Use PDF, Word, Excel or CSV.";
  if (bytes > MAX_UPLOAD_BYTES) return `${(bytes / 1024 / 1024).toFixed(0)} MB. The limit is 25 MB.`;
  if (bytes <= 0) return "The file is empty.";
  return null;
}

export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
