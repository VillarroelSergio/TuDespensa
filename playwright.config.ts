import { loadEnvConfig } from '@next/env'
import { defineConfig } from '@playwright/test'

// Playwright also needs the public Supabase variables to exercise the browser
// flow. Next.js loads `.env.local` for the dev server, but the test runner does
// not unless we load it here as well. The file remains untracked.
loadEnvConfig(process.cwd())

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
      },
})
