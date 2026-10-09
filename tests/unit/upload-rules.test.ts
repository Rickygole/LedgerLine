import { describe, expect, it } from "vitest";
import { contentDisposition } from "@/lib/report/upload-rules";

describe("download headers", () => {
  it("sends an ASCII fallback and the UTF-8 name", () => {
    expect(contentDisposition("Informe año.pdf")).toBe(`attachment; filename="Informe a_o.pdf"; filename*=UTF-8''Informe%20a%C3%B1o.pdf`);
    expect(contentDisposition(`報告 "final" (1).pdf`)).toBe(`attachment; filename="__ _final_ (1).pdf"; filename*=UTF-8''%E5%A0%B1%E5%91%8A%20%22final%22%20%281%29.pdf`);
  });
});
