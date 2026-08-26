import { defineConfig, devices } from "@playwright/test";

const e2eMongoUri = process.env.E2E_MONGO_URI ||
  `mongodb://127.0.0.1:27017/phreddit_e2e_${Date.now()}`;
process.env.E2E_MONGO_URI = e2eMongoUri;

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "../server/tests/e2eTeardown.js",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: [
    {
      command: "npm --prefix ../server start",
      url: "http://127.0.0.1:8000/api/health",
      timeout: 120000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        MONGO_URI: e2eMongoUri,
        PORT: "8000",
        SESSION_SECRET: "playwright-test-secret",
        NODE_ENV: "test",
        ENABLE_E2E_RESET: "true",
        ENABLE_CSRF: "true",
        DISABLE_RATE_LIMIT: "true"
      }
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      timeout: 120000,
      reuseExistingServer: false
    }
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
