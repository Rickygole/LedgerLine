export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback: string): string {
  const next = typeof value === "string" ? value : "";
  if (!/^\/(?![\\/])[^\\\s]*$/.test(next)) return fallback;
  try {
    const url = new URL(next, "https://ledgerline.invalid");
    if (url.origin !== "https://ledgerline.invalid") return fallback;
    const result = `${url.pathname}${url.search}${url.hash}`;
    return /^\/[^/\\]/.test(result) || result === "/" ? result : fallback;
  } catch {
    return fallback;
  }
}
