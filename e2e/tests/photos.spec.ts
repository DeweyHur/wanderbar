import path from "node:path";
import exifr from "exifr";
import { expect, test, type Page } from "@playwright/test";
import { openHome, signIn, WEB } from "./helpers";

const FIXTURE = path.join(__dirname, "..", "fixtures", "dinner-exif.jpg"); // 2400x1800, taken 2026-10-10 19:30 -07:00

async function addPhoto(page: Page) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add photos" }).filter({ visible: true }).first().click();
  await (await chooser).setFiles(FIXTURE);
}

test("restaurant photo: resized without EXIF, private to the group, and its camera time records the visit", async ({ page, browser }) => {
  await signIn(page, "Snapper");
  const groupId = await openHome(page);
  const { restaurant } = await (await page.request.post(`/api/groups/${groupId}/restaurants`, { headers: WEB, data: { name: "Noodle House" } })).json();
  await page.goto(`/restaurant/${restaurant.id}`);
  await expect(page.getByText("No visits yet.", { exact: false })).toBeVisible();

  await addPhoto(page);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(1);
  await expect(page.getByTestId("visit-row")).toContainText("Oct 10, 2026");
  await expect(page.getByTestId("restaurant-photo")).toBeVisible();

  const [photo] = (await (await page.request.get(`/api/items/${restaurant.id}/photos`)).json()).photos;
  // Stored as 1280px WebP (Chromium encodes WebP) plus a 360px thumbnail the strip shows.
  expect(photo).toMatchObject({ width: 1280, height: 960, takenAt: "2026-10-11T02:30:00.000Z" });
  const img = await page.request.get(photo.url);
  expect(img.headers()["content-type"]).toBe("image/webp");
  const bytes = await img.body();
  expect(bytes.length).toBeLessThan(250_000);
  expect(await exifr.parse(bytes).catch(() => undefined)).toBeFalsy();
  const thumb = await page.request.get(photo.thumbUrl);
  expect(thumb.headers()["content-type"]).toBe("image/webp");
  expect((await thumb.body()).length).toBeLessThan(40_000);
  expect((await thumb.body()).length).toBeLessThan(bytes.length);

  const other = await (await browser.newContext()).newPage();
  await signIn(other, "Outsider");
  expect((await other.request.get(photo.url)).status()).toBe(404);

  // Open it and delete it.
  await page.getByTestId("photo-thumb").click();
  await expect(page.getByTestId("photo-full")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete photo" }).click();
  await expect(page.getByTestId("photo-thumb")).toHaveCount(0);
});

test("dish photo logs 'made it' on the photo's day", async ({ page }) => {
  await signIn(page, "Home Cook");
  const groupId = await openHome(page);
  const dish = await (await page.request.post(`/api/groups/${groupId}/dishes`, { headers: WEB, data: { name: "Kimchi stew" } })).json();
  await page.goto(`/dish/${dish.id}`);
  await expect(page.getByText("Not logged yet.")).toBeVisible();
  await addPhoto(page);
  await expect(page.getByTestId("photo-thumb")).toHaveCount(1);
  await expect(page.getByTestId("made-row")).toContainText("Oct 10, 2026");
  await page.goto(`/group/${groupId}`);
  await page.getByRole("button", { name: "Home cooking", exact: true }).click();
  await expect(page.getByTestId("dish-card").filter({ visible: true }).locator("img")).toHaveCount(1);
});
