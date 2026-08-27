import { test, expect } from "@playwright/test";
import { registerAndLogin, resetE2eDatabase } from "./helpers.js";

const navigationTimeout = 15000;

test.beforeEach(async ({ request }) => resetE2eDatabase(request));

async function createCommunity(page, communityName, description = "Community created by a Playwright smoke test.") {
  await page.getByRole("button", { name: /create community/i }).click();
  await page.locator("#communityName").fill(communityName);
  await page.locator("#communityDescription").fill(description);
  await page.getByRole("button", { name: /submit/i }).click();

  // Creating a community lands on the new community page.
  await expect(page).toHaveURL(/\/communities\//, { timeout: navigationTimeout });
  await expect(page.getByRole("heading", { name: communityName })).toBeVisible({
    timeout: navigationTimeout
  });
  await page.getByRole("button", { name: /^home$/i }).first().click();
  await expect(page.getByRole("heading", { name: /all posts/i })).toBeVisible();
}

async function createPost(page, { title, content, flair }) {
  await page.getByRole("button", { name: /create post/i }).first().click();
  await page.locator("#postTitle").fill(title);
  await page.locator("#postContent").fill(content);
  if (flair) {
    await page.locator("#postNewFlair").fill(flair);
  }
  await page.getByRole("button", { name: /submit/i }).click();

  await expect(page.getByRole("heading", { name: /all posts/i })).toBeVisible({
    timeout: navigationTimeout
  });
  await expect(page.getByRole("link", { name: title })).toBeVisible();
}

test("core flows: content creation, self-vote gate, sorting, profile, and two-user vote toggling", async ({ page }) => {
  const stamp = Date.now();
  const password = "SafePassword123!";
  const authorEmail = `core${stamp}@example.com`;
  const authorName = `signal${String(stamp).slice(-6)}`;
  const voterEmail = `voter${stamp}@example.com`;
  const voterName = `voter${stamp}`;
  const communityName = `corecommunity${stamp}`;
  const flair = `${authorName} topic`;
  const activeTitle = `Active Thread ${stamp}`;
  const quietTitle = `Quiet Thread ${stamp}`;
  const editedTitle = `Edited Thread ${stamp}`;
  const commentText = `Activity comment ${stamp}`;

  // --- User A: author ---
  await registerAndLogin(page, { email: authorEmail, displayName: authorName, password });
  await createCommunity(
    page,
    communityName,
    `A community for ${authorName} discovery and Playwright smoke tests.`
  );
  await createPost(page, {
    title: activeTitle,
    content: `This ${authorName} post will receive comments and votes.`,
    flair
  });
  await createPost(page, {
    title: quietTitle,
    content: "This post should stay below active threads."
  });

  // Unified discovery returns posts/comments plus safe community, user, and
  // flair matches from one search interaction.
  const search = page.getByRole("searchbox", { name: /search phreddit/i });
  await search.fill(authorName);
  await search.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${authorName}`));
  await expect(page.getByRole("link", { name: communityName })).toBeVisible();
  await expect(page.getByRole("link", { name: authorName })).toBeVisible();
  await expect(page.getByRole("button", { name: flair })).toBeVisible();
  await expect(page.getByRole("link", { name: activeTitle })).toBeVisible();
  await page.getByRole("button", { name: /^home$/i }).first().click();

  // Authors can focus the vote control and hear why it is unavailable.
  await page.getByRole("link", { name: activeTitle }).click();
  await expect(page.getByRole("heading", { name: activeTitle })).toBeVisible();
  const ownUpvote = page.getByRole("button", { name: /upvote/i });
  await expect(ownUpvote).toHaveAttribute("aria-disabled", "true");
  await expect(ownUpvote).toHaveAccessibleDescription(/own post/i);

  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByRole("button", { name: /^saved$/i })).toBeVisible();
  await page.getByRole("button", { name: /add a comment/i }).click();
  await expect(page.getByRole("heading", { name: /new comment/i })).toBeVisible();
  await page.locator("#commentContent").fill(commentText);
  await page.getByRole("button", { name: /submit comment/i }).click();
  await expect(page.getByText(commentText)).toBeVisible();

  // Flair filtering and Active sort on Home.
  await page.getByRole("button", { name: /back home/i }).click();
  await page.locator("#homeFlair").selectOption({ label: flair });
  await expect(page.getByRole("link", { name: activeTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: quietTitle })).toHaveCount(0);
  await page.getByRole("button", { name: /clear/i }).click();
  await page.getByRole("button", { name: "Active", exact: true }).click();

  const titles = await page.locator(".post-card h3").allTextContents();
  expect(titles[0]).toContain(activeTitle);

  // Profile: edit the post title, check saved posts, then delete the comment
  // through the in-app confirm dialog (window.confirm was replaced).
  await page.getByRole("button", { name: authorName }).click();
  const postRow = page.locator(".row-card").filter({ hasText: activeTitle });
  await postRow.getByRole("button", { name: /edit/i }).click();
  await page.locator('input[name="title"]').fill(editedTitle);
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.locator(".row-card").filter({ hasText: editedTitle })).toBeVisible();

  await page.getByRole("tab", { name: /saved/i }).click();
  await expect(page.locator(".row-card").filter({ hasText: editedTitle })).toBeVisible();

  await page.getByRole("tab", { name: /comments/i }).click();
  const commentRow = page.locator(".row-card").filter({ hasText: commentText.slice(0, 20) });
  await expect(commentRow).toBeVisible();
  await commentRow.getByRole("button", { name: /delete/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^confirm$/i }).click();
  await expect(page.getByText("No comments yet.")).toBeVisible();

  // --- User B: voter ---
  await page.getByRole("button", { name: /logout/i }).click();
  await expect(page.getByRole("heading", { name: /welcome to phreddit/i })).toBeVisible();
  await registerAndLogin(page, { email: voterEmail, displayName: voterName, password });

  await page.getByRole("link", { name: editedTitle }).click();
  await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible();

  const upvote = page.getByRole("button", { name: /upvote/i });
  const downvote = page.getByRole("button", { name: /downvote/i });
  await expect(upvote).toBeEnabled();
  await expect(upvote).toHaveAttribute("aria-disabled", "false");

  // Add a vote.
  await upvote.click();
  await expect(upvote).toContainText("· 1");
  await expect(upvote).toHaveAttribute("aria-pressed", "true");

  // Same vote again removes it (toggle off).
  await upvote.click();
  await expect(upvote).toContainText("· 0");
  await expect(upvote).toHaveAttribute("aria-pressed", "false");

  // Downvote, then switch back to an upvote.
  await downvote.click();
  await expect(downvote).toContainText("· 1");
  await upvote.click();
  await expect(upvote).toContainText("· 1");
  await expect(downvote).toContainText("· 0");
});
