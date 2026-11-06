import { expect, test, type Page } from "@playwright/test";
import { me, openHome, signIn, WEB } from "./helpers";

const visible = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true });
const field = (page: Page, label: string) => page.getByRole("textbox", { name: label, exact: true }).filter({ visible: true });

/** Creates a board game group from the UI and leaves its home open; returns its id. */
async function newBoardGameGroup(page: Page, name: string) {
  await openHome(page);
  await page.goto("/group/new");
  await button(page, "Board game night").click();
  await field(page, "Group name").fill(name);
  await button(page, "Create group").click();
  await expect(button(page, "Next night")).toBeVisible();
  const g = (await me(page.request)).groups.find((x) => x.name === name);
  expect(g?.module).toBe("boardgame");
  return g!.id;
}

test("board game night: regular meetup, who picks, games with links, the queue", async ({ page, context }) => {
  // Link chips open the real sites; answer them locally.
  await context.route(/boardgamegeek\.com|example\.com|youtube\.com/, (r) => r.fulfill({ body: "<html><title>ok</title></html>", contentType: "text/html" }));
  await signIn(page, "Host");
  await newBoardGameGroup(page, "Saturday Board Games");
  await expect(page.getByText("No regular meetup yet.", { exact: false })).toBeVisible();

  // Weekly on Saturday at 7 pm, at Ben's place.
  await button(page, "Set up a regular meetup").click();
  // With no meetup yet, the form is already open.
  const form = visible(page, "series-form");
  await form.getByRole("button", { name: "Saturday", exact: true }).click();
  await form.getByRole("textbox", { name: "Time", exact: true }).fill("19:00");
  await form.getByRole("button", { name: "Every week", exact: true }).click();
  await form.getByRole("textbox", { name: "Where", exact: true }).fill("Ben's place");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved. The next night is on the calendar.")).toBeVisible();
  await expect(visible(page, "series-card")).toContainText("Every week on Saturday at 7:00 PM");
  await page.goBack();

  const next = visible(page, "night-card").first();
  await expect(next).toContainText("Sat");
  await expect(next).toContainText("7:00 PM");
  await expect(next).toContainText("Ben's place");
  await expect(next).toContainText("Nobody's picking yet");

  // I'll pick, then add a new game from its BGG link (the name fills itself in) with its other links.
  await next.click();
  await button(page, "I'll pick").click();
  await expect(page.getByText("Host picks").filter({ visible: true })).toBeVisible();
  await button(page, "New game").click();
  // Typed key by key (not pasted), the name still ends up as the whole game name.
  await field(page, "BoardGameGeek link").pressSequentially("https://boardgamegeek.com/boardgame/295947/cascadia", { delay: 15 });
  await expect(field(page, "Name")).toHaveValue("Cascadia");
  await field(page, "Tabletop Simulator link").fill("https://steamcommunity.com/sharedfiles/filedetails/?id=2312");
  await field(page, "Rulebook link").fill("https://example.com/cascadia-rules.pdf");
  await field(page, "Video rules link").fill("https://www.youtube.com/watch?v=cascadia");
  await field(page, "Tags").fill("family, tile laying");
  await button(page, "Save").click();

  const lineup = visible(page, "lineup-card");
  await expect(lineup).toHaveCount(1);
  await expect(lineup).toContainText("Cascadia");
  for (const chip of ["BGG", "TTS", "Rulebook", "Video rules"]) await expect(lineup.getByRole("button", { name: chip, exact: true })).toBeVisible();
  const popup = page.waitForEvent("popup");
  await lineup.getByRole("button", { name: "Rulebook", exact: true }).click();
  await expect.poll(async () => (await popup).url()).toBe("https://example.com/cascadia-rules.pdf");
  await (await popup).close();

  // Someone wants Brass: queue it, then the picker adds it from the queue.
  await page.goBack();
  await button(page, "Games").click();
  await button(page, "Add a game").click();
  await field(page, "Name").fill("Brass: Birmingham");
  await field(page, "Tags").fill("heavy");
  await button(page, "Save").click();
  await expect(visible(page, "game-info")).toContainText("Brass: Birmingham");
  await button(page, "Queue it").click();
  await expect(page.getByText("Wanted by Host").filter({ visible: true })).toBeVisible();
  await page.goBack();
  await button(page, "Next night").click();
  const queued = visible(page, "queue-card");
  await expect(queued).toHaveCount(1);
  await expect(queued).toContainText("Brass: Birmingham");
  await queued.getByRole("button", { name: "Add to next night" }).click();
  await expect(queued).toHaveCount(0);
  await expect(visible(page, "night-card").first()).toContainText("Brass: Birmingham");
  await expect(visible(page, "night-card").first()).toContainText("Cascadia");
});

