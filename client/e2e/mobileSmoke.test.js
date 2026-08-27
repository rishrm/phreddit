import { test, expect } from "@playwright/test";
import { resetE2eDatabase } from "./helpers.js";

test.beforeEach(async ({ request }) => resetE2eDatabase(request));

test("guest navigation stays usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /continue as guest/i }).click();

  await expect(page.getByRole("heading", { name: /all posts/i })).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.getByRole("button", { name: /create community/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^create post$/i }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: /^guest$/i })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: /skip to content/i });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});
