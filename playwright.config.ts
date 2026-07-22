import { defineConfig } from '@playwright/test'

const authE2E = process.env.E2E_AUTH_ENABLED === 'true'
const e2ePort = Number(process.env.E2E_PORT ?? 3001)
const localE2EUrl = `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.E2E_BASE_URL ?? localE2EUrl },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Invoke Next directly: killing an npm shell on Windows can leave its
        // child server listening on the E2E port after a failed test run.
        command: `"${process.execPath}" node_modules/next/dist/bin/next dev --port ${e2ePort}`,
        url: localE2EUrl,
        reuseExistingServer: !authE2E,
        env: {
          ...process.env,
          NEXT_PUBLIC_E2E_AUTH_ENABLED: authE2E ? 'true' : 'false',
        },
      },
})