test("rate games out of 10 after a night; leaderboard by rating and by tag; friends can't change the lineup", async ({ page, browser }) => {
  await signIn(page, "Organizer");
  const groupId = await newBoardGameGroup(page, "Game Club");
  const game = async (name: string, tags: string[]) =>
    (await (await page.request.post(`/api/groups/${groupId}/games`, { headers: WEB, data: { name, tags } })).json()) as { id: string };
  const brass = await game("Brass", ["heavy"]);
  const codenames = await game("Codenames", ["party"]);
  await game("Azul", ["family"]);

  // A one-off night last week, from the schedule screen.
  await page.goto(`/meetup/schedule?groupId=${groupId}`);
  const oneOff = visible(page, "one-off-form");
  await oneOff.getByRole("textbox", { name: "Date (YYYY-MM-DD)" }).fill("2026-10-31");
  await oneOff.getByRole("textbox", { name: "Time" }).fill("18:00");
  await button(page, "Create night").click();
  await expect(visible(page, "night-info")).toContainText("Played");
  await expect(visible(page, "night-info")).toContainText("Oct 31");

  // Add the games played from the library, then rate them.
  const lineup = visible(page, "lineup-card");
  for (const [i, name] of ["Brass", "Codenames"].entries()) {
    await field(page, "From the games").fill(name.slice(0, 4));
    await button(page, name).click();
    await expect(lineup).toHaveCount(i + 1);
  }
  const brassCard = lineup.filter({ hasText: "Brass" });
  await brassCard.getByRole("button", { name: "9 out of 10" }).click();
  await brassCard.getByRole("textbox", { name: "Comment" }).fill("Tense canal era");
  await brassCard.getByRole("button", { name: "Save rating" }).click();
  await expect(brassCard).toContainText("Rating saved");
  await expect(brassCard).toContainText("9/10 (1)");
  const codeCard = lineup.filter({ hasText: "Codenames" });
  await codeCard.getByRole("button", { name: "6 out of 10" }).click();
  await codeCard.getByRole("button", { name: "Save rating" }).click();
  await expect(codeCard).toContainText("6/10 (1)");

  // A friend joins: sees the history and rates Codenames higher, but can't change another night's picks.
  const { url } = await (await page.request.post(`/api/groups/${groupId}/invites`, { headers: WEB })).json();
  const friend = await (await browser.newContext({ locale: "en-US", timezoneId: "America/Los_Angeles" })).newPage();
  await signIn(friend, "Friend");
  await friend.goto(new URL(url).pathname);
  await friend.getByRole("button", { name: "Join" }).click();
  await expect(button(friend, "Next night")).toBeVisible();
  await button(friend, "History").click();
  await visible(friend, "night-card").first().click();
  const fCode = visible(friend, "lineup-card").filter({ hasText: "Codenames" });
  await fCode.getByRole("button", { name: "10 out of 10" }).click();
  await fCode.getByRole("textbox", { name: "Comment" }).fill("Best with 6+");
  await fCode.getByRole("button", { name: "Save rating" }).click();
  await expect(fCode).toContainText("8/10 (2)");

  const upcoming = (await (
    await page.request.post(`/api/groups/${groupId}/nights`, { headers: WEB, data: { date: "2030-01-05", time: "19:00" } })
  ).json()) as { id: string };
  await page.request.patch(`/api/nights/${upcoming.id}`, { headers: WEB, data: { pickerId: (await me(page.request)).user.id } });
  await friend.goto(`/night/${upcoming.id}`);
  await expect(friend.getByText("Organizer is picking this time.", { exact: false }).filter({ visible: true })).toBeVisible();
  await expect(button(friend, "New game")).toHaveCount(0);
  expect((await friend.request.post(`/api/nights/${upcoming.id}/games`, { headers: WEB, data: { gameId: brass.id } })).status()).toBe(403);

  // Leaderboard: all-time by average, then only #party games, then by plays.
  await page.goto(`/group/${groupId}`);
  await button(page, "Leaderboard").click();
  const rows = visible(page, "rank-row");
  await expect(rows).toHaveCount(2); // Azul isn't rated
  await expect(rows.nth(0)).toContainText("Brass");
  await expect(rows.nth(0)).toContainText("9");
  await expect(rows.nth(1)).toContainText("Codenames");
  await expect(rows.nth(1)).toContainText("8");
  await button(page, "#party").click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Codenames");
  await button(page, "#family").click();
  await expect(page.getByText("No rated games with this tag yet.").filter({ visible: true })).toBeVisible();
  await button(page, "All").click();
  await button(page, "Most played").click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("1×");

  // The game page shows everyone's comments.
  await rows.filter({ hasText: "Codenames" }).click();
  await expect(visible(page, "game-info")).toContainText("8/10 (2)");
  await expect(visible(page, "game-info")).toContainText("Played once");
  await expect(visible(page, "game-review")).toContainText("Best with 6+");
  void codenames;
});
