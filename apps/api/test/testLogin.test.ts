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
  const staging = { STAGING_TEST_LOGIN: "1", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging", DATABASE_URL: "postgresql://u:p@ep-proud-frost-b8uxdldk.c-14.us-east-1.aws.neon.tech/neondb?sslmode=require" };
  it("is on for the staging branch preview", () => {
    expect(testLoginEnabled(staging)).toBe(true);
  });
  it("is never on in production, other previews, or without the staging flag", () => {
    expect(testLoginEnabled({ ...staging, VERCEL_ENV: "production" })).toBe(false);
    expect(testLoginEnabled({ ...staging, VERCEL_GIT_COMMIT_REF: "main" })).toBe(false);
    expect(testLoginEnabled({ ...staging, STAGING_TEST_LOGIN: undefined })).toBe(false);
    expect(testLoginEnabled({ ...staging, VERCEL: undefined })).toBe(false);
    // The staging preview pointed at production's database (e.g. its own DATABASE_URL missing).
    expect(testLoginEnabled({ ...staging, DATABASE_URL: "postgresql://u:p@ep-other-12345-pooler.c-14.us-east-1.aws.neon.tech/neondb" })).toBe(false);
  });
});
