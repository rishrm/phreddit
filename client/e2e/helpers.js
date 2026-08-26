import { expect } from "@playwright/test";

const API_ORIGIN = "http://127.0.0.1:8000";

export async function resetE2eDatabase(request) {
  const health = await request.get(`${API_ORIGIN}/api/health`);
  expect(health.ok()).toBe(true);
  const healthBody = await health.json();
  expect(healthBody.database).toMatch(/^phreddit_e2e(?:_|$)/);

  const csrf = await request.get(`${API_ORIGIN}/api/auth/csrf`);
  expect(csrf.ok()).toBe(true);
  const { csrfToken } = await csrf.json();
  expect(csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const reset = await request.post(`${API_ORIGIN}/api/test/reset`, {
    headers: { "X-CSRF-Token": csrfToken }
  });
  expect(reset.ok()).toBe(true);
}

export async function registerAndLogin(page, { email, displayName, password }) {
  await page.goto("/");
  await page.getByRole("button", { name: /register/i }).click();
  await page.locator("#firstName").fill("Test");
  await page.locator("#lastName").fill("User");
  await page.locator("#email").fill(email);
  await page.locator("#displayName").fill(displayName);
  await page.locator("#password").fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.getByRole("button", { name: /sign up/i }).click();
  await expect(page.getByRole("heading", { name: /welcome to phreddit/i })).toBeVisible();

  await page.getByRole("button", { name: /login/i }).click();
  await page.locator("#loginEmail").fill(email);
  await page.locator("#loginPassword").fill(password);
  await page.getByRole("button", { name: /^login$/i }).click();
  await expect(page.getByRole("heading", { name: /all posts/i })).toBeVisible();
}
