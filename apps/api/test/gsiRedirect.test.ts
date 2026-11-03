import { describe, expect, it } from "vitest";
import { readCookie, safeReturnPath } from "@/lib/gsiRedirect";

describe("web Google sign-in (redirect mode)", () => {
  it("returns only to same-site paths", () => {
    expect(safeReturnPath("/invite/abc?x=1")).toBe("/invite/abc?x=1");
    expect(safeReturnPath("/group/1")).toBe("/group/1");
    for (const bad of [null, "", "//evil.com", "/\\evil.com", "https://evil.com", "evil", "/api/me"]) expect(safeReturnPath(bad)).toBe("/");
  });
  it("reads cookies", () => {
    const req = new Request("https://x/", { headers: { cookie: "a=1; g_csrf_token=abc%20d; wb_return=%2Finvite%2Fz" } });
    expect(readCookie(req, "g_csrf_token")).toBe("abc d");
    expect(readCookie(req, "wb_return")).toBe("/invite/z");
    expect(readCookie(req, "nope")).toBeNull();
  });
});
