import { describe, expect, it } from "vitest";
import { parseCsv, parseImport, validateRow, type MasterRow } from "@/lib/finance/admin/master-list";

const good: MasterRow = {
  ein: "12-3456789",
  legal_name: "Bridge Street Youth Collective",
  org_type: "Nonprofit",
  borough: "Brooklyn",
  council_district: "35",
  address_line: "410 Bridge Street",
  postal_code: "11201",
  contact_name: "Dana Whitfield",
  contact_title: "Executive Director",
  contact_email: "Dana@BridgeStreet.example.org",
  contact_phone: "(718) 555-0182",
};

function problems(patch: Partial<MasterRow>) {
  const result = validateRow({ ...good, ...patch });
  return "problems" in result ? result.problems : {};
}

describe("[US-033][BR-023] master list rows are validated before they reach the list", () => {
  it("accepts a complete row and normalizes the EIN, phone and email", () => {
    const result = validateRow(good);
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row).toMatchObject({
        ein: "12-3456789",
        org_type: "cbo",
        council_district: 35,
        contact_email: "dana@bridgestreet.example.org",
        contact_phone: "718-555-0182",
      });
    }
  });

  it("rejects an EIN whose first two digits the IRS does not issue", () => {
    for (const prefix of [
      "00",
      "07",
      "08",
      "09",
      "17",
      "18",
      "19",
      "28",
      "29",
      "49",
      "69",
      "70",
      "78",
      "79",
      "89",
      "96",
      "97",
    ])
      expect(problems({ ein: `${prefix}-3456789` }).ein, prefix).toBe(
        "That EIN does not start with a prefix the IRS issues. Check the first two digits.",
      );
    expect(problems({ ein: "00-0000000" }).ein).toContain("does not start with a prefix");
    expect(problems({ ein: "13-4027118" }).ein).toBeUndefined();
    expect(problems({ ein: "98-1234567" }).ein).toBeUndefined();
  });

  it("accepts an EIN written with or without the hyphen and rejects anything that is not nine digits", () => {
    expect(validateRow({ ...good, ein: "123456789" })).toMatchObject({ row: { ein: "12-3456789" } });
    expect(problems({ ein: "12-345678" }).ein).toBe("The EIN must be 9 digits, like 12-3456789.");
    expect(problems({ ein: "12-34567890" }).ein).toBe("The EIN must be 9 digits, like 12-3456789.");
    expect(problems({ ein: "AB-3456789" }).ein).toBe("The EIN must be 9 digits, like 12-3456789.");
    expect(problems({ ein: "" }).ein).toBe("Enter the EIN.");
  });

  it("requires the name, type, borough, district, address, ZIP code and primary contact", () => {
    const empty = problems({
      legal_name: "",
      org_type: "",
      borough: "",
      council_district: "",
      address_line: "",
      postal_code: "",
      contact_name: "",
      contact_title: "",
      contact_email: "",
    });
    expect(Object.keys(empty).sort()).toEqual(
      [
        "address_line",
        "borough",
        "contact_email",
        "contact_name",
        "contact_title",
        "legal_name",
        "org_type",
        "postal_code",
      ].sort(),
    );
    expect(problems({ borough: "Brooklyn", council_district: "" }).council_district).toBe(
      "Enter the Council district, from 1 to 51.",
    );
  });

  it("checks the district against the borough, and lets a Citywide organization skip the district", () => {
    expect(problems({ borough: "Queens", council_district: "35" }).council_district).toBe(
      "District 35 is in Brooklyn, not Queens.",
    );
    expect(problems({ council_district: "52" }).council_district).toBe(
      "The Council district must be a number from 1 to 51.",
    );
    expect(problems({ borough: "Citywide", council_district: "" })).toEqual({});
    expect(problems({ borough: "Gotham" }).borough).toBe(
      "The borough must be one of Bronx, Brooklyn, Manhattan, Queens, Staten Island, Citywide.",
    );
  });

  it("checks the type, ZIP code, email and phone", () => {
    expect(problems({ org_type: "Club" }).org_type).toBe("The type must be Nonprofit or City agency.");
    expect(validateRow({ ...good, org_type: "City agency" })).toMatchObject({ row: { org_type: "agency" } });
    expect(problems({ postal_code: "1120" }).postal_code).toBe("The ZIP code must be 5 digits, like 10027.");
    expect(problems({ contact_email: "not-an-email" }).contact_email).toBe(
      "The contact email must be an email address, like name@example.org.",
    );
    expect(problems({ contact_phone: "555-0182" }).contact_phone).toBe(
      "The contact phone must be a 10-digit phone number.",
    );
    expect(problems({ contact_phone: "" })).toEqual({});
  });
});

describe("[US-033][BR-023] the master list file is read like a spreadsheet export", () => {
  it("reads quoted commas, doubled quotes, blank lines and Windows line endings", () => {
    const rows = parseCsv('a,b,c\r\n"1, one","say ""hi""",3\r\n\r\n4,5,6\r\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1, one", 'say "hi"', "3"],
      ["4", "5", "6"],
    ]);
  });

  it("matches headers by name in any order and by common spellings", () => {
    const header =
      "Organization Name,EIN,Type,Borough,District,Address,ZIP,Primary Contact,Contact Title,Contact Email";
    const parsed = parseImport(
      `${header}\nBridge Street,12-3456789,Nonprofit,Brooklyn,35,410 Bridge St,11201,Dana W,ED,d@example.org`,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.rows[0].line).toBe(2);
      expect(parsed.rows[0].raw).toMatchObject({
        ein: "12-3456789",
        legal_name: "Bridge Street",
        council_district: "35",
        contact_phone: "",
      });
    }
  });

  it("names the missing columns and refuses an empty file or one with no organizations", () => {
    const missing = parseImport("ein,legal_name\n12-3456789,Bridge Street");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("Type, Borough, Council district, Address, ZIP code");
    expect(parseImport("   ")).toEqual({
      ok: false,
      error: "The file is empty. Add a header row and at least one organization.",
    });
    const headerOnly = parseImport(
      "ein,legal_name,org_type,borough,council_district,address_line,postal_code,contact_name,contact_title,contact_email",
    );
    expect(headerOnly).toEqual({ ok: false, error: "The file has a header row but no organizations." });
  });
});
