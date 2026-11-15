import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { me, openHome, signIn, WEB } from "./helpers";

const FIXTURE = path.join(__dirname, "..", "fixtures", "dinner-exif.jpg");
const ZILLOW = "https://www.zillow.com/homedetails/1234-W-Main-St-Torrance-CA-90501/12345678_zpid/";
const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name, exact: typeof name === "string" }).filter({ visible: true });
const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true }).filter({ visible: true });
const visible = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });

async function newGroup(page: Page) {
  await page.goto("/group/new");
  await button(page, "Open houses").click();
  await field(page, "Group name").fill("House hunt");
  await button(page, "Create group").click();
  await expect(visible(page, "realestate-home")).toBeVisible();
  return (await me(page.request)).groups.find((g) => g.name === "House hunt")!.id;
}

test("open houses: paste a Zillow link, record the visit by room, score it, and the partner sees it", async ({ page, browser }) => {
  await signIn(page, "Dewey");
  await openHome(page);
  const groupId = await newGroup(page);
  await expect(page.getByText("No houses yet", { exact: false }).filter({ visible: true })).toBeVisible();

  // Paste a Zillow link: the address is read from the link; "Seeing it now" opens today's visit.
  await button(page, "🏠 Add a house").click();
  await field(page, "Listing link").fill(`Check out this home on Zillow ${ZILLOW}`);
  await expect(visible(page, "link-address")).toHaveText("Address: 1234 W Main St, Torrance, CA 90501");
  await field(page, "Price").fill("$950,000");
  await field(page, "Beds").fill("3");
  await field(page, "Baths").fill("2");
  await field(page, "Sq ft").fill("1400");
  await field(page, "Open house").fill("Sun 1–4pm");
  await button(page, "Save").click();

  // The visit: kitchen photo + note, scores, checks, overall, likes / concerns.
  await expect(visible(page, "tour")).toBeVisible();
  await expect(page.getByText("1234 W Main St, Torrance, CA 90501").filter({ visible: true }).first()).toBeVisible();
  await button(page, "Kitchen").click();
  const chooser = page.waitForEvent("filechooser");
  await button(page, "Add Kitchen photos").click();
  await (await chooser).setFiles(FIXTURE);
  await expect(visible(page, "tour-photo")).toHaveCount(1);
  await expect(button(page, "Kitchen (1)")).toBeVisible();
  await field(page, "Kitchen note").fill("North window, dark");
  await button(page, "Light 2").click();
  await button(page, "Quiet 4").click();
  await button(page, "Quiet 4").click(); // tapping again clears it
  await button(page, "Layout 5").click();
  await button(page, "· A/C").click();
  await button(page, "· Roof worry").click();
  await button(page, "✓ Roof worry").click(); // yes → no
  await button(page, "8/10").click();
  await button(page, "See it again").click();
  await field(page, "Liked").fill("Big yard");
  await field(page, "Concerns").fill("Close to the 405");
  await field(page, "Listing agent").fill("Jane 310-555-0100");
  await button(page, "Save").last().click();
  await expect(visible(page, "tour-saved")).toHaveText("Saved");

  // Back on the house: facts, the visit, the stage moved to "Seen".
  await page.goto("/group/" + groupId);
  const card = visible(page, "property-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("1234 W Main St, Torrance, CA 90501");
  await expect(card).toContainText("$950,000 · 3 bd · 2 ba · 1,400 sq ft");
  await expect(card).toContainText("Seen");
  await expect(card).toContainText("Me 8/10");
  await card.click();
  await expect(visible(page, "property-address")).toHaveText("1234 W Main St, Torrance, CA 90501");
  await expect(page.getByText("$679/sq ft", { exact: false }).filter({ visible: true })).toBeVisible();
  await expect(button(page, "Zillow")).toBeVisible();
  const tour = visible(page, "tour-card");
  await expect(tour).toContainText("8/10");
  await expect(tour).toContainText("See it again");
  await expect(tour).toContainText("Big yard");
  await expect(tour).toContainText("★ 3.5 · Light 2 · Layout 5");
  await expect(tour).toContainText("✓ A/C  ✗ Roof worry");
  await expect(tour).toContainText("Kitchen: North window, dark");
  await expect(visible(page, "photo-thumb")).toHaveCount(1);

  // Stage: thinking about an offer.
  await button(page, "Thinking about an offer").click();
  await expect(page.getByText("Thinking about an offer").filter({ visible: true }).first()).toBeVisible();

  // The same house again from Redfin: no duplicate, the link joins it.
  await page.goto(`/property/new?groupId=${groupId}`);
  await field(page, "Listing link").fill("https://www.redfin.com/CA/Torrance/1234-W-Main-St-90501/home/555");
  await button(page, "Interested").click();
  await button(page, "Save").click();
  await expect(page.getByText("Already saved. Opened it.").filter({ visible: true })).toBeVisible();
  await expect(button(page, "Redfin")).toBeVisible();

  // The partner joins and sees the visit, but can't edit it.
  const invite = await page.request.post(`/api/groups/${groupId}/invites`, { headers: WEB });
  const { token } = await invite.json();
  const ctx = await browser.newContext();
  const partner = await ctx.newPage();
  await signIn(partner, "Partner");
  expect((await partner.request.post(`/api/invites/${token}/accept`, { headers: WEB })).ok()).toBeTruthy();
  const { properties } = await (await partner.request.get(`/api/groups/${groupId}/properties`)).json();
  await partner.goto(`/property/${properties[0].id}`);
  await expect(visible(partner, "tour-card")).toContainText("Dewey");
  await expect(button(partner, "Edit my visit")).toHaveCount(0);
  const tourId = (await (await partner.request.get(`/api/properties/${properties[0].id}`)).json()).tours[0].id;
  expect((await partner.request.put(`/api/tours/${tourId}`, { headers: WEB, data: { overall: 1 } })).status()).toBe(403);
  // Their own visit, typed in for yesterday-ish.
  await button(partner, "📝 Record a visit").click();
  await expect(visible(partner, "tour")).toBeVisible();
  await button(partner, "6/10").click();
  await button(partner, "Save").last().click();
  await expect(visible(partner, "tour-saved")).toHaveText("Saved");
  await partner.goto(`/group/${groupId}`);
  await expect(visible(partner, "property-card")).toContainText("Me 6/10");
  await expect(visible(partner, "property-card")).toContainText("Avg 7");
  await ctx.close();

  // Outsiders get nothing.
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await signIn(stranger, "Stranger");
  expect((await stranger.request.get(`/api/properties/${properties[0].id}`)).status()).toBe(404);
  await other.close();
});

test("open houses: type an address, unreadable links, edit facts, reject with a reason, delete", async ({ page }) => {
  await signIn(page, "Solo");
  await openHome(page);
  const groupId = await newGroup(page);
  await button(page, "🏠 Add a house").click();
  await field(page, "Listing link").fill("https://www.zillow.com/torrance-ca/");
  await expect(page.getByText("No address in that link", { exact: false }).filter({ visible: true })).toBeVisible();
  await field(page, "Listing link").fill("");
  await field(page, "Or type the address").fill("15520 Larch Ave, Lawndale, CA 90260");
  await button(page, "To see").click();
  await button(page, "Save").click();
  await expect(visible(page, "property-address")).toHaveText("15520 Larch Ave, Lawndale, CA 90260");
  await expect(page.getByText("To see").filter({ visible: true }).first()).toBeVisible();

  await button(page, "Edit details").click();
  await field(page, "Price").fill("799000");
  await field(page, "Year built").fill("1954");
  await field(page, "HOA / month").fill("abc");
  await button(page, "Save").click();
  await expect(page.getByText("Check the numbers").filter({ visible: true })).toBeVisible();
  await field(page, "HOA / month").fill("");
  await button(page, "Save").click();
  await expect(page.getByText("$799,000").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Built 1954", { exact: false }).filter({ visible: true })).toBeVisible();

  await button(page, "Out").click();
  await field(page, "Why it's out").fill("Freeway noise");
  await button(page, "Save").click();
  await page.goto(`/group/${groupId}`);
  await button(page, "Out 1").click();
  await expect(visible(page, "property-card")).toContainText("15520 Larch Ave");
  await button(page, "To see 0").click();
  await expect(visible(page, "property-card")).toHaveCount(0);
  await button(page, "Out 1").click();
  await visible(page, "property-card").click();
  page.once("dialog", (d) => d.accept());
  await button(page, "Delete house").click();
  await expect(visible(page, "realestate-home")).toBeVisible();
  await expect(page.getByText("No houses yet", { exact: false }).filter({ visible: true })).toBeVisible();
});
