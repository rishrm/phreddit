import { test, expect } from "@playwright/test";
import { registerAndLogin, resetE2eDatabase } from "./helpers.js";

const API_ORIGIN = "http://127.0.0.1:8000";

test.beforeEach(async ({ request }) => resetE2eDatabase(request));

async function createPost(request, csrfToken, communityId, title) {
  const response = await request.post(`${API_ORIGIN}/api/posts`, {
    headers: { "X-CSRF-Token": csrfToken },
    data: {
      title,
      content: `Cursor pagination content for ${title}.`,
      community: communityId
    }
  });
  expect(response.status(), await response.text()).toBe(201);
}

test("Load more follows the opaque cursor without duplicates during an insert", async ({ page }) => {
  const stamp = Date.now();
  const communityName = `cursorcommunity${stamp}`;
  await registerAndLogin(page, {
    email: `cursor${stamp}@example.com`,
    displayName: `cursor${stamp}`,
    password: "SafePassword123!"
  });

  await page.getByRole("button", { name: /create community/i }).click();
  await page.locator("#communityName").fill(communityName);
  await page.locator("#communityDescription").fill("Cursor pagination browser coverage.");
  await page.getByRole("button", { name: /submit/i }).click();
  await expect(page).toHaveURL(/\/communities\/[a-f0-9]{24}$/);
  const communityId = new URL(page.url()).pathname.split("/").at(-1);

  const csrfResponse = await page.request.get(`${API_ORIGIN}/api/auth/csrf`);
  expect(csrfResponse.ok()).toBe(true);
  const { csrfToken } = await csrfResponse.json();

  for (let index = 1; index <= 21; index += 1) {
    await createPost(
      page.request,
      csrfToken,
      communityId,
      `Cursor Post ${String(index).padStart(2, "0")} ${stamp}`
    );
  }

  await page.goto("/home");
  await expect(page.locator(".post-card")).toHaveCount(20);
  await expect(page.getByRole("button", { name: /load more posts/i })).toBeVisible();

  const insertedTitle = `Inserted After Page One ${stamp}`;
  await createPost(page.request, csrfToken, communityId, insertedTitle);
  const continuationPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/posts" && url.searchParams.has("cursor");
  });
  await page.getByRole("button", { name: /load more posts/i }).click();
  const continuation = await continuationPromise;
  expect(continuation.ok()).toBe(true);
  expect(new URL(continuation.url()).searchParams.has("page")).toBe(false);

  await expect(page.locator(".post-card")).toHaveCount(21);
  await expect(page.getByRole("link", { name: insertedTitle })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /load more posts/i })).toHaveCount(0);

  const ids = await page.locator(".post-card").evaluateAll((cards) => (
    cards.map((card) => card.querySelector("a[href^='/posts/']")?.getAttribute("href"))
  ));
  expect(new Set(ids).size).toBe(21);

  await page.getByRole("button", { name: communityName, exact: true }).click();
  await expect(page.locator(".post-card")).toHaveCount(20);
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await expect(page.getByRole("button", { name: /load more posts/i })).toBeEnabled();
  await page.getByRole("button", { name: /load more posts/i }).click();
  await expect(page.locator(".post-card")).toHaveCount(22);
  await expect(page.locator(".post-count")).toHaveText("Showing 22 of 22 posts");

  const search = page.getByRole("searchbox", { name: /search phreddit/i });
  await search.fill("cursor");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=cursor/);
  await expect(page.locator(".post-card")).toHaveCount(20);
  await page.getByRole("button", { name: "Oldest", exact: true }).click();
  await expect(page.getByRole("button", { name: /load more results/i })).toBeEnabled();
  await page.getByRole("button", { name: /load more results/i }).click();
  await expect(page.locator(".post-card")).toHaveCount(22);
  await expect(page.locator(".post-count")).toHaveText("Showing 22 of 22 posts");
});
