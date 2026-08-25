import { test, expect } from "@playwright/test";
import { resetE2eDatabase } from "./helpers.js";

test.beforeEach(async ({ request }) => resetE2eDatabase(request));

test("user can register, log in, and create a community", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e${stamp}@example.com`;
  const displayName = `e2euser${stamp}`;
  const communityName = `e2ecommunity${stamp}`;
  const password = "SafePassword123!";

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /welcome to phreddit/i })
  ).toBeVisible();

  await page.getByRole("button", { name: /register/i }).click();

  await expect(page.getByRole("heading", { name: /sign up/i })).toBeVisible();

  await page.locator("#firstName").fill("Test");
  await page.locator("#lastName").fill("User");
  await page.locator("#email").fill(email);
  await page.locator("#displayName").fill(displayName);
  await page.locator("#password").fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.getByRole("button", { name: /sign up/i }).click();

  await expect(
    page.getByRole("heading", { name: /welcome to phreddit/i })
  ).toBeVisible();

  await page.getByRole("button", { name: /login/i }).click();
  await expect(page.getByRole("heading", { name: /^login$/i })).toBeVisible();

  await page.locator("#loginEmail").fill(email);
  await page.locator("#loginPassword").fill(password);
  await page.getByRole("button", { name: /^login$/i }).click();

  await expect(page.getByRole("heading", { name: /all posts/i })).toBeVisible();

  await page.getByRole("button", { name: /create community/i }).click();

  await expect(
    page.getByRole("heading", { name: /new community/i })
  ).toBeVisible();

  await page.locator("#communityName").fill(communityName);
  await page.locator("#communityDescription").fill("Community created by Playwright test.");
  await page.getByRole("button", { name: /submit/i }).click();

  // Creating a community lands on the new community's page and it also
  // appears in the sidebar.
  await expect(page.getByRole("heading", { name: communityName })).toBeVisible();
  await expect(page.locator(".sidebar")).toContainText(communityName);
});
