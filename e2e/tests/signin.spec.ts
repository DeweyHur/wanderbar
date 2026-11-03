import { expect, test } from "@playwright/test";

// Web sign-in uses Google's redirect mode (no popup): Google posts the ID token to our callback.
test("the Google redirect callback rejects bad posts and the page says sign-in failed", async ({ page }) => {
  const post = (form: Record<string, string>, cookie?: string) =>
    page.request.post("/api/auth/google/redirect", { form, maxRedirects: 0, headers: cookie ? { cookie } : {} });

  let res = await post({ g_csrf_token: "a" });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toMatch(/\/\?signin=csrf$/);

  res = await post({ credential: "x.y.z", g_csrf_token: "a" }, "g_csrf_token=b");
  expect(res.headers()["location"]).toMatch(/\/\?signin=csrf$/);

  res = await post({ credential: "not-a-google-token", g_csrf_token: "a" }, "g_csrf_token=a; wb_return=%2F%2Fevil.com");
  expect(res.headers()["location"]).toMatch(/\/\?signin=failed$/);
  expect(res.headers()["set-cookie"] ?? "").not.toContain("wb_session=");

  await page.goto("/?signin=failed");
  await expect(page.getByText("Google sign-in couldn't be verified")).toBeVisible();
});

test("the Google button is set up for redirect sign-in", async ({ page }) => {
  await page.route("https://accounts.google.com/gsi/client", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `window.google={accounts:{id:{initialize:(o)=>{window.__gsi=o},renderButton:(el)=>{el.textContent="G"},prompt:()=>{}}}};`,
    }),
  );
  await page.goto("/invite/some-token");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __gsi?: { ux_mode: string; login_uri: string } }).__gsi?.ux_mode)).toBe("redirect");
  const opts = await page.evaluate(() => (window as unknown as { __gsi: { login_uri: string } }).__gsi);
  expect(opts.login_uri).toMatch(/\/api\/auth\/google\/redirect$/);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "wb_return")?.value).toBe(encodeURIComponent("/invite/some-token"));
});
