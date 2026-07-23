/**
 * Shared magic-link auth helpers for E2E specs running against Supabase local.
 * Requires local Supabase credentials in `.env.local` (loaded by run-e2e-auth.mjs).
 */
import { createClient } from '@supabase/supabase-js'
import { expect, type BrowserContext, type Page } from '@playwright/test'

const mailpit = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:55324'

export function required(value: string | undefined, name: string) {
  if (!value)
    throw new Error(
      `Missing ${name}; run against Supabase local with synthetic E2E credentials.`,
    )
  return value
}

export function baseUrl() {
  return (
    process.env.E2E_BASE_URL ??
    `http://127.0.0.1:${process.env.E2E_PORT ?? '3001'}`
  )
}

export function adminClient() {
  return createClient(
    required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    required(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      'SUPABASE_SERVICE_ROLE_KEY',
    ),
  )
}

export async function deleteSyntheticUser(
  admin: ReturnType<typeof adminClient>,
  email: string,
) {
  const { data } = await admin.auth.admin.listUsers()
  const user = data.users.find((candidate) => candidate.email === email)
  if (user) await admin.auth.admin.deleteUser(user.id)
}

async function magicLinkFor(sentAfter: number): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const listing = (await (
      await fetch(`${mailpit}/api/v1/messages?limit=1`)
    ).json()) as { messages?: { ID: string; Created: string }[] }
    const message = listing.messages?.[0]
    if (message && Date.parse(message.Created) >= sentAfter) {
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

export async function loginViaMagicLink(
  context: BrowserContext,
  base: string,
  email: string,
): Promise<Page> {
  const page = await context.newPage()
  const sentAfter = Date.now() - 5000
  await page.goto(`${base}/login`)
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
