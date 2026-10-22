import { expect, test } from "@playwright/test";

test("homepage is accessible", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);

  await expect(page.locator("body")).toBeVisible();
});
