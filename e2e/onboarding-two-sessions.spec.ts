/**
 * Real two-session E2E against the local stack: `npx supabase start` + `npm run dev`.
 * Auth uses the actual UI flow — magic link captured from Mailpit (port 54324) —
 * so middleware cookies, the PKCE callback and Realtime are all exercised.
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY (local demo key, used only to delete synthetic users).
 * These are loaded from the untracked `.env.local`. E2E_BASE_URL is optional
 * when running against a separately started application.
 * Run with: npm run test:e2e
 */
import { createClient } from '@supabase/supabase-js'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const mailpit = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324'

function required(value: string | undefined, name: string) {
  if (!value)
    throw new Error(
      `Missing ${name}; run against Supabase local with synthetic E2E credentials.`,
    )
  return value
}

function addressedTo(
  message: { To?: Array<{ Address?: string }> },
  email: string,
) {
  return (
    message.To?.some(
      (recipient) => recipient.Address?.toLowerCase() === email.toLowerCase(),
    ) ?? false
  )
}

async function magicLinkFor(sentAfter: number, email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const listing = (await (
      await fetch(`${mailpit}/api/v1/messages?limit=100`)
    ).json()) as {
      messages?: {
        ID: string
        Created: string
        To?: Array<{ Address?: string }>
      }[]
    }
    const message = listing.messages?.find(
      (candidate) =>
        Date.parse(candidate.Created) >= sentAfter &&
        addressedTo(candidate, email),
    )
    if (message) {
      const detail = (await (
        await fetch(`${mailpit}/api/v1/message/${message.ID}`)
      ).json()) as { Text?: string; HTML?: string }
      const source = `${detail.Text ?? ''}\n${(detail.HTML ?? '').replaceAll('&amp;', '&')}`
      const link = source.match(
        /https?:\/\/[^\s"'<>\])]+\/auth\/v1\/verify[^\s"'<>\])]*/,
      )?.[0]
      if (link) return link
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('Magic link email did not arrive in Mailpit')
}

async function loginViaMagicLink(
  context: BrowserContext,
  baseUrl: string,
  email: string,
): Promise<Page> {
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
  await page.goto(await magicLinkFor(sentAfter, email))
  // `goto` already waits for the redirect chain. Waiting for a *new*
  // navigation here can miss the completed redirect and wait until timeout.
  await expect(page).toHaveURL(/\/onboarding$/)
  return page
}

test('completes onboarding with an empty baseline and persists the completed state', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
  const supabaseUrl = required(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    'NEXT_PUBLIC_SUPABASE_URL',
  )
  const admin = createClient(
    supabaseUrl,
    required(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      'SUPABASE_SERVICE_ROLE_KEY',
    ),
  )
  const email = `onboarding-complete-${Date.now()}@example.test`
  const context = await browser.newContext()

  try {
    const page = await loginViaMagicLink(context, baseUrl, email)
    await page.getByRole('button', { name: 'Preparar mi despensa' }).click()

    await page
      .getByRole('button', { name: 'Mi frigorífico está vacío' })
      .click()
    await expect(page.getByRole('heading', { name: 'Congelador' })).toBeVisible(
      {
        timeout: 15_000,
      },
    )
    await page.getByRole('button', { name: 'Mi congelador está vacío' }).click()
    await expect(page.getByRole('heading', { name: 'Despensa' })).toBeVisible({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: 'Mi despensa está vacío' }).click()

    await expect(
      page.getByRole('heading', { name: 'Revisa tu despensa' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar despensa' }).click()
    await expect(
      page.getByRole('heading', { name: 'Tu despensa está lista' }),
    ).toBeVisible()

    // The success screen is client state. A reload verifies that the server-side
    // middleware has persisted the completed onboarding state.
    await page.reload()
    await page.waitForURL('**/despensa')
  } finally {
    await context.close()
    const { data } = await admin.auth.admin.listUsers()
    const user = data.users.find((candidate) => candidate.email === email)
    if (user) await admin.auth.admin.deleteUser(user.id)
  }
})

test('two sessions converge during onboarding (auth + RLS + Realtime)', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
  const supabaseUrl = required(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    'NEXT_PUBLIC_SUPABASE_URL',
  )
  const admin = createClient(
    supabaseUrl,
    required(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      'SUPABASE_SERVICE_ROLE_KEY',
    ),
  )
  const email = `onboarding-${Date.now()}@example.test`

  const first = await browser.newContext()
  const second = await browser.newContext()
  try {
    // Session A: real login, create household, add a first item.
    const pageA = await loginViaMagicLink(first, baseUrl, email)
    await pageA.getByRole('button', { name: 'Preparar mi despensa' }).click()
    await expect(
      pageA.getByRole('heading', { name: 'Frigorífico' }),
    ).toBeVisible()
    await pageA.getByRole('combobox').fill('Leche')
    await pageA.getByRole('combobox').press('Enter')
    await expect(
      pageA.getByRole('button', { name: 'Quitar Leche del frigorífico' }),
    ).toBeVisible()

    // Session B (same account, separate browser context): server snapshot resumes progress.
    const pageB = await loginViaMagicLink(second, baseUrl, email)
    await expect(
      pageB.getByRole('heading', { name: 'Frigorífico' }),
    ).toBeVisible()
    await expect(
      pageB.getByRole('button', { name: 'Quitar Leche del frigorífico' }),
    ).toBeVisible({ timeout: 15_000 })

    // Realtime: a change in A must reach B without reloading.
    await pageA.getByRole('combobox').fill('Huevos')
    await pageA.getByRole('combobox').press('Enter')
    await expect(
      pageB.getByRole('button', { name: 'Quitar Huevos del frigorífico' }),
    ).toBeVisible({ timeout: 20_000 })

    // Conflict-safe removal from B propagates back to A.
    await pageB
      .getByRole('button', { name: 'Quitar Leche del frigorífico' })
      .click()
    await expect(
      pageA.getByRole('button', { name: 'Quitar Leche del frigorífico' }),
    ).toBeHidden({ timeout: 20_000 })
  } finally {
    await first.close()
    await second.close()
    const { data } = await admin.auth.admin.listUsers()
    const user = data.users.find((candidate) => candidate.email === email)
    if (user) await admin.auth.admin.deleteUser(user.id)
  }
})
