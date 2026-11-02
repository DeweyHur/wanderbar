import { expect, test, type Page } from "@playwright/test";
import { current, openHome, signIn } from "./helpers";

// Milestone 3: the group's restaurants and menus (Google answers are canned by the test server).

const restaurantsTab = (page: Page) => page.getByRole("button", { name: "Restaurants", exact: true });
// The web stack keeps earlier screens in the page (hidden), so look at the visible one.
const info = (page: Page) => page.getByTestId("restaurant-info").filter({ visible: true });

test("add a restaurant from Google search: address, hours and a category guess fill in", async ({ page }) => {
  await signIn(page, "Picker");
  await openHome(page);
  await restaurantsTab(page).click();
  await expect(page.getByText("No restaurants yet.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Add restaurant" }).click();
  await page.getByLabel("Search Google").fill("mensho");
  await page.getByText("Mensho Tokyo").click();

  await expect(info(page)).toContainText("Mensho Tokyo");
  await expect(info(page)).toContainText("Japanese");
  await expect(info(page)).toContainText("672 Geary St, San Francisco, CA 94102");
  await expect(info(page)).toContainText(/Open · until 22:00|Closed · opens 11:30|Closing soon/);

  // Back on the group home the restaurants tab is remembered and lists it.
  await page.goBack();
  await page.reload();
  await expect(page.getByTestId("restaurant-card")).toContainText("Mensho Tokyo");
  await expect(page.getByTestId("restaurant-card")).toContainText("Japanese");
});

test("menus with prices: add, edit, delete", async ({ page }) => {
  await signIn(page, "Menus");
  await openHome(page);
  await restaurantsTab(page).click();
  await page.getByRole("button", { name: "Add restaurant" }).click();
  await page.getByLabel("Name").fill("Noodle Bar");
  await page.getByRole("button", { name: "Korean", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(info(page)).toContainText("Korean");
  await expect(page.getByText("No menus yet.", { exact: false })).toBeVisible();

  await page.getByPlaceholder("Menu name").fill("Cold noodles");
  await page.getByPlaceholder("Price (USD)").fill("16.5");
  await page.getByRole("button", { name: "Add menu" }).click();
  await page.getByPlaceholder("Menu name").fill("Dumplings");
  await page.getByRole("button", { name: "Add menu" }).click();
  const rows = page.getByTestId("menu-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Cold noodles");
  await expect(rows.nth(0)).toContainText("$16.50");
  await expect(rows.nth(1)).toContainText("Dumplings");

  await page.getByRole("button", { name: "Dumplings" }).click();
  await page.getByLabel("Price (USD)").first().fill("12");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(rows.nth(1)).toContainText("$12");

  await page.getByRole("button", { name: "Cold noodles" }).click();
  await page.getByRole("button", { name: "Delete menu" }).click();
  await expect(rows).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("menu-row")).toHaveCount(1);
  await expect(page.getByTestId("menu-row")).toContainText("Dumplings");
});

test("a Yelp share saved twice is one restaurant; it carries Yelp and Google links", async ({ page }) => {
  await signIn(page, "Yelp Saver");
  const groupId = await openHome(page);
  for (const attempt of [1, 2]) {
    await page.goto("/share");
    await page.getByLabel("Paste a Google Maps or Yelp share").fill("Check out Mensho Tokyo on Yelp! https://yelp.to/mensho");
    await expect(page.getByLabel("Name")).toHaveValue("Mensho Tokyo");
    await page.getByRole("button", { name: "Save as a restaurant" }).click();
    await expect(info(page)).toContainText("Mensho Tokyo");
    if (attempt === 2) await expect(page.getByText("Already saved in this group", { exact: false })).toBeVisible();
  }
  const { restaurants } = await (await page.request.get(`/api/groups/${groupId}/restaurants`)).json();
  expect(restaurants).toHaveLength(1);
  expect(restaurants[0]).toMatchObject({
    name: "Mensho Tokyo",
    yelpUrl: "https://www.yelp.com/biz/mensho-tokyo-san-francisco",
    mapsUrl: "https://maps.google.com/?cid=4",
    hoursRaw: "Mon-Sun 11:30-22:00",
  });
});

test("add a saved restaurant to a day route, and get back to it from the stop", async ({ page }) => {
  await signIn(page, "Router");
  await openHome(page);
  await restaurantsTab(page).click();
  await page.getByRole("button", { name: "Add restaurant" }).click();
  await page.getByLabel("Search Google").fill("blue");
  await page.getByText("Blue Bottle Coffee").click();
  await expect(info(page)).toContainText("Cafe");

  await page.getByRole("button", { name: "Add to route" }).click();
  await page.getByTestId("add-to-route").getByRole("button", { name: "New route" }).click();
  await expect(current(page)).toContainText("Blue Bottle Coffee");
  await expect(current(page)).toContainText("315 Linden St");

  await current(page).getByText("Blue Bottle Coffee").click();
  await page.getByRole("button", { name: "Restaurant page" }).click();
  await expect(info(page)).toContainText("Blue Bottle Coffee");
});

test("edit a restaurant, filter by category, and delete it", async ({ page }) => {
  await signIn(page, "Editor");
  const groupId = await openHome(page);
  for (const [name, category] of [
    ["Taqueria", "mexican"],
    ["Pho Place", "vietnamese"],
  ]) {
    const res = await page.request.post(`/api/groups/${groupId}/restaurants`, {
      headers: { "x-wanderbar-client": "web" },
      data: { name, category },
    });
    expect(res.status()).toBe(201);
  }
  await page.reload();
  await restaurantsTab(page).click();
  await expect(page.getByTestId("restaurant-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Vietnamese", exact: true }).click();
  await expect(page.getByTestId("restaurant-card")).toHaveCount(1);
  await expect(page.getByTestId("restaurant-card")).toContainText("Pho Place");

  await page.getByTestId("restaurant-card").click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Pho Saigon");
  await page.getByLabel("Opening hours").fill("Mon-Sun 00:00-24:00");
  await page.getByLabel("Memo").fill("Cash only");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(info(page)).toContainText("Pho Saigon");
  await expect(info(page)).toContainText("Cash only");
  await expect(info(page)).toContainText("Open 24 hours");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete restaurant" }).click();
  await expect(page.getByTestId("restaurant-card")).toHaveCount(1);
  await expect(page.getByTestId("restaurant-card")).toContainText("Taqueria");
});

test("restaurants are private to the group", async ({ page, browser }) => {
  await signIn(page, "Owner");
  const groupId = await openHome(page);
  const created = await page.request.post(`/api/groups/${groupId}/restaurants`, {
    headers: { "x-wanderbar-client": "web" },
    data: { name: "Secret spot" },
  });
  const { restaurant } = await created.json();

  const other = await browser.newPage();
  await signIn(other, "Stranger");
  expect((await other.request.get(`/api/groups/${groupId}/restaurants`)).status()).toBe(404);
  expect((await other.request.get(`/api/restaurants/${restaurant.id}`)).status()).toBe(404);
  await other.close();
});
