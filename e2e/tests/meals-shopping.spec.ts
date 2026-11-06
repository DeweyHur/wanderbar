import { expect, test } from "@playwright/test";
import { newRoute, openHome, signIn, WEB } from "./helpers";

test("a day at home: lunch and dinner, shopping for a meal, and the group's shopping list", async ({ page }) => {
  await signIn(page, "Chef");
  const groupId = await openHome(page);
  await page.request.post(`/api/groups/${groupId}/dishes`, { headers: WEB, data: { name: "Kimchi stew" } });

  await newRoute(page, "Tomorrow");
  await expect(page.getByTestId("meal-planner")).toHaveCount(0);
  await page.getByRole("button", { name: "At home" }).click();
  const lunch = page.getByTestId("meal-lunch");
  const dinner = page.getByTestId("meal-dinner");
  await expect(dinner).toContainText("Nothing planned yet.");

  // Dinner: tap one of the group's dishes. Lunch: type anything.
  await dinner.getByRole("button", { name: "Kimchi stew" }).click();
  await expect(dinner.getByTestId("meal-row")).toContainText("Kimchi stew");
  await lunch.getByPlaceholder("What's for lunch?").fill("Sandwiches");
  await lunch.getByPlaceholder("What's for lunch?").press("Enter");
  await expect(lunch.getByTestId("meal-row")).toContainText("Sandwiches");

  // What to buy for dinner, under the meal.
  await dinner.getByRole("button", { name: "Shopping" }).click();
  const shopInput = dinner.getByPlaceholder("Tofu, green onion, eggs");
  await shopInput.fill("Tofu, Green onion");
  await shopInput.press("Enter");
  await expect(dinner.getByTestId("shopping-row")).toHaveCount(2);
  await expect(dinner.getByRole("button", { name: "2 to buy" })).toBeVisible();

  // The route list marks it as a day at home; the shopping tab has the items, labelled with the meal.
  await page.goBack();
  await expect(page.getByTestId("route-card").filter({ visible: true }).first()).toContainText("🏠");
  await page.getByRole("button", { name: "Shopping", exact: true }).click();
  const list = page.getByTestId("shopping-list").filter({ visible: true });
  await expect(list.getByTestId("shopping-row")).toHaveCount(2);
  await expect(list.getByTestId("shopping-row").first()).toContainText("Tofu");
  await expect(list.getByTestId("shopping-row").first()).toContainText("for Tomorrow · Dinner · Kimchi stew");

  // Something not for any meal, and something for a dish.
  await list.getByPlaceholder("Tofu, green onion, eggs").fill("Milk");
  await list.getByRole("button", { name: "Add to list" }).click();
  await expect(list.getByTestId("shopping-row")).toHaveCount(3);
  await expect(list.getByTestId("shopping-row").nth(2)).not.toContainText("for ");
  await list.getByRole("button", { name: "For a dish…" }).click();
  await list.getByTestId("dish-choices").getByRole("button", { name: "Kimchi stew" }).click();
  await list.getByPlaceholder("Tofu, green onion, eggs").fill("Gochugaru");
  await list.getByRole("button", { name: "Add to list" }).click();
  await expect(list.getByTestId("shopping-row").nth(3)).toContainText("for Kimchi stew");

  // Check off: it moves to "Bought"; clearing removes it.
  await list.getByRole("checkbox", { name: "Milk" }).click();
  await expect(list.getByText("Bought (1)")).toBeVisible();
  await expect(list.getByRole("checkbox", { name: "Milk" })).toBeChecked();
  await list.getByRole("button", { name: "Clear bought" }).click();
  await expect(list.getByText("Milk")).toHaveCount(0);
  await expect(list.getByTestId("shopping-row")).toHaveCount(3);

  // Back on the route: removing dinner drops what was still to buy for it.
  await page.getByRole("button", { name: "Day routes", exact: true }).click();
  await page.getByTestId("route-card").filter({ visible: true }).first().click();
  await expect(dinner.getByTestId("shopping-row")).toHaveCount(2);
  await dinner.getByRole("button", { name: "Remove Kimchi stew" }).click();
  await expect(dinner).toContainText("Nothing planned yet.");
  const { items } = await (await page.request.get(`/api/groups/${groupId}/shopping`)).json();
  expect(items.map((i: { name: string }) => i.name)).toEqual(["Gochugaru"]);
});
