import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
nextEnv.loadEnvConfig(projectRoot)

const port = Number(process.env.E2E_PORT ?? 3002)
const baseUrl = `http://127.0.0.1:${port}`

async function applicationIsReady() {
  try {
    return (await fetch(baseUrl)).status < 500
  } catch {
    return false
  }
}

async function waitForApplication() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await applicationIsReady()) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('La aplicación no ha arrancado en un minuto.')
}

// La auditoría UX necesita fixtures deterministas (ver src/lib/dev/demo-fixtures.ts),
// así que arranca su propio servidor en vez de reutilizar el webServer de
// playwright.config.ts, que sirve datos vacíos sin sesión.
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--port', String(port)],
  {
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_E2E_AUTH_ENABLED: 'false',
      NEXT_PUBLIC_DEMO_FIXTURES: 'true',
    },
  },
)

try {
  await waitForApplication()
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
      ),
      'test',
      'e2e/founder-ux-audit.spec.ts',
      ...process.argv.slice(2),
    ],
    {
      env: { ...process.env, E2E_BASE_URL: baseUrl },
      stdio: 'inherit',
    },
  )
  const code = await new Promise((resolveExit) => {
    child.on('exit', (code, signal) => resolveExit(signal ? 1 : (code ?? 1)))
  })
  process.exit(code)
} finally {
  server.kill()
}
