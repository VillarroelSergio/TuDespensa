/**
 * Real two-session E2E against the local stack: `npx supabase start` + `npm run dev`.
 * Auth uses the actual UI flow — magic link captured from Mailpit (port 55324) —
 * so middleware cookies, the PKCE callback and Realtime are all exercised.
 * Requires local Supabase credentials in `.env.local` (or equivalent process env).
 * `SUPABASE_SERVICE_ROLE_KEY` is used only to delete the synthetic local user.
 * Run with: npm run test:e2e
 */
import { expect, test } from '@playwright/test'
import {
  adminClient,
  baseUrl as resolveBaseUrl,
  deleteSyntheticUser,
  loginViaMagicLink,
} from './support/auth'

test('two sessions converge during onboarding (auth + RLS + Realtime)', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const baseUrl = resolveBaseUrl()
  const admin = adminClient()
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
    await deleteSyntheticUser(admin, email)
  }
})
