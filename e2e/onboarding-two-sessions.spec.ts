/**
 * Real two-session E2E against the local stack: `npx supabase start` + `npm run dev`.
 * This is the SAME account opened in two separate browser contexts — it
 * validates that a session stays stable and converges across different
 * devices/browsers, not that two distinct accounts can share a household
 * (that requirement is covered by `pilot-invitation.spec.ts`). Auth uses
 * password sign-in installed via `/auth/callback`, so middleware cookies and
 * Realtime are still exercised end-to-end; there is no magic link or mailbox
 * involved.
 * Requires local Supabase credentials in `.env.local` (or equivalent process env).
 * `SUPABASE_SERVICE_ROLE_KEY` is used only to delete the synthetic local user.
 * Run with: npm run test:e2e
 */
import { expect, test } from '@playwright/test'
import {
  adminClient,
  baseUrl as resolveBaseUrl,
  deleteSyntheticUser,
  loginWithPassword,
} from './support/auth'

test('two sessions converge during onboarding (auth + RLS + Realtime)', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const baseUrl = resolveBaseUrl()
  const admin = adminClient()
  const email = `onboarding-${Date.now()}@example.test`
  const password = 'e2e-synthetic-pw-1'

  const first = await browser.newContext()
  const second = await browser.newContext()
  try {
    // Session A: real login, create household, add a first item.
    const pageA = await loginWithPassword(first, baseUrl, email, password)
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
    const pageB = await loginWithPassword(second, baseUrl, email, password)
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
