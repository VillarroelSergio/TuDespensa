import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'

import { freeE2EPort } from './free-e2e-port.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

// Playwright runs outside Next.js, so it needs the local Supabase credentials
// loaded explicitly before the test worker and its web server are spawned.
// NODE_ENV=test makes Next.js skip .env.local (Vercel's remote project
// credentials) and read .env.test.local (local Supabase) instead.
process.env.NODE_ENV = 'test'
nextEnv.loadEnvConfig(projectRoot)

// El alta de la primera cuenta exige código de arranque; el arnés se da uno
// para no depender de que esté en .env.test.local (auditoría 2026-07-29).
process.env.PILOT_BOOTSTRAP_CODE ??= 'E2E-BOOTSTRAP'

if (!process.env.E2E_BASE_URL)
  freeE2EPort(Number(process.env.E2E_PORT ?? 3001))

const args = process.argv.slice(2)
// El primer argumento posicional (sin `-`) elige el spec; el resto son flags de Playwright.
const spec =
  args[0] && !args[0].startsWith('-')
    ? args.shift()
    : 'e2e/onboarding-two-sessions.spec.ts'

const child = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
    ),
    'test',
    spec,
    ...args,
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
