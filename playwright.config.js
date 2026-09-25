// E2E(ペルソナ台本の手順 = tests/e2e/scenarios/{persona}-{手順}.spec.js)。server は worker ごとに tests/e2e/servers.js が用意する。
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  outputDir: 'test-results/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: { headless: true, acceptDownloads: true, viewport: { width: 1400, height: 900 } },
  projects: [
    { name: 'scenarios', testDir: 'tests/e2e/scenarios', testMatch: /.*\.spec\.js$/, use: { browserName: 'chromium' } },
  ],
});
