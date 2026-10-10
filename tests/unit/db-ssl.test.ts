import { describe, expect, it } from "vitest";
import { sslFor } from "@/lib/db-ssl";

describe("database connections require TLS unless the host is local", () => {
  it("allows plain connections only to localhost, 127.0.0.1 and ::1", () => {
    expect(sslFor("postgres://u:p@localhost:5432/db")).toBeUndefined();
    expect(sslFor("postgres://u:p@127.0.0.1/db")).toBeUndefined();
    expect(sslFor("postgres://u:p@[::1]:5432/db")).toBeUndefined();
  });

  it("requires TLS for a remote host even when its name or path contains localhost", () => {
    expect(sslFor("postgres://u:p@db.example.com/localhost")).toBe(true);
    expect(sslFor("postgres://u:p@localhost.example.com/db")).toBe(true);
    expect(sslFor("postgres://localhost:secret@db.example.com/db")).toBe(true);
  });

  it("requires TLS when the address cannot be parsed", () => {
    expect(sslFor("not a url")).toBe(true);
  });
});
