import { expect, test } from "@playwright/test";
import { openHome, signIn, WEB } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);

// Picking the day's places on a map: the route's pins plus the group's places nearby. A pin opens in
// Google Maps or Yelp, goes on the route, or comes off it; the list also lets you remove a stop.
test("route map: pick a nearby place from the map, open it on Yelp, then remove it from the list", async ({ page }) => {
  await signIn(page, "Mapper");
  const groupId = await openHome(page);
  const post = (url: string, data: unknown) => page.request.post(url, { headers: WEB, data }).then((r) => r.json());

  // Another route already has a cafe a few blocks away: it's one of "our places nearby".
  const other = await post(`/api/groups/${groupId}/plans`, { date: today(), title: "Last week" });
  await post(`/api/plans/${other.id}/stops`, { stops: [{ name: "Cafe Uno", address: "12 Main St, Sedona, AZ", lat: 34.8705, lng: -111.7612 }] });
  const plan = await post(`/api/groups/${groupId}/plans`, { date: today() });
  await post(`/api/plans/${plan.id}/stops`, { stops: [{ name: "Bell Rock Trail", address: "Bell Rock Trail, Sedona, AZ", lat: 34.8697, lng: -111.7609 }] });

  await page.goto(`/plan/${plan.id}/map`);
  const map = page.getByTestId("route-map").filter({ visible: true });
  await expect(map).toBeVisible();
  await expect(map.getByTitle("1. Bell Rock Trail")).toBeVisible();
  await expect(page.getByRole("button", { name: "Our places nearby (1)" })).toBeVisible();

  // Tap the nearby place's pin: what it is, and links out.
  await map.getByTitle("Cafe Uno").click();
  const card = page.getByTestId("map-selected").filter({ visible: true });
  await expect(card).toContainText("Cafe Uno");
  await expect(card).toContainText("on your routes");
  // Outside sites aren't reachable from the test browser: answer Yelp locally and check where it went.
  await page.context().route("https://www.yelp.com/**", (r) => r.fulfill({ body: "yelp" }));
  const popup = page.waitForEvent("popup");
  await card.getByRole("button", { name: "Yelp", exact: true }).click();
  const yelp = await popup;
  await yelp.waitForLoadState();
  expect(decodeURIComponent(yelp.url().replace(/\+/g, " "))).toContain("yelp.com/search?find_desc=Cafe Uno&find_loc=12 Main St, Sedona, AZ");
  await yelp.close();
  await expect(card.getByRole("button", { name: "Google Maps", exact: true })).toBeVisible();

  // Put it on the route: it becomes stop 2, and is no longer offered.
  await card.getByRole("button", { name: "Add to route" }).click();
  await expect(card).toContainText("Stop 2 on this route");
  await expect(map.getByTitle("2. Cafe Uno")).toBeVisible();
  await expect(page.getByRole("button", { name: /Our places nearby/ })).toHaveCount(0);

  // Back on the list, each stop has its own remove button.
  await page.goto(`/plan/${plan.id}`);
  await expect(page.getByTestId("stop-row-1").filter({ visible: true })).toContainText("Cafe Uno");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove Cafe Uno" }).filter({ visible: true }).click();
  await expect(page.getByTestId("stop-row-1").filter({ visible: true })).toHaveCount(0);
  await expect(page.getByTestId("stop-row-0").filter({ visible: true })).toContainText("Bell Rock Trail");
});

// A route whose day is over is a record: no "heading to" card, no "go here now".
test("a past route shows where you went, without current-stop actions", async ({ page }) => {
  await signIn(page, "Lookback");
  const groupId = await openHome(page);
  const post = (url: string, data: unknown) => page.request.post(url, { headers: WEB, data }).then((r) => r.json());
  const yesterday = new Date(Date.now() - 86_400_000);
  const iso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  const plan = await post(`/api/groups/${groupId}/plans`, { date: iso });
  const stops = await post(`/api/plans/${plan.id}/stops`, { stops: [{ name: "Bell Rock Trail" }, { name: "Midgley Bridge" }] });
  await page.request.post(`/api/plans/${plan.id}/flow`, { headers: WEB, data: { action: "complete", stopId: stops.stops[0].id } });

  await page.goto(`/plan/${plan.id}`);
  await expect(page.getByTestId("past-route").filter({ visible: true })).toContainText("went to 1 of 2 places");
  await expect(page.getByTestId("current-card")).toHaveCount(0);
  await page.getByTestId("stop-row-1").filter({ visible: true }).getByText("Midgley Bridge").click();
  await expect(page.getByText("On a past route").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Go here now" })).toHaveCount(0);
});
