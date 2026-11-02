import { isInMemoryDb } from "../db/client";

/**
 * Sign-in without Google, for end-to-end tests only. On only when BOTH the E2E flag is set AND the server
 * runs on the throwaway in-memory database, so it can never be switched on against real data.
 */
export function testLoginEnabled(env: Record<string, string | undefined> = process.env) {
  return env.E2E_TEST_LOGIN === "1" && (env.DATABASE_URL ?? "").startsWith("pglite:") && env.VERCEL !== "1";
}

export { isInMemoryDb };
