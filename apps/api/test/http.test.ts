import { describe, expect, it } from "vitest";
import { CLIENT_HEADER, csrfOk, SESSION_COOKIE, sessionCookie, sessionToken } from "@/lib/http";

const req = (method: string, headers: Record<string, string>) => new Request("https://x.test/api/me", { method, headers });

describe("sessionToken", () => {
  it("prefers the bearer token (apps)", () => {
    expect(sessionToken(req("GET", { authorization: "Bearer abc", cookie: `${SESSION_COOKIE}=zzz` }))).toEqual({ token: "abc", via: "bearer" });
  });
  it("falls back to the session cookie (web)", () => {
    expect(sessionToken(req("GET", { cookie: `other=1; ${SESSION_COOKIE}=t%2Bk` }))).toEqual({ token: "t+k", via: "cookie" });
  });
  it("returns null without either", () => {
    expect(sessionToken(req("GET", {}))).toBeNull();
  });
});

describe("csrfOk", () => {
  it("lets bearer requests through", () => {
    expect(csrfOk(req("POST", {}), "bearer")).toBe(true);
  });
  it("allows cookie GETs", () => {
    expect(csrfOk(req("GET", {}), "cookie")).toBe(true);
  });
  it("requires the client header on cookie writes", () => {
    expect(csrfOk(req("POST", {}), "cookie")).toBe(false);
    expect(csrfOk(req("POST", { [CLIENT_HEADER]: "web" }), "cookie")).toBe(true);
  });
});

describe("sessionCookie", () => {
  it("is httpOnly, secure and SameSite=Lax", () => {
    const c = sessionCookie("abc");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
  });
});
