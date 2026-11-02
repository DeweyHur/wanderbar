import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// PW_CHANNEL=chrome uses an installed Chrome instead of Playwright's own Chromium.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: "tests",
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
      GOOGLE_CLIENT_IDS: "e2e.apps.googleusercontent.com",
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "e2e.apps.googleusercontent.com",
      NEXT_TELEMETRY_DISABLED: "1",
      EXPO_NO_TELEMETRY: "1",
    },
  },
});
