import { describe, expect, it } from "vitest";
import { testLoginEnabled } from "@/lib/testLogin";

describe("testLoginEnabled", () => {
  it("is off by default", () => {
    expect(testLoginEnabled({})).toBe(false);
  });
  it("is off on a real database even with the flag", () => {
    expect(testLoginEnabled({ E2E_TEST_LOGIN: "1", DATABASE_URL: "postgresql://x@ep-1.neon.tech/db" })).toBe(false);
  });
  it("is off without the flag on the in-memory database", () => {
    expect(testLoginEnabled({ DATABASE_URL: "pglite:memory" })).toBe(false);
  });
  it("is off on Vercel no matter what", () => {
    expect(testLoginEnabled({ E2E_TEST_LOGIN: "1", DATABASE_URL: "pglite:memory", VERCEL: "1" })).toBe(false);
  });
  it("is on only with the flag and the in-memory database", () => {
    expect(testLoginEnabled({ E2E_TEST_LOGIN: "1", DATABASE_URL: "pglite:memory" })).toBe(true);
  });
});
