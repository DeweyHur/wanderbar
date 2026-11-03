import { expect, test } from "@playwright/test";
import { addInput, current, newRoute, openHome, row, signIn } from "./helpers";

// Real Google Places/Routes through our API, with the same server key production uses.
// Run with: E2E_LIVE_GOOGLE=1 GOOGLE_SERVER_KEY=... npx playwright test (behind an HTTP proxy, also NODE_USE_ENV_PROXY=1)
test("live: autocomplete, place details and drive time from real Google", async ({ page }) => {
  test.skip(!process.env.GOOGLE_SERVER_KEY, "needs GOOGLE_SERVER_KEY");
  await signIn(page, "Live");
  await openHome(page);
  expect(await (await page.request.get("/api/config")).json()).toEqual({ googlePlaces: true });
  await newRoute(page);

  await addInput(page).fill("Tartine Bakery Guerrero");
  const first = page.getByText("Tartine Bakery", { exact: true }).first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  await first.click();
  await expect(current(page)).toContainText("Tartine Bakery");
  await expect(current(page)).toContainText("Guerrero St");

  await addInput(page).fill("Dolores Park San Francisco");
  const park = page.getByText("Mission Dolores Park", { exact: true }).first();
  await expect(park).toBeVisible({ timeout: 15_000 });
  await park.click();
  await expect(row(page, 1)).toContainText("Dolores Park");
  // A real drive time between the two (a few minutes apart in the Mission).
  await expect(page.getByText(/^Drive \d+ min · [\d.]+ ?k?m/)).toBeVisible({ timeout: 15_000 });
});

test("live: a typed restaurant is found on Google (text search) with hours and a category", async ({ page }) => {
  test.skip(!process.env.GOOGLE_SERVER_KEY, "needs GOOGLE_SERVER_KEY");
  await signIn(page, "Live Saver");
  const groupId = await openHome(page);
  const res = await page.request.post(`/api/groups/${groupId}/restaurants`, {
    headers: { "x-wanderbar-client": "web" },
    data: { name: "Tartine Bakery", address: "600 Guerrero St, San Francisco" },
  });
  expect(res.status()).toBe(201);
  const { restaurant } = await res.json();
  expect(restaurant.googlePlaceId).not.toBe("");
  expect(restaurant.category).toBe("bakery");
  expect(restaurant.hoursRaw).not.toBe("");
  expect(restaurant.mapsUrl).toMatch(/^https:\/\/maps\.google\.com\//);
  // The same place typed differently is the same restaurant.
  const again = await page.request.post(`/api/groups/${groupId}/restaurants`, {
    headers: { "x-wanderbar-client": "web" },
    data: { name: "tartine", address: "Guerrero St San Francisco" },
  });
  expect((await again.json()).restaurant.id).toBe(restaurant.id);
});

test("live: a restaurant picked into a route is filed as a restaurant with a real cover photo; a park isn't", async ({ page }) => {
  test.skip(!process.env.GOOGLE_SERVER_KEY, "needs GOOGLE_SERVER_KEY");
  await signIn(page, "Live Router");
  const groupId = await openHome(page);
  await newRoute(page);
  await addInput(page).fill("Tartine Bakery Guerrero");
  await page.getByText("Tartine Bakery", { exact: true }).first().click();
  await expect(current(page)).toContainText("Tartine Bakery");
  await addInput(page).fill("Dolores Park San Francisco");
  await page.getByText("Mission Dolores Park", { exact: true }).first().click();
  await expect(row(page, 1)).toContainText("Dolores Park");

  const { restaurants } = await (await page.request.get(`/api/groups/${groupId}/restaurants`)).json();
  expect(restaurants.map((r: { name: string }) => r.name)).toEqual(["Tartine Bakery"]);
  expect(restaurants[0].hasPhoto).toBe(true);
  const photo = await page.request.get(`/api/restaurants/${restaurants[0].id}/photo`, { maxRedirects: 0 });
  expect(photo.status()).toBe(302);
  expect(photo.headers()["location"]).toMatch(/^https:\/\/[a-z0-9.-]*googleusercontent\.com\//);
  expect(photo.headers()["location"]).not.toContain("key=");
});
