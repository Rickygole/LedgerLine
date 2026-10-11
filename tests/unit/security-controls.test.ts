import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTROLS_STATEMENT, SECURITY_CONTROLS } from "@/lib/lifecycle/security-controls";

const ROOT = join(__dirname, "..", "..");

describe("[US-054][BR-026] the security control mapping points at real files and tests", () => {
  it("names a file that exists for every place and every test it cites", () => {
    for (const control of SECURITY_CONTROLS) {
      expect(control.where.length, control.id).toBeGreaterThan(0);
      for (const path of [...control.where, ...control.tests]) expect(existsSync(join(ROOT, path)), path).toBe(true);
    }
  });

  it("cites a test for every control the application provides itself", () => {
    for (const control of SECURITY_CONTROLS.filter((c) => c.provider === "Application"))
      expect(control.tests.length, control.id).toBeGreaterThan(0);
  });

  it("explains what is shared or inherited instead of claiming it", () => {
    for (const control of SECURITY_CONTROLS.filter((c) => c.provider !== "Application"))
      expect(control.note ?? control.how, control.id).toBeTruthy();
    expect(SECURITY_CONTROLS.filter((c) => c.provider === "Inherited from hosting provider").map((c) => c.id)).toEqual([
      "SC-28",
      "CP-9",
    ]);
  });

  it("states that these are application controls and that authorization happens before go-live", () => {
    expect(CONTROLS_STATEMENT).toBe(
      "These are application controls. FedRAMP authorization and a NIST assessment are performed on the production environment before go-live.",
    );
  });

  it("covers the controls in the hosting document that the application implements", () => {
    const doc = readFileSync(join(ROOT, "docs", "azure.md"), "utf8");
    const listed = new Set(SECURITY_CONTROLS.flatMap((c) => c.id.split(/,\s*/)));
    for (const id of ["AC-2", "AC-3", "AC-6", "AC-7", "AC-12", "AU-2", "AU-3", "AU-9", "IA-5", "SC-8", "SI-10"]) {
      expect(doc, id).toContain(id);
      expect(listed.has(id), id).toBe(true);
    }
  });
});
