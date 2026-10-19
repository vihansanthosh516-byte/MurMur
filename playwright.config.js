import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  workers: 1,
  use: { channel: "msedge", baseURL: "http://127.0.0.1:1420", headless: true },
  webServer: { command: "npm run dev -- --host 127.0.0.1", url: "http://127.0.0.1:1420", reuseExistingServer: false, timeout: 60000 },
});
