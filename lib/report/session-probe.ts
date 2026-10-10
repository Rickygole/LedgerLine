export async function sessionIsAlive(): Promise<boolean> {
  try {
    const response = await fetch("/api/session", { cache: "no-store" });
    return response.status !== 401;
  } catch {
    return true;
  }
}
