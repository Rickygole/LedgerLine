import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { contactAnswers } from "@/lib/report/create";

const none = { name: null, title: null, email: null, phone: null };

describe("[US-034][BR-024] organization details fill in where possible", () => {
  it("uses the organization's primary contact first", () => {
    expect(
      contactAnswers({
        name: "Dana Reyes",
        title: "Program Director",
        email: "dana@example.org",
        phone: "(212) 555-0142",
        user_name: "Maria Santos",
        user_title: "Executive Director",
        user_email: "maria@example.org",
      }),
    ).toEqual({
      contact_name: "Dana Reyes",
      contact_title: "Program Director",
      contact_email: "dana@example.org",
      contact_phone: "(212) 555-0142",
    });
  });

  it("falls back to the signed-in user for anything the contact record lacks", () => {
    expect(
      contactAnswers({
        ...none,
        name: "  ",
        title: "Program Director",
        user_name: "Maria Santos",
        user_title: "Executive Director",
        user_email: "maria@example.org",
      }),
    ).toEqual({
      contact_name: "Maria Santos",
      contact_title: "Program Director",
      contact_email: "maria@example.org",
      contact_phone: "",
    });
  });

  it("uses the signed-in user when the organization has no contact on file", () => {
    expect(contactAnswers(null)).toEqual({
      contact_name: "",
      contact_title: "",
      contact_email: "",
      contact_phone: "",
    });
    expect(
      contactAnswers({ ...none, user_name: "Maria Santos", user_title: null, user_email: "maria@example.org" }),
    ).toMatchObject({ contact_name: "Maria Santos", contact_title: "", contact_email: "maria@example.org" });
  });
});
