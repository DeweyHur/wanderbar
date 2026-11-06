import { isInMemoryDb } from "../db/client";

type Env = Record<string, string | undefined>;

/** End-to-end tests: the flag AND the throwaway in-memory database, never on Vercel. */
const e2e = (env: Env) => env.E2E_TEST_LOGIN === "1" && (env.DATABASE_URL ?? "").startsWith("pglite:") && env.VERCEL !== "1";

/**
 * Staging: a Vercel preview of the `staging` git branch, whose DATABASE_URL points at a Neon branch
 * (a copy of production that is reset from it). STAGING_TEST_LOGIN is set only for that branch.
 * Production deployments never qualify.
 */
const staging = (env: Env) =>
  env.STAGING_TEST_LOGIN === "1" && env.VERCEL === "1" && env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "staging";

/** Sign-in without Google (no password): only for end-to-end tests and the staging site. */
export function testLoginEnabled(env: Env = process.env) {
  return e2e(env) || staging(env);
}

export { isInMemoryDb };
