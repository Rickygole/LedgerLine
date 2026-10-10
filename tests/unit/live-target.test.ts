import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveTarget } from "../../scripts/target";

afterEach(() => vi.unstubAllEnvs());

function folder(first: string, app: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "live-target-"));
  writeFileSync(path.join(dir, ".env.neon"), first);
  writeFileSync(path.join(dir, ".env.neon-app"), app);
  return dir;
}

describe("live reseed target", () => {
  it("reads a keyed or bare connection string from the first line and the persona password from the app file", () => {
    for (const first of [
      "NEON_OWNER_URL=postgresql://owner:secret@ep-test.neon.tech/db?sslmode=require\n",
      "postgresql://owner:secret@ep-test.neon.tech/db?sslmode=require\n",
    ]) {
      vi.stubEnv("NEON_ENV_DIR", folder(first, "OTHER=1\nNEON_PERSONA_PASSWORD=persona-pass\n"));
      const target = liveTarget();
      expect(target.host).toBe("ep-test.neon.tech");
      expect(target.url).toContain("owner:secret@");
      expect(target.personaPassword).toBe("persona-pass");
      expect(target.live).toBe(true);
    }
  });

  it("refuses a missing persona password and a first line that is not a connection string", () => {
    vi.stubEnv("NEON_ENV_DIR", folder("postgresql://o:s@h.example/db\n", "OTHER=1\n"));
    expect(() => liveTarget()).toThrow(/NEON_PERSONA_PASSWORD/);
    vi.stubEnv("NEON_ENV_DIR", folder("not a url\n", "NEON_PERSONA_PASSWORD=x\n"));
    expect(() => liveTarget()).toThrow(/connection string/);
  });
});
