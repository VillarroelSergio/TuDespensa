/**
 * Shared login helpers for E2E specs running against Supabase local.
 * Requires local Supabase credentials in `.env.test.local` (loaded by run-e2e-auth.mjs).
 *
 * The pilot has no SMTP, no magic links, no OTP and no browser verification:
 * every account authenticates with email + password. There is no mailbox
 * round-trip to skip anymore — these helpers just drive the real password
 * flow, either programmatically (fast path for specs that only need to be
 * logged in) or through the actual `/login` UI (for specs whose whole point
 * is to exercise that UI).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import type { BrowserContext, Page } from '@playwright/test'

const execFileAsync = promisify(execFile)

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
 * Creates a synthetic account directly via the admin API (no invitation code
 * involved). Deletes any pre-existing account with the same email first so
 * the test is repeatable across runs. Returns the new user id.
 */
export async function createSyntheticAccount(
  admin: ReturnType<typeof adminClient>,
  email: string,
  password: string,
): Promise<string> {
  await deleteSyntheticUser(admin, email)
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user)
    throw new Error(
      `No se pudo crear la cuenta sintética ${email}: ${error?.message ?? 'sin usuario'}`,
    )
  return data.user.id
}

/**
 * Logs in as a synthetic user with password auth, without going through the
 * `/login` UI. `signInWithPassword` from an anonymous client obtains the
 * session tokens, which are then installed in the browser by navigating to
 * `/auth/callback?access_token=...&refresh_token=...` — the same mechanism
 * the previous magic-link helper used to hand off a session to a page. This
 * is the fast, programmatic path for specs that only need to already be
 * logged in; it does not exercise the login form itself.
 */
export async function loginWithPassword(
  context: BrowserContext,
  base: string,
  email: string,
  password: string,
): Promise<Page> {
  const { data: signedIn, error: signInError } =
    await anonClient().auth.signInWithPassword({ email, password })
  if (signInError || !signedIn.session)
    throw new Error(
      `No se pudo iniciar sesión para ${email}: ${signInError?.message ?? 'sin sesión'}`,
    )

  const page = await context.newPage()
  const callback = new URL(`${base}/auth/callback`)
  callback.searchParams.set('access_token', signedIn.session.access_token)
  callback.searchParams.set('refresh_token', signedIn.session.refresh_token)
  await page.goto(callback.toString())
  // El destino depende del estado de la cuenta: /onboarding si aún no ha
  // creado el hogar, /despensa si ya lo completó, /unirme si el hogar existe
  // pero esta cuenta todavía no es miembro. Basta con esperar a que la cadena
  // de redirecciones termine fuera del callback.
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/callback'))
  return page
}

/**
 * Logs in through the real `/login` form (email + password, no code field in
 * login mode). Used when the requirement under test is that password login
 * works through the actual UI, not just that a session can be established.
 * Only meant for credentials that are expected to succeed: it waits for the
 * app to navigate away from `/login`, wherever the middleware sends it next
 * (`/onboarding`, `/despensa` or `/unirme`).
 */
export async function loginThroughLoginForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto(`${baseUrl()}/login`)
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  })
}

/**
 * Registers through the real `/login` form in "Crear cuenta" mode: email,
 * password and, if given, an invitation code. Registration can end two ways
 * — a successful one navigates away from `/login`; a rejected one (missing
 * code, invalid code, taken email) re-renders `/login` with an error in the
 * `aria-live="polite"` status paragraph. This waits for either outcome to
 * settle and leaves the assertion (which one happened, and what it says) to
 * the caller.
 */
export async function registerThroughLoginForm(
  page: Page,
  email: string,
  password: string,
  code?: string,
): Promise<void> {
  await page.goto(`${baseUrl()}/login`)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  if (code) await page.getByLabel('Código de invitación').fill(code)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 15_000,
    }),
    page
      .locator('[aria-live="polite"]')
      .filter({ hasText: /.+/ })
      .first()
      .waitFor({ timeout: 15_000 }),
  ]).catch(() => {
    // Ni navegó ni mostró mensaje: se deja pasar y que la aserción del spec
    // (sobre la URL o sobre el mensaje) sea la que falle con un motivo claro.
  })
}

/**
 * Resets Supabase local to a clean pilot state: deletes every household (the
 * `on delete cascade` on `household_members`/`household_invitations`/pantry
 * tables takes members, invitations and pantry data with it) and every
 * synthetic test account (`@example.test` / `@example.invalid`) from
 * `auth.users`. The pilot's household is a strict singleton (see the
 * `households_singleton_guard` trigger), so a household left over from a
 * previous run blocks the "first account creates the household" path for
 * every test after it.
 *
 * ONLY EVER RUN THIS AGAINST SUPABASE LOCAL. It refuses to run unless
 * `NEXT_PUBLIC_SUPABASE_URL` points at `127.0.0.1` or `localhost`, so it can
 * never wipe the remote project by accident.
 */
export async function resetPilotState(
  admin: ReturnType<typeof adminClient>,
): Promise<void> {
  const url = required(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    'NEXT_PUBLIC_SUPABASE_URL',
  )
  const host = new URL(url).hostname
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      `resetPilotState solo puede ejecutarse contra Supabase local (127.0.0.1/localhost); NEXT_PUBLIC_SUPABASE_URL apunta a "${host}".`,
    )
  }

  // `households` deliberately has no DELETE grant even for service_role (only
  // an authenticated owner can remove it, via the `reset_pilot_household` RPC
  // — see supabase/migrations/20260726103000_pilot_reset.sql): the admin REST
  // client gets "permission denied for table households" here, by design.
  // There is no signed-in owner session to call that RPC with from a cold
  // reset, so this drops to the Postgres superuser directly, the same
  // `docker exec ... psql` escape hatch already used for this project's
  // broken `supabase db reset` (see migration_catalog_bom_breaks_reset).
  try {
    await execFileAsync('docker', [
      'exec',
      'supabase_db_MiDespensa',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      // `pantry_movements` tiene un disparador de inmutabilidad
      // (private.reject_pantry_movement_mutation) que también bloquea el
      // borrado en cascada del hogar. Se desactivan solo los disparadores de
      // usuario de esa tabla durante el borrado: los de sistema (claves
      // ajenas y sus cascadas) siguen activos, así que la limpieza es
      // completa y coherente.
      'alter table public.pantry_movements disable trigger user;' +
        'delete from public.households;' +
        'alter table public.pantry_movements enable trigger user;',
    ])
  } catch (error) {
    throw new Error(
      `No se pudo limpiar los hogares (docker exec psql): ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const { data: usersPage, error: listError } =
    await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError)
    throw new Error(
      `No se pudieron listar las cuentas sintéticas: ${listError.message}`,
    )
  const syntheticUsers = usersPage.users.filter(
    (user) =>
      user.email?.endsWith('@example.test') ||
      user.email?.endsWith('@example.invalid'),
  )
  for (const user of syntheticUsers) {
    await admin.auth.admin.deleteUser(user.id)
  }
}
