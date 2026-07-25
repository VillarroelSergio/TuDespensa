/**
 * Shared login helpers for E2E specs running against Supabase local.
 * Requires local Supabase credentials in `.env.test.local` (loaded by run-e2e-auth.mjs).
 */
import { createClient } from '@supabase/supabase-js'
import type { BrowserContext, Page } from '@playwright/test'

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

function anonClient() {
  return createClient(
    required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    required(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
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

/**
 * Logs in as a synthetic user via a real magic-link verification, without
 * sending or waiting on an actual email. The admin API issues the same OTP
 * Supabase would have emailed; `verifyOtp` redeems it directly and returns
 * the session tokens as JSON (no HTTP redirect involved, so this sidesteps
 * GoTrue's implicit-flow hash fragment, which a server route can't read).
 * The session, RLS and cookies set by `/auth/callback` are all real — only
 * the mailbox round-trip is skipped.
 */
export async function loginViaMagicLink(
  context: BrowserContext,
  base: string,
  email: string,
): Promise<Page> {
  const admin = adminClient()
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !link.properties?.hashed_token)
    throw new Error(
      `No se pudo generar el enlace de acceso para ${email}: ${linkError?.message ?? 'sin hashed_token'}`,
    )

  const { data: verified, error: verifyError } =
    await anonClient().auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: link.properties.verification_type as 'signup' | 'magiclink',
    })
  if (verifyError || !verified.session)
    throw new Error(
      `No se pudo verificar el acceso para ${email}: ${verifyError?.message ?? 'sin sesión'}`,
    )

  const page = await context.newPage()
  const callback = new URL(`${base}/auth/callback`)
  callback.searchParams.set('access_token', verified.session.access_token)
  callback.searchParams.set('refresh_token', verified.session.refresh_token)
  await page.goto(callback.toString())
  await page.waitForURL('**/onboarding')
  return page
}
