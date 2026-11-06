import { expect, test } from "@playwright/test";
import { signIn, WEB } from "./helpers";

test("group chat: two members talk, unread badge, delete your own", async ({ page, browser }) => {
  await signIn(page, "Host");
  const bg = (await (
    await page.request.post("/api/groups", { headers: WEB, data: { name: "Chatty Gamers", module: "boardgame", timezone: "America/Los_Angeles" } })
  ).json()) as { id: string };
  const { url } = await (await page.request.post(`/api/groups/${bg.id}/invites`, { headers: WEB })).json();
  const friend = await (await browser.newContext({ locale: "en-US" })).newPage();
  await signIn(friend, "Pal");
  await friend.goto(new URL(url).pathname);
  await friend.getByRole("button", { name: "Join" }).click();
  await expect(friend.getByRole("button", { name: "Next night", exact: true }).filter({ visible: true })).toBeVisible();

  // The host opens the chat from the group bar and says hi (Enter sends on the web).
  await page.goto(`/group/${bg.id}`);
  await page.getByTestId("chat-button").filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/group/${bg.id}/chat$`));
  await expect(page.getByText("No messages yet. Say hi!").filter({ visible: true })).toBeVisible();
  const box = page.getByLabel("Message").filter({ visible: true });
  await box.fill("Who's bringing Brass?");
  await box.press("Enter");
  await expect(page.getByTestId("chat-message").filter({ visible: true })).toHaveText(["Who's bringing Brass?"]);
  await expect(box).toHaveValue("");

  // The friend sees a badge, opens the chat, and replies.
  await friend.reload();
  await expect(friend.getByTestId("chat-unread").filter({ visible: true })).toHaveText("1");
  await friend.getByTestId("chat-button").filter({ visible: true }).click();
  await expect(friend.getByTestId("chat-message").filter({ visible: true })).toHaveText(["Who's bringing Brass?"]);
  await expect(friend.getByText("Host", { exact: true }).filter({ visible: true })).toBeVisible();
  await friend.getByLabel("Message").filter({ visible: true }).fill("Me! And snacks");
  await friend.getByRole("button", { name: "Send", exact: true }).filter({ visible: true }).click();

  // It shows up on the host's open chat without reloading.
  await expect(page.getByTestId("chat-message").filter({ visible: true })).toHaveText(["Who's bringing Brass?", "Me! And snacks"], { timeout: 10_000 });

  // Back on the group home, the friend's badge is gone.
  await friend.goto(`/group/${bg.id}`);
  await expect(friend.getByTestId("chat-button").filter({ visible: true })).toBeVisible();
  await expect(friend.getByTestId("chat-unread")).toHaveCount(0);

  // The friend deletes their message (long-press; the web asks to confirm).
  await friend.goto(`/group/${bg.id}/chat`);
  friend.once("dialog", (d) => d.accept());
  const mine = friend.getByTestId("chat-message").filter({ visible: true }).filter({ hasText: "Me! And snacks" });
  await mine.hover();
  await friend.mouse.down();
  await friend.waitForTimeout(700);
  await friend.mouse.up();
  await expect(friend.getByTestId("chat-message").filter({ visible: true })).toHaveText(["Who's bringing Brass?", "Message deleted"]);
});
