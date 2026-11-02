import { expect, test } from "@playwright/test";
import { me, newRoute, openHome, quickAdd, signIn, WEB } from "./helpers";

test("invite a friend by link; routes stay personal", async ({ page, browser }) => {
  await signIn(page, "Owner");
  const groupId = await openHome(page);
  await newRoute(page);
  await quickAdd(page, "Owner's secret spot");

  const inv = await page.request.post(`/api/groups/${groupId}/invites`, { headers: WEB });
  expect(inv.status()).toBe(201);
  const { url } = (await inv.json()) as { url: string };
  const invitePath = new URL(url).pathname;
  expect(invitePath).toMatch(/^\/invite\//);

  // The friend opens the link in their own browser.
  const friendCtx = await browser.newContext({ locale: "en-US" });
  const friend = await friendCtx.newPage();
  await signIn(friend, "Friend");
  await friend.goto(invitePath);
  await expect(friend.getByText("My log")).toBeVisible();
  await friend.getByRole("button", { name: "Join" }).click();
  await expect(friend.getByRole("button", { name: "New route" })).toBeVisible();

  const groups = (await me(friend.request)).groups;
  expect(groups.map((g) => g.id)).toContain(groupId);
  const detail = await (await friend.request.get(`/api/groups/${groupId}`)).json();
  expect(detail.members).toHaveLength(2);

  // Day routes are personal: the friend doesn't see the owner's route.
  await friend.goto(`/group/${groupId}`);
  await expect(friend.getByText("Day routes")).toBeVisible();
  await expect(friend.getByText("Owner's secret spot")).toHaveCount(0);
  const plans = await (await friend.request.get(`/api/groups/${groupId}/plans`)).json();
  expect(plans.plans).toEqual([]);

  // Outsiders can't see the group at all.
  const strangerCtx = await browser.newContext();
  const stranger = await strangerCtx.newPage();
  await signIn(stranger, "Stranger");
  expect((await stranger.request.get(`/api/groups/${groupId}`)).status()).toBe(404);
  await friendCtx.close();
  await strangerCtx.close();
});
