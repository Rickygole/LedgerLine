import { describe, expect, it, vi } from "vitest";
import { buildDefinition } from "@/lib/forms/standard";

vi.mock("server-only", () => ({}));

describe("[US-034][BR-024] organization details fill in where possible", () => {
  it("fills the legal name and EIN from the master list when the report has none", async () => {
    const { withOrgDefaults } = await import("@/lib/report/data");
    const filled = withOrgDefaults({}, "Mott Haven Youth Futures, Inc.", "00-1040217");
    expect(filled.org_legal_name).toBe("Mott Haven Youth Futures, Inc.");
    expect(filled.org_ein).toBe("00-1040217");
  });

  it("treats a blank answer as missing and keeps anything the organization already typed", async () => {
    const { withOrgDefaults } = await import("@/lib/report/data");
    expect(withOrgDefaults({ org_legal_name: "   " }, "Legal Name Inc.", "00-1").org_legal_name).toBe(
      "Legal Name Inc.",
    );
    expect(withOrgDefaults({ org_legal_name: "Typed Name" }, "Legal Name Inc.", "00-1").org_legal_name).toBe(
      "Typed Name",
    );
  });
});

describe("[BR-013] work can be paused and resumed", () => {
  it("reopens the section that was edited last", async () => {
    const { resumeSectionFor } = await import("@/lib/report/data");
    const definition = buildDefinition("Resume", []);
    const resume = resumeSectionFor(definition, {
      contact_name: "2026-07-19T10:00:00Z",
      accomplishments: "2026-07-19T10:37:00Z",
      participants_actual: "2026-07-19T10:20:00Z",
    });
    expect(resume).toBe("narrative");
  });

  it("has nothing to resume before the first save", async () => {
    const { resumeSectionFor } = await import("@/lib/report/data");
    expect(resumeSectionFor(buildDefinition("Resume", []), {})).toBeNull();
  });
});
