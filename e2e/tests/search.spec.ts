import { expect, test } from "@playwright/test";
import { addInput, current, newRoute, openHome, row, signIn } from "./helpers";

// The test server answers Google Places/Routes with canned data (E2E_FAKE_GOOGLE); the app only talks to our API.
test("search-first adding: pick a suggestion, get address, hours and drive times", async ({ page }) => {
  await signIn(page, "Searcher");
  await openHome(page);
  expect(await (await page.request.get("/api/config")).json()).toMatchObject({ googlePlaces: true });
  await newRoute(page);
  await expect(addInput(page)).toHaveAttribute("placeholder", "Search a place, or type cafe, park, jazz bar");

  await addInput(page).fill("blue");
  await page.getByText("Blue Bottle Coffee").click();
  await expect(current(page)).toContainText("Blue Bottle Coffee");
  await expect(current(page)).toContainText("315 Linden St, San Francisco, CA 94102");
  await expect(current(page)).toContainText("Open 24 hours");

  await addInput(page).fill("golden");
  await page.getByText("Golden Gate Park").first().click();
  await expect(row(page, 1)).toContainText("Golden Gate Park");
  // Drive times come back through our API.
  await expect(page.getByText("Drive 10 min · 3.0km")).toBeVisible();
  await expect(row(page, 1)).toContainText("10 min from the previous stop");

  await page.getByText("Map", { exact: true }).click();
  await expect(page.getByText("Blue Bottle Coffee → Golden Gate Park · 10 min · 3.0km")).toBeVisible();
});

test("place screen: Search Google fills the place", async ({ page }) => {
  await signIn(page, "Filler");
  await openHome(page);
  await newRoute(page);
  await addInput(page).fill("Jazz, later");
  await addInput(page).press("Enter");
  await current(page).getByText("Jazz").click();
  await page.getByLabel("Search Google").fill("sfjazz");
  await page.getByText("SFJAZZ Center").click();
  await expect(page.getByLabel("Name")).toHaveValue("SFJAZZ Center");
  await expect(page.getByLabel("Address")).toHaveValue("201 Franklin St, San Francisco, CA 94102");
  await expect(page.getByLabel("Opening hours")).toHaveValue("Mon-Sun 17:00-23:00");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});

test("place search needs sign-in", async ({ page }) => {
  const res = await page.request.post("/api/places/autocomplete", { data: { input: "blue", sessionToken: "abcdefgh12345" } });
  expect(res.status()).toBe(401);
});
