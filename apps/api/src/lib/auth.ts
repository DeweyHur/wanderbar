import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Db } from "../db/client";
import { sessions, users } from "../db/schema";
import { unauthorized } from "./errors";
import { hashToken, newToken } from "./tokens";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const SESSION_DAYS = 90;

export type GoogleProfile = { sub: string; email: string; name: string | null; picture: string | null };
export type User = typeof users.$inferSelect;

let googleKeys: JWTVerifyGetKey | undefined;

/** Client IDs whose ID tokens we accept (the web client ID the apps request tokens for, plus any others). */
export function googleAudiences(): string[] {
  return (process.env.GOOGLE_CLIENT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function verifyGoogleIdToken(
  idToken: string,
  opts: { audiences: string[]; keySet?: JWTVerifyGetKey },
): Promise<GoogleProfile> {
  if (opts.audiences.length === 0) throw new Error("GOOGLE_CLIENT_IDS is not set");
  const keySet =
    opts.keySet ?? (googleKeys ??= createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")));
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keySet, { issuer: GOOGLE_ISSUERS, audience: opts.audiences }));
  } catch {
    throw unauthorized("auth.invalid_google_token");
  }
  if (typeof payload.sub !== "string" || typeof payload.email !== "string" || payload.email_verified === false) {
    throw unauthorized("auth.email_unverified");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

/** Upserts the user and opens a new session. The returned token is shown once; only its hash is stored. */
export async function signIn(db: Db, profile: GoogleProfile, now = new Date()) {
  const [user] = await db
    .insert(users)
    .values({ googleSub: profile.sub, email: profile.email, name: profile.name, image: profile.picture })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: { email: profile.email, name: profile.name, image: profile.picture },
    })
    .returning();
  return openSession(db, user, now);
}

async function openSession(db: Db, user: User, now: Date) {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId: user.id, expiresAt });
  return { token, expiresAt, user };
}

export async function userFromToken(db: Db, token: string | null, now = new Date()): Promise<User | null> {
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  return rows[0]?.user ?? null;
}

export async function signOut(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}


export const SUPPORTED_LOCALES = ["en", "ko"] as const;

/** null = follow the device language. */
export async function setUserLocale(db: Db, userId: string, locale: string | null) {
  const [user] = await db.update(users).set({ locale }).where(eq(users.id, userId)).returning();
  return user;
}

// ---- Sign in with Apple ----

const APPLE_ISSUER = "https://appleid.apple.com";
let appleKeys: JWTVerifyGetKey | undefined;

export type AppleProfile = { sub: string; email: string | null; emailVerified: boolean; privateRelay: boolean };

/** Who may request Apple tokens for us: the iOS app's bundle ID (plus a web Services ID, if one is added). */
export function appleAudiences(): string[] {
  return (process.env.APPLE_CLIENT_IDS ?? "app.wanderbar.mobile")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const truthy = (v: unknown) => v === true || v === "true";

export async function verifyAppleIdToken(idToken: string, opts: { audiences: string[]; keySet?: JWTVerifyGetKey }): Promise<AppleProfile> {
  const keySet = opts.keySet ?? (appleKeys ??= createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys")));
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keySet, { issuer: APPLE_ISSUER, audience: opts.audiences }));
  } catch {
    throw unauthorized("auth.invalid_apple_token");
  }
  if (typeof payload.sub !== "string") throw unauthorized("auth.invalid_apple_token");
  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: truthy(payload.email_verified),
    privateRelay: truthy(payload.is_private_email),
  };
}

/**
 * Signs in an Apple account. Apple gives the name only the first time (the app passes it along).
 * An Apple account with the same verified, real email as an existing Google account joins that account,
 * so people keep their groups whichever button they press. "Hide My Email" addresses get their own account.
 */
export async function signInWithApple(db: Db, profile: AppleProfile, name: string | null, now = new Date()) {
  const [known] = await db.select().from(users).where(eq(users.appleSub, profile.sub));
  if (known) {
    const [user] = await db
      .update(users)
      .set({ ...(profile.email && profile.emailVerified ? { email: profile.email } : {}), ...(name && !known.name ? { name } : {}) })
      .where(eq(users.id, known.id))
      .returning();
    return openSession(db, user, now);
  }
  if (!profile.email || !profile.emailVerified) throw unauthorized("auth.email_unverified");
  if (!profile.privateRelay) {
    const [same] = await db
      .select()
      .from(users)
      .where(and(sql`lower(${users.email}) = ${profile.email.toLowerCase()}`, isNull(users.appleSub)))
      .limit(1);
    if (same) {
      const [user] = await db.update(users).set({ appleSub: profile.sub }).where(eq(users.id, same.id)).returning();
      return openSession(db, user, now);
    }
  }
  const [user] = await db.insert(users).values({ appleSub: profile.sub, email: profile.email, name }).returning();
  return openSession(db, user, now);
}
