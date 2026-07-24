import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const visualContextPort = process.env.VISUAL_CONTEXT_PORT ?? '3011'
const baseUrl =
  process.env.E2E_BASE_URL ?? `http://127.0.0.1:${visualContextPort}`
const outputDir = resolve('docs/00-Project/visual-context')
let server

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 },
]

const views = [
  { name: 'acceso', path: '/login' },
  { name: 'onboarding', path: '/onboarding', fixture: 'empty' },
  { name: 'despensa', path: '/despensa', fixture: 'empty' },
  {
    name: 'despensa-anadir',
    path: '/despensa',
    button: '+ Añadir producto',
    fixture: 'empty',
  },
  { name: 'compra', path: '/compra', fixture: 'empty' },
  { name: 'compra-revisar', path: '/compra/revisar', fixture: 'empty' },
  { name: 'compra-ticket', path: '/compra/ticket', fixture: 'empty' },
  { name: 'recetas', path: '/recetas', fixture: 'empty' },
  {
    name: 'recetas-anadir',
    path: '/recetas',
    button: 'Añadir receta',
    fixture: 'empty',
  },
  { name: 'plan', path: '/plan', fixture: 'empty' },
  {
    name: 'plan-elegir',
    path: '/plan/elegir?fecha=2026-07-20&servicio=lunch',
    fixture: 'empty',
  },
  {
    name: 'plan-cocinar',
    path: '/plan/cocinar?fecha=2026-07-20&servicio=lunch',
    fixture: 'empty',
  },
  { name: 'despensa', path: '/despensa', fixture: 'everyday' },
  { name: 'compra', path: '/compra', fixture: 'everyday' },
  { name: 'compra-revisar', path: '/compra/revisar', fixture: 'everyday' },
  { name: 'recetas', path: '/recetas', fixture: 'everyday' },
  { name: 'plan', path: '/plan', fixture: 'everyday' },
  {
    name: 'plan-elegir',
    path: '/plan/elegir?fecha=2026-07-20&servicio=lunch',
    fixture: 'everyday',
  },
  {
    name: 'plan-cocinar',
    path: '/plan/cocinar?fecha=2026-07-20&servicio=lunch',
    fixture: 'everyday',
  },
]

async function applicationIsReady() {
  try {
    const response = await fetch(new URL('/login', baseUrl))
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
  server = spawn(
    process.execPath,
    [
      resolve('node_modules/next/dist/bin/next'),
      'dev',
      '--port',
      visualContextPort,
    ],
    {
      cwd: process.cwd(),
      stdio: 'ignore',
      windowsHide: true,
    },
  )
}

try {
  await mkdir(outputDir, { recursive: true })
  await waitForApplication()
  const browser = await chromium.launch()

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport })
      for (const view of views) {
        const name = `${view.name}${view.fixture === 'everyday' ? '-everyday' : ''}-${viewport.name}`
        const url = new URL(view.path, baseUrl)
        if (view.fixture) url.searchParams.set('fixture', view.fixture)
        await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })
        if (view.button) {
          await page.getByRole('button', { name: view.button }).click()
        }

        const body = page.locator('body')
        const snapshot =
          typeof body.ariaSnapshot === 'function'
            ? await body.ariaSnapshot()
            : await body.innerText()
        await writeFile(
          resolve(outputDir, `${name}.snapshot.txt`),
          snapshot,
          'utf8',
        )
        await page.screenshot({
          path: resolve(outputDir, `${name}.png`),
          fullPage: true,
        })
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
