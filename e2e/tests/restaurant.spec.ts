import { expect, test, type Page } from "@playwright/test";
import { current, openHome, signIn, WEB } from "./helpers";

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

test("menus with prices: add several quickly, edit and delete on the menu page", async ({ page }) => {
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
  const rows = page.getByTestId("menu-row").filter({ visible: true });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Cold noodles");
  await expect(rows.nth(0)).toContainText("$16.50");
  await expect(rows.nth(0)).toContainText("No ratings yet");
  await expect(rows.nth(1)).toContainText("Dumplings");

  await rows.nth(1).click();
  await page.getByRole("button", { name: "Edit menu" }).click();
  await page.getByRole("textbox", { name: "Price (USD)", exact: true }).filter({ visible: true }).last().fill("12");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("menu-info").filter({ visible: true })).toContainText("$12");
  await page.goBack();
  await expect(rows.nth(1)).toContainText("$12");

  await rows.nth(0).click();
  await page.getByRole("button", { name: "Edit menu" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete menu" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Dumplings");
});

test("rate menus in half stars with a review; the group sees averages and each other's reviews", async ({ page, browser }) => {
  await signIn(page, "Rater");
  const groupId = await openHome(page);
  const { restaurant } = await (
    await page.request.post(`/api/groups/${groupId}/restaurants`, { headers: WEB, data: { name: "Ramen Ya", category: "japanese" } })
  ).json();
  await page.request.post(`/api/restaurants/${restaurant.id}/menus`, { headers: WEB, data: { name: "Tonkotsu", priceMinor: 1800 } });

  // A friend joins and rates first.
  const inv = await (await page.request.post(`/api/groups/${groupId}/invites`, { headers: WEB })).json();
  const friend = await (await browser.newContext({ locale: "en-US" })).newPage();
  await signIn(friend, "Jisoo");
  expect((await friend.request.post(`${new URL(inv.url).pathname.replace("/invite/", "/api/invites/")}/accept`, { headers: WEB })).ok()).toBeTruthy();
  const r = await (await friend.request.get(`/api/restaurants/${restaurant.id}`)).json();
  const menuId = r.menus[0].id;
  expect((await friend.request.put(`/api/menus/${menuId}/rating`, { headers: WEB, data: { stars: 3, review: "Broth a bit salty" } })).ok()).toBeTruthy();
  await friend.close();

  await page.goto(`/restaurant/${restaurant.id}`);
  await page.getByTestId("menu-row").filter({ visible: true }).click();
  await expect(page.getByTestId("review")).toContainText("Jisoo");
  await expect(page.getByTestId("review")).toContainText("Broth a bit salty");
  await page.getByRole("button", { name: "4.5 stars", exact: true }).click();
  await page.getByLabel("Review").fill("Rich and creamy");
  await page.getByRole("button", { name: "Save rating" }).click();
  await expect(page.getByText("Rating saved")).toBeVisible();
  await expect(page.getByTestId("menu-info").filter({ visible: true })).toContainText("3.8 (2)");

  await page.goBack();
  const row = page.getByTestId("menu-row").filter({ visible: true });
  await expect(row).toContainText("3.8 (2)");
  await expect(row).toContainText("You: 4.5★");
  await expect(info(page)).toContainText("3.8 (2)");
  await page.goto(`/group/${groupId}`);
  await restaurantsTab(page).click();
  await expect(page.getByTestId("restaurant-card").filter({ visible: true })).toContainText("3.8 (2)");

  // Rating again replaces mine; reloading shows what I saved.
  await page.goto(`/menu/${menuId}`);
  await expect(page.getByLabel("Review")).toHaveValue("Rich and creamy");
  await page.getByRole("button", { name: "5 stars", exact: true }).click();
  await page.getByRole("button", { name: "Save rating" }).click();
  await expect(page.getByTestId("menu-info").filter({ visible: true })).toContainText("4.0 (2)");
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
  await page.getByTestId("add-to-route").filter({ visible: true }).getByRole("button", { name: "New route" }).click();
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

  await page.getByRole("button", { name: "Edit", exact: true }).click();
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

test("finishing a restaurant stop offers to rate it", async ({ page }) => {
  await signIn(page, "Eater");
  const groupId = await openHome(page);
  const { restaurant } = await (await page.request.post(`/api/groups/${groupId}/restaurants`, { headers: WEB, data: { name: "Taco Spot" } })).json();
  const plan = await (await page.request.post(`/api/groups/${groupId}/plans`, { headers: WEB, data: { title: "Lunch" } })).json();
  await page.request.post(`/api/plans/${plan.id}/stops`, { headers: WEB, data: { stops: [{ name: "Taco Spot", itemId: restaurant.id }, { name: "Park" }] } });
  await page.goto(`/plan/${plan.id}`);
  await current(page).getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("rate-prompt")).toContainText("How was Taco Spot?");
  await page.getByTestId("rate-prompt").getByRole("button", { name: "Rate" }).click();
  await expect(info(page)).toContainText("Taco Spot");

  // A plain place doesn't ask.
  await page.goBack();
  await current(page).getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("rate-prompt")).toHaveCount(0);
});
