import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { signIn, signInWithApple, signOut, userFromToken, verifyAppleIdToken, verifyGoogleIdToken } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { profile, testDb } from "./db";

const AUD = "web-client.apps.googleusercontent.com";
let privateKey: CryptoKey;
let keySet: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  keySet = createLocalJWKSet({ keys: [jwk] });
});

const token = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
  new SignJWT({ email: "dewey@example.com", email_verified: true, name: "Dewey", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject("google-123")
    .setIssuer(opts.iss ?? "https://accounts.google.com")
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(privateKey);

describe("verifyGoogleIdToken", () => {
  it("accepts a valid Google ID token", async () => {
    const p = await verifyGoogleIdToken(await token({}), { audiences: [AUD], keySet });
    expect(p).toEqual({ sub: "google-123", email: "dewey@example.com", name: "Dewey", picture: null });
  });

  it("accepts the short issuer form", async () => {
    await expect(verifyGoogleIdToken(await token({}, { iss: "accounts.google.com" }), { audiences: [AUD], keySet })).resolves.toBeTruthy();
  });

  it.each([
    ["wrong audience", { aud: "someone-else" }],
    ["wrong issuer", { iss: "https://evil.example.com" }],
    ["expired", { exp: "-1m" }],
  ])("rejects %s", async (_label, opts) => {
    await expect(verifyGoogleIdToken(await token({}, opts), { audiences: [AUD], keySet })).rejects.toBeInstanceOf(HttpError);
  });

  it("rejects an unverified email", async () => {
    await expect(verifyGoogleIdToken(await token({ email_verified: false }), { audiences: [AUD], keySet })).rejects.toBeInstanceOf(HttpError);
  });
});

describe("sessions", () => {
  it("signs in, resolves the session, and signs out", async () => {
    const db = await testDb();
    const p = profile("dewey");
    const { token: t, user } = await signIn(db, p);
    expect((await userFromToken(db, t))?.id).toBe(user.id);
    expect(await userFromToken(db, "not-a-token")).toBeNull();
    await signOut(db, t);
    expect(await userFromToken(db, t)).toBeNull();
  });

  it("reuses the same user on a second sign-in and updates the profile", async () => {
    const db = await testDb();
    const p = profile("dewey");
    const a = await signIn(db, p);
    const b = await signIn(db, { ...p, name: "Dewey Hur" });
    expect(b.user.id).toBe(a.user.id);
    expect(b.user.name).toBe("Dewey Hur");
    expect(b.token).not.toBe(a.token);
  });

  it("expires sessions", async () => {
    const db = await testDb();
    const { token: t } = await signIn(db, profile("dewey"), new Date("2026-01-01"));
    expect(await userFromToken(db, t, new Date("2026-03-01"))).not.toBeNull();
    expect(await userFromToken(db, t, new Date("2026-05-01"))).toBeNull();
  });
});

const BUNDLE = "app.wanderbar.mobile";
const appleToken = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; sub?: string } = {}) =>
  new SignJWT({ email: "dewey@example.com", email_verified: "true", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject(opts.sub ?? "001234.apple")
    .setIssuer(opts.iss ?? "https://appleid.apple.com")
    .setAudience(opts.aud ?? BUNDLE)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
const apple = async (claims: Record<string, unknown> = {}, opts: { sub?: string } = {}) =>
  verifyAppleIdToken(await appleToken(claims, opts), { audiences: [BUNDLE], keySet });

describe("Sign in with Apple", () => {
  it("verifies Apple's token (string or boolean claims) and rejects other issuers/apps", async () => {
    expect(await apple({ is_private_email: "true" })).toEqual({ sub: "001234.apple", email: "dewey@example.com", emailVerified: true, privateRelay: true });
    expect((await apple({ email_verified: true })).emailVerified).toBe(true);
    await expect(verifyAppleIdToken(await appleToken({}, { iss: "https://accounts.google.com" }), { audiences: [BUNDLE], keySet })).rejects.toBeInstanceOf(HttpError);
    await expect(verifyAppleIdToken(await appleToken({}, { aud: "someone.else" }), { audiences: [BUNDLE], keySet })).rejects.toBeInstanceOf(HttpError);
  });

  it("a new Apple user gets an account; the name comes only the first time and sticks", async () => {
    const db = await testDb();
    const first = await signInWithApple(db, await apple({ email: "x@privaterelay.appleid.com", is_private_email: true }), "Hannah Kim");
    expect(first.user).toMatchObject({ appleSub: "001234.apple", googleSub: null, email: "x@privaterelay.appleid.com", name: "Hannah Kim" });
    expect((await userFromToken(db, first.token))?.id).toBe(first.user.id);
    const again = await signInWithApple(db, await apple({ email: "x@privaterelay.appleid.com", is_private_email: true }), null);
    expect(again.user).toMatchObject({ id: first.user.id, name: "Hannah Kim" });
  });

  it("joins an existing Google account with the same real email; Hide My Email doesn't", async () => {
    const db = await testDb();
    const google = await signIn(db, { ...profile("dewey"), email: "Dewey@Example.com" });
    const viaApple = await signInWithApple(db, await apple(), "Dewey H");
    expect(viaApple.user).toMatchObject({ id: google.user.id, appleSub: "001234.apple", name: "dewey" });
    const relay = await signInWithApple(db, await apple({ email: "dewey@example.com", is_private_email: "true" }, { sub: "other.apple" }), null);
    expect(relay.user.id).not.toBe(google.user.id);
  });

  it("refuses a first sign-in without a verified email", async () => {
    const db = await testDb();
    await expect(signInWithApple(db, await apple({ email: undefined }), null)).rejects.toMatchObject({ status: 401 });
    await expect(signInWithApple(db, await apple({ email_verified: "false" }), null)).rejects.toMatchObject({ status: 401 });
  });
});
