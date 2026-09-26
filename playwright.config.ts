import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4189";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { ...devices["Desktop Chrome"], channel: "chromium", baseURL, viewport: { width: 1440, height: 900 }, acceptDownloads: true },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npx next dev -p 4189 -H 127.0.0.1",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  reporter: "list",
});
