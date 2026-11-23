import path from "node:path";
import { expect, test } from "@playwright/test";
import { openHome, signIn, WEB } from "./helpers";

const FIXTURE = path.join(__dirname, "..", "fixtures", "dinner-exif.jpg");

// Everything on a day route becomes one of the group's places, typed by Google: a park is a sight with its
// own rating and photos (straight from the route), a concert hall is a venue that keeps the events seen there.
test("route stops become typed places: a sight rated with photos from the stop, a venue's events", async ({ page }) => {
  await signIn(page, "Traveler");
  const groupId = await openHome(page);
  const post = (url: string, data: unknown) => page.request.post(url, { headers: WEB, data }).then((r) => r.json());
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const plan = await post(`/api/groups/${groupId}/plans`, { date: iso });
  await post(`/api/plans/${plan.id}/stops`, {
    stops: [
      { name: "Golden Gate Park", googlePlaceId: "fake-ggp" },
      { name: "SFJAZZ Center", googlePlaceId: "fake-sfjazz" },
      { name: "Mensho Tokyo", googlePlaceId: "fake-mensho" },
      { name: "lunch somewhere" },
    ],
  });

  // The park's stop is the park's place page, with the route controls on top.
  await page.goto(`/plan/${plan.id}`);
  await page.getByTestId("stop-row-0").filter({ visible: true }).getByText("Golden Gate Park").click();
  await expect(page.getByTestId("route-widget").filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId("place-type").filter({ visible: true })).toHaveText("🏞️ Sight");
  await expect(page.getByTestId("menu-row")).toHaveCount(0); // no menus for a park

  // Photos straight from the route.
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add photos" }).filter({ visible: true }).first().click();
  await (await chooser).setFiles(FIXTURE);
  await expect(page.getByTestId("photo-thumb").filter({ visible: true })).toHaveCount(1);

  // Rated as a place: "How was it?"
  const reviews = page.getByTestId("reviews").filter({ visible: true });
  await expect(reviews).toContainText("How was it?");
  await reviews.getByRole("button", { name: /^(⭐ )?Rate$/ }).click();
  await page.getByRole("button", { name: "5 stars", exact: true }).filter({ visible: true }).click();
  await page.getByPlaceholder("What was it like? (optional)").filter({ visible: true }).fill("Bison paddock!");
  await page.getByRole("button", { name: "Save rating" }).filter({ visible: true }).click();
  await expect(reviews.getByTestId("review")).toContainText("Bison paddock!");

  // The venue keeps events, each rated.
  await page.goto(`/plan/${plan.id}`);
  await page.getByTestId("stop-row-1").filter({ visible: true }).getByText("SFJAZZ Center").click();
  await expect(page.getByTestId("place-type").filter({ visible: true })).toHaveText("🎟️ Event venue");
  const events = page.getByTestId("event-list").filter({ visible: true });
  await events.getByPlaceholder("What was on (a show, a game…)").fill("Brad Mehldau Trio");
  await events.getByRole("button", { name: "Add event" }).click();
  await expect(events.getByTestId("event-row")).toContainText("Brad Mehldau Trio");
  await events.getByRole("button", { name: "Brad Mehldau Trio" }).click();
  await events.getByRole("button", { name: /^(⭐ )?Rate$/ }).click();
  await page.getByRole("button", { name: "4 stars", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Save rating" }).filter({ visible: true }).click();
  await expect(events.getByTestId("event-row")).toContainText("4.0");

  // The Places tab: filter by kind. A bare typed name didn't become a place.
  await page.goto(`/group/${groupId}`);
  await page.getByRole("button", { name: "Places", exact: true }).filter({ visible: true }).click();
  const filter = page.getByTestId("place-type-filter").filter({ visible: true });
  await expect(filter).toContainText("All 3");
  await filter.getByRole("button", { name: "🏞️ Sight 1" }).click();
  const rows = page.getByTestId("restaurant-card").filter({ visible: true });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("🏞️ Golden Gate Park");
  await filter.getByRole("button", { name: "🍜 Restaurant 1" }).click();
  await expect(rows.first()).toContainText("Mensho Tokyo");

  // A place's kind can be changed: the venue becomes a sight.
  await rows.first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).filter({ visible: true }).first().click();
  await page.getByTestId("place-type-picker").filter({ visible: true }).getByRole("button", { name: "🏨 Stay" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).click();
  await expect(page.getByTestId("place-type").filter({ visible: true })).toHaveText("🏨 Stay");
  await expect(page.getByTestId("reviews").filter({ visible: true })).toContainText("How was the stay?");
});
