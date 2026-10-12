import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3100",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
    trace: "retain-on-failure",
  },
  webServer: [
    { command: "npx tsx tests/browser/mock-supabase.ts", url: "http://127.0.0.1:54329/health", reuseExistingServer: false },
    {
      command: "npm run dev -- --port 3100 --hostname 127.0.0.1",
      url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120_000,
      env: {
        // These subprocesses never use injected production credentials.
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "browser-test-public-key",
        SUPABASE_SECRET_KEY: "browser-test-server-key",
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
