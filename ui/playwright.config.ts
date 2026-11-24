import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

// End-to-end test of the model-configuration and replay screens against `nuxt dev`, with a throwaway
// logs DB / model-configs DB and a stub of the whatsap bot's POST /api/replay (see tests/e2e/global-setup.ts).
// Uses the machine's installed Chrome (no browser download): run with `npm run test:e2e`.
export const E2E_DIR = path.join(os.tmpdir(), 'agents-voice-ui-e2e')
export const STUB_BOT_PORT = 4101
const PORT = 3100

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 20_000 }, // nuxt dev compiles each page on first visit
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}`, channel: 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: `npx nuxt dev --port ${PORT}`,
    url: `http://localhost:${PORT}/models`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      NUXT_AGENT_LOGS_DB: path.join(E2E_DIR, 'agent-logs.db'),
      NUXT_MODEL_CONFIGS_DB: path.join(E2E_DIR, 'model-configs.db'),
      NUXT_WHATSAP_API_URL: `http://127.0.0.1:${STUB_BOT_PORT}`,
    },
  },
})
