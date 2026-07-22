import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

// Playwright runs outside Next.js, so it needs the local Supabase credentials
// loaded explicitly before the test worker and its web server are spawned.
nextEnv.loadEnvConfig(projectRoot)

const child = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
    ),
    'test',
    'e2e/onboarding-two-sessions.spec.ts',
    ...process.argv.slice(2),
  ],
  {
    env: { ...process.env, E2E_AUTH_ENABLED: 'true' },
    stdio: 'inherit',
  },
)

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
