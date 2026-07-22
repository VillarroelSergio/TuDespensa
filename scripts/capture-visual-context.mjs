import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'
const outputDir = resolve('docs/00-Project/visual-context')
// DEMO=1 sirve fixtures sintéticos y guarda las capturas con sufijo `-poblado`,
// para tener la matriz de estados (vacío por defecto, poblado bajo demanda).
const demo = process.env.DEMO === '1'
let server

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 },
]

const views = [
  { name: 'acceso', path: '/login' },
  { name: 'onboarding', path: '/onboarding' },
  { name: 'despensa', path: '/despensa' },
  { name: 'despensa-anadir', path: '/despensa', button: '+ Añadir producto' },
  { name: 'compra', path: '/compra' },
  { name: 'compra-revisar', path: '/compra/revisar' },
  { name: 'compra-ticket', path: '/compra/ticket' },
  { name: 'recetas', path: '/recetas' },
  { name: 'recetas-anadir', path: '/recetas', button: 'Añadir receta' },
  { name: 'plan', path: '/plan' },
  { name: 'plan-elegir', path: '/plan/elegir?fecha=2026-07-20&servicio=lunch' },
]

async function applicationIsReady() {
  try {
    const response = await fetch(baseUrl)
    return response.status < 500
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

if (!(await applicationIsReady())) {
  // shell:true is required on Windows: since Node 24, spawning npm.cmd directly
  // throws EINVAL. The shell resolves npm on every platform.
  server = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    windowsHide: true,
    shell: true,
    // Force the dev auth bypass on: these captures are the no-login empty states.
    // A leftover .env.local from an E2E run would otherwise send /despensa to /login.
    env: {
      ...process.env,
      NEXT_PUBLIC_E2E_AUTH_ENABLED: 'false',
      NEXT_PUBLIC_DEMO_FIXTURES: demo ? 'true' : 'false',
    },
  })
}

try {
  await mkdir(outputDir, { recursive: true })
  await waitForApplication()
  const browser = await chromium.launch()

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport })
      // En demo solo interesan las vistas con datos; acceso/onboarding no cambian.
      const dataViews = new Set([
        'despensa', 'despensa-anadir', 'compra', 'compra-revisar',
        'recetas', 'recetas-anadir', 'plan', 'plan-elegir',
      ])
      for (const view of views) {
        if (demo && !dataViews.has(view.name)) continue
        const name = `${view.name}-${viewport.name}${demo ? '-poblado' : ''}`
        await page.goto(`${baseUrl}${view.path}`, { waitUntil: 'domcontentloaded' })
        if (view.button) await page.getByRole('button', { name: view.button }).click()

        const body = page.locator('body')
        const snapshot = typeof body.ariaSnapshot === 'function'
          ? await body.ariaSnapshot()
          : await body.innerText()
        await writeFile(resolve(outputDir, `${name}.snapshot.txt`), snapshot, 'utf8')
        await page.screenshot({ path: resolve(outputDir, `${name}.png`), fullPage: true })
        console.log(`✓ ${name}`)
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
} finally {
  if (server) server.kill()
}

console.log(`Contexto visual actualizado en ${outputDir}`)
