import { describe, expect, it } from "vitest";
import { describeScope, parseScope, scopeLabel } from "@/lib/finance/scope";

const known = ["DFTA", "DYCD", "HRA"];
const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
const other = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("[US-060][BR-017] access scope parsing", () => {
  it("accepts no choices as an empty scope, which means every agency", () => {
    expect(parseScope([], [], known)).toEqual({ ok: true, scope: { agencies: [], initiatives: [] } });
    expect(parseScope(["", "  "], [""], known)).toEqual({ ok: true, scope: { agencies: [], initiatives: [] } });
  });

  it("normalises agency case, trims and removes duplicates", () => {
    expect(parseScope([" dycd ", "DYCD", "dfta"], [], known)).toEqual({
      ok: true,
      scope: { agencies: ["DYCD", "DFTA"], initiatives: [] },
    });
  });

  it("refuses an agency that no initiative belongs to", () => {
    expect(parseScope(["NOPE"], [], known)).toEqual({ ok: false, error: "NOPE is not an administering agency." });
  });

  it("keeps valid initiative ids once each and refuses anything that is not an id", () => {
    expect(parseScope([], [id.toUpperCase(), id, other], known)).toEqual({
      ok: true,
      scope: { agencies: [], initiatives: [id, other] },
    });
    const bad = parseScope([], ["1; DROP TABLE initiative"], known);
    expect(bad.ok).toBe(false);
  });

  it("limits how many agencies and initiatives one scope can hold", () => {
    const many = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(parseScope([], many, known).ok).toBe(false);
    expect(parseScope([], many.slice(0, 100), known).ok).toBe(true);
  });
});

describe("[US-060][BR-017] access scope wording", () => {
  it("names agencies and counts initiatives", () => {
    expect(describeScope({ agencies: ["DYCD", "DFTA"], initiatives: [] })).toBe("DYCD, DFTA");
    expect(describeScope({ agencies: [], initiatives: [id, other, id] })).toBe("3 initiatives");
    expect(describeScope({ agencies: [], initiatives: [id] })).toBe("1 initiative");
    expect(describeScope({ agencies: ["DYCD"], initiatives: [id] })).toBe("DYCD and 1 initiative");
  });

  it("calls an empty scope all agencies", () => {
    expect(describeScope({ agencies: [], initiatives: [] })).toBeNull();
    expect(scopeLabel({ agencies: [], initiatives: [] })).toBe("All agencies");
    expect(scopeLabel({ agencies: ["DYCD"], initiatives: [] })).toBe("DYCD");
  });
});
