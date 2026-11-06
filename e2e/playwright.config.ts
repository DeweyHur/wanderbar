import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// Tests compute dates ("today", next Saturday) in the same time zone as the browser below; without this
// they broke on CI between 00:00 and 08:00 UTC, when it is already tomorrow in UTC. Workers inherit it.
process.env.TZ = "America/Los_Angeles";
// PW_CHANNEL=chrome uses an installed Chrome instead of Playwright's own Chromium.
const channel = process.env.PW_CHANNEL || undefined;
// E2E_LIVE_GOOGLE=1 (with GOOGLE_SERVER_KEY set) talks to the real Google Places/Routes instead of canned answers.
const live = process.env.E2E_LIVE_GOOGLE === "1";

export default defineConfig({
  testDir: "tests",
  // The live suite only runs when asked for; the canned suite doesn't run against real Google.
  ...(live ? { testMatch: /live-.*\.spec\.ts/ } : { testIgnore: /live-.*\.spec\.ts/ }),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One server with one in-memory database; tests use their own users, so order doesn't matter.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, locale: "en-US", timezoneId: "America/Los_Angeles", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    { name: "phone", use: { ...devices["Pixel 7"], channel } },
  ],
  webServer: {
    // The same build Vercel ships (Expo web export + Next.js API), started locally.
    command: process.env.E2E_SKIP_BUILD ? `npm run start -w @wanderbar/api -- -p ${PORT}` : "npm run server",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 400_000,
    stdout: "pipe",
    env: {
      DATABASE_URL: "pglite:memory",
      E2E_TEST_LOGIN: "1",
      // Canned Google Places/Routes answers (server-side; never reaches Google).
      E2E_FAKE_GOOGLE: live ? "0" : "1",
      ...(live ? { GOOGLE_SERVER_KEY: process.env.GOOGLE_SERVER_KEY ?? "" } : {}),
      GOOGLE_CLIENT_IDS: "e2e.apps.googleusercontent.com",
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "e2e.apps.googleusercontent.com",
      NEXT_TELEMETRY_DISABLED: "1",
      EXPO_NO_TELEMETRY: "1",
    },
  },
});
