import { describe, expect, it } from "vitest";
import { buildCommit, hostingInfo } from "@/lib/ops/health";
import { formatErrorLog, headerValue, REQUEST_ID_HEADER } from "@/lib/ops/log";

describe("[US-062] hosting and build facts reported for monitoring", () => {
  it("reads the hosting provider and region from the deployment settings", () => {
    expect(hostingInfo({ HOSTING_PROVIDER: "Azure Government", HOSTING_REGION: "usgovvirginia" })).toEqual({ provider: "Azure Government", region: "usgovvirginia", declared: true, onCouncilServers: false });
    expect(hostingInfo({ VERCEL: "1", VERCEL_REGION: "iad1" })).toEqual({ provider: "Vercel", region: "iad1", declared: true, onCouncilServers: false });
  });

  it("says plainly when nothing is declared, and never claims Council servers unless configured", () => {
    expect(hostingInfo({})).toEqual({ provider: "Not declared", region: "Not declared", declared: false, onCouncilServers: false });
    expect(hostingInfo({ HOSTED_ON_COUNCIL_SERVERS: "true", HOSTING_PROVIDER: "Council data center" }).onCouncilServers).toBe(true);
  });

  it("reports a short build commit only when it looks like one", () => {
    expect(buildCommit({ BUILD_COMMIT: "22dec02aa11bb33cc44dd55ee66ff77889900aab" })).toBe("22dec02aa11b");
    expect(buildCommit({ VERCEL_GIT_COMMIT_SHA: "abcdef1" })).toBe("abcdef1");
    expect(buildCommit({ BUILD_COMMIT: "not a sha; DROP TABLE" })).toBeNull();
    expect(buildCommit({})).toBeNull();
  });
});

describe("[US-062] server logs carry the request ID", () => {
  it("writes one JSON line with the request ID, the error reference and the route, without the query string", () => {
    const line = formatErrorLog(
      { requestId: "7d5c0a52-6a45-4d0c-9d6f-0d0e8d5c9f11", digest: "2093817", method: "GET", path: "/finance/support?token=abc", route: "/finance/support", routeType: "render", message: "relation does not exist" },
      new Date("2026-10-09T12:00:00Z")
    );
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ level: "error", event: "request_error", requestId: "7d5c0a52-6a45-4d0c-9d6f-0d0e8d5c9f11", digest: "2093817", path: "/finance/support", route: "/finance/support", at: "2026-10-09T12:00:00.000Z" });
    expect(line).not.toContain("token=abc");
    expect(line.includes("\n")).toBe(false);
  });

  it("limits the message length and reads the request ID header from either header shape", () => {
    const long = JSON.parse(formatErrorLog({ requestId: null, digest: null, method: "POST", path: "/x", route: null, routeType: null, message: "m".repeat(2000) }));
    expect(long.message).toHaveLength(500);
    expect(headerValue({ [REQUEST_ID_HEADER]: "abc" }, REQUEST_ID_HEADER)).toBe("abc");
    expect(headerValue({ [REQUEST_ID_HEADER]: ["first", "second"] }, REQUEST_ID_HEADER)).toBe("first");
    expect(headerValue({}, REQUEST_ID_HEADER)).toBeNull();
  });
});
