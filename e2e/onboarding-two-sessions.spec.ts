/**
 * Real two-session E2E against the local stack: `npx supabase start` + `npm run dev`.
 * Auth uses the actual UI flow — magic link captured from Mailpit (port 54324) —
 * so middleware cookies, the PKCE callback and Realtime are all exercised.
 * Requires env: E2E_BASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY (local demo key, used only to delete the synthetic user).
 * Run with: npm run test:e2e
 */
import { createClient } from '@supabase/supabase-js'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const mailpit = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324'

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`Missing ${name}; run against Supabase local with synthetic E2E credentials.`)
  return value
}

async function magicLinkFor(sentAfter: number): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const listing = await (await fetch(`${mailpit}/api/v1/messages?limit=1`)).json() as { messages?: { ID: string; Created: string }[] }
    const message = listing.messages?.[0]
    if (message && Date.parse(message.Created) >= sentAfter) {
      const detail = await (await fetch(`${mailpit}/api/v1/message/${message.ID}`)).json() as { Text?: string; HTML?: string }
      const source = `${detail.Text ?? ''}\n${(detail.HTML ?? '').replaceAll('&amp;', '&')}`
      const link = source.match(/https?:\/\/[^\s"'<>\])]+\/auth\/v1\/verify[^\s"'<>\])]*/)?.[0]
      if (link) return link
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('Magic link email did not arrive in Mailpit')
}

async function loginViaMagicLink(context: BrowserContext, baseUrl: string, email: string): Promise<Page> {
  const page = await context.newPage()
  const sentAfter = Date.now() - 5000
  await page.goto(`${baseUrl}/login`)
  // Clicking before React hydrates triggers a native form submit (page reload),
  // so retry until the client-side handler answers with the confirmation text.
  const confirmation = page.getByText('Revisa tu correo para continuar.')
  await expect(async () => {
    await page.getByLabel('Correo autorizado').fill(email)
    await page.getByRole('button', { name: 'Enviar enlace de acceso' }).click()
    await expect(confirmation).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 30_000 })
  await page.goto(await magicLinkFor(sentAfter))
  await page.waitForURL('**/onboarding')
  return page
}

test('two sessions converge during onboarding (auth + RLS + Realtime)', async ({ browser }) => {
  test.setTimeout(180_000)
  const baseUrl = required(process.env.E2E_BASE_URL, 'E2E_BASE_URL')
  const supabaseUrl = required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  const admin = createClient(supabaseUrl, required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'))
  const email = `onboarding-${Date.now()}@example.test`

  const first = await browser.newContext()
  const second = await browser.newContext()
  try {
    // Session A: real login, create household, add a first item.
    const pageA = await loginViaMagicLink(first, baseUrl, email)
    await pageA.getByRole('button', { name: 'Preparar mi despensa' }).click()
    await expect(pageA.getByRole('heading', { name: 'Frigorífico' })).toBeVisible()
    await pageA.getByRole('combobox').fill('Leche')
    await pageA.getByRole('combobox').press('Enter')
    await expect(pageA.getByRole('button', { name: 'Quitar Leche del frigorífico' })).toBeVisible()

    // Session B (same account, separate browser context): server snapshot resumes progress.
    const pageB = await loginViaMagicLink(second, baseUrl, email)
    await expect(pageB.getByRole('heading', { name: 'Frigorífico' })).toBeVisible()
    await expect(pageB.getByRole('button', { name: 'Quitar Leche del frigorífico' })).toBeVisible({ timeout: 15_000 })

    // Realtime: a change in A must reach B without reloading.
    await pageA.getByRole('combobox').fill('Huevos')
    await pageA.getByRole('combobox').press('Enter')
    await expect(pageB.getByRole('button', { name: 'Quitar Huevos del frigorífico' })).toBeVisible({ timeout: 20_000 })

    // Conflict-safe removal from B propagates back to A.
    await pageB.getByRole('button', { name: 'Quitar Leche del frigorífico' }).click()
    await expect(pageA.getByRole('button', { name: 'Quitar Leche del frigorífico' })).toBeHidden({ timeout: 20_000 })
  } finally {
    await first.close()
    await second.close()
    const { data } = await admin.auth.admin.listUsers()
    const user = data.users.find((candidate) => candidate.email === email)
    if (user) await admin.auth.admin.deleteUser(user.id)
  }
})
