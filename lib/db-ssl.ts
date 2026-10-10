const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function sslFor(connectionString: string): true | undefined {
  try {
    return LOCAL_HOSTS.has(new URL(connectionString).hostname) ? undefined : true;
  } catch {
    return true;
  }
}
