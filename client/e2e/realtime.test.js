import { test, expect } from "@playwright/test";
import { registerAndLogin, resetE2eDatabase } from "./helpers.js";

test.beforeEach(async ({ request }) => resetE2eDatabase(request));

test("a comment appears live in another signed-in browser", async ({ page, browser }) => {
  const stamp = Date.now();
  const password = "SafePassword123!";
  const communityName = `livecommunity${stamp}`;
  const postTitle = `Live post ${stamp}`;
  const liveComment = `Arrived over Socket.IO ${stamp}`;

  await registerAndLogin(page, {
    email: `author${stamp}@example.com`,
    displayName: `author${stamp}`,
    password
  });
  await page.getByRole("button", { name: /create community/i }).click();
  await page.locator("#communityName").fill(communityName);
  await page.locator("#communityDescription").fill("Realtime test community.");
  await page.getByRole("button", { name: /submit/i }).click();
  await page.getByRole("button", { name: /^home$/i }).first().click();
  await page.getByRole("button", { name: /create post/i }).first().click();
  await page.locator("#postTitle").fill(postTitle);
  await page.locator("#postContent").fill("Watch this thread update without a refresh.");
  await page.getByRole("button", { name: /submit/i }).click();
  await page.getByRole("link", { name: postTitle }).click();
  const postUrl = page.url();

  const secondContext = await browser.newContext();
  try {
    const secondPage = await secondContext.newPage();
    await registerAndLogin(secondPage, {
      email: `commenter${stamp}@example.com`,
      displayName: `commenter${stamp}`,
      password
    });
    await secondPage.goto(postUrl);
    await secondPage.getByRole("button", { name: /add a comment/i }).click();
    await secondPage.locator("#commentContent").fill(liveComment);
    await secondPage.getByRole("button", { name: /submit comment/i }).click();

    await expect(page.getByText(liveComment)).toBeVisible({ timeout: 15000 });
  } finally {
    await secondContext.close();
  }
});
