/**
 * Cobertura que faltaba tras sustituir la invitación por correo por un código
 * de invitación de un solo uso (ver supabase/migrations/20260726150000_pilot_invitation_codes.sql):
 * que DOS CUENTAS DISTINTAS puedan compartir el hogar (no la misma cuenta en
 * dos navegadores, que ya cubre onboarding-two-sessions.spec.ts), que sin
 * código no se entre, que el código sea de un solo uso, que el hogar lleno
 * bloquee la invitación y que una cuenta existente sin hogar (la vía de
 * reparación real) pueda unirse por /unirme.
 *
 * Los cinco casos comparten un único hogar creado en el Caso 1, así que se
 * ejecutan en serie dentro de un mismo describe. `resetPilotState` limpia el
 * hogar único (households_singleton_guard) y las cuentas sintéticas al
 * empezar y al terminar, para que la suite sea repetible y no deje al hogar
 * "atascado" para la siguiente ejecución de otros specs (p. ej. `npm run
 * test:e2e`, que espera poder crear un hogar nuevo desde cero).
 *
 * Run with: npm run test:e2e:invitation
 */
import { expect, test, type Page } from '@playwright/test'
import {
  adminClient,
  baseUrl as resolveBaseUrl,
  createSyntheticAccount,
  loginThroughLoginForm,
  loginWithPassword,
  registerThroughLoginForm,
  resetPilotState,
} from './support/auth'

const runId = Date.now()
const emailA = `pilot-a-${runId}@example.invalid`
const emailB = `pilot-b-${runId}@example.invalid`
const emailC = `pilot-c-${runId}@example.invalid`
const emailD = `pilot-d-${runId}@example.invalid`
const emailE = `pilot-e-${runId}@example.invalid`
const passwordA = 'Synthetic-Pw-A1'
const passwordB = 'Synthetic-Pw-B1'
const passwordC = 'Synthetic-Pw-C1'
const passwordD = 'Synthetic-Pw-D1'
const passwordE = 'Synthetic-Pw-E1'

/** Crea el hogar y confirma una línea base vacía para llegar al área protegida. */
async function completeEmptyOnboarding(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'Organiza la comida de casa' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Preparar mi despensa' }).click()
  for (const zone of ['frigorífico', 'congelador', 'despensa']) {
    await expect(
      page.getByRole('heading', { name: new RegExp(zone, 'i') }),
    ).toBeVisible()
    await page.getByRole('button', { name: `Mi ${zone} está vacío` }).click()
  }
  await expect(
    page.getByRole('heading', { name: 'Revisa tu despensa' }),
  ).toBeVisible()
  // `finish()` en src/app/onboarding/page.tsx llama a `router.replace('/despensa')`
  // justo después de confirmar: no hay pantalla intermedia "Tu despensa está
  // lista" que esperar (ese bloque de éxito es inalcanzable hoy: el middleware
  // redirige cualquier /onboarding con el hogar ya completado a /despensa antes
  // de que pudiera volver a mostrarse). Se espera la navegación real en su lugar.
  await page.getByRole('button', { name: 'Confirmar despensa' }).click()
  await page.waitForURL('**/despensa')
}

/** Añade un producto desde `/despensa` (formulario propio del componente; unidades por defecto). */
async function addPantryItem(page: Page, name: string) {
  await page.getByRole('button', { name: '+ Añadir producto' }).click()
  await page.getByRole('textbox', { name: 'Producto' }).fill(name)
  await page.getByRole('button', { name: 'Añadir a despensa' }).click()
  await expect(page.getByRole('textbox', { name: 'Producto' })).toBeHidden()
}

/** Genera un código como propietaria y lee el valor en claro del DOM. */
async function generateInvitationCodeAsOwner(page: Page): Promise<string> {
  await page.goto(`${resolveBaseUrl()}/hogar`)
  await page
    .getByRole('button', { name: 'Generar código de invitación' })
    .click()
  const codeLocator = page.locator('.household-invite-code__value')
  await expect(codeLocator).toBeVisible()
  const code = (await codeLocator.textContent())?.trim()
  if (!code) throw new Error('No se pudo leer el código de invitación generado')
  return code
}

async function findUserId(
  admin: ReturnType<typeof adminClient>,
  email: string,
): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const user = data.users.find((candidate) => candidate.email === email)
  if (!user) throw new Error(`No se encontró la cuenta sintética ${email}`)
  return user.id
}

test.describe.configure({ mode: 'serial' })

test.describe('invitación del piloto', () => {
  const admin = adminClient()
  const base = resolveBaseUrl()
  let invitationCode: string

  test.beforeAll(async () => {
    await resetPilotState(admin)
  })

  test.afterAll(async () => {
    // Deja el hogar único y las cuentas sintéticas limpias para que la
    // siguiente ejecución (p. ej. `npm run test:e2e`) pueda crear su propio
    // hogar sin chocar con el trigger de hogar único.
    await resetPilotState(admin)
  })

  test('Caso 1: dos cuentas distintas comparten el hogar', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    try {
      const pageA = await contextA.newPage()
      await registerThroughLoginForm(pageA, emailA, passwordA)
      // Primera cuenta, sin hogar todavía: acaba en el onboarding, no en /unirme.
      await expect(
        pageA.getByRole('heading', { name: 'Organiza la comida de casa' }),
      ).toBeVisible()
      await completeEmptyOnboarding(pageA)

      await pageA.goto(`${base}/despensa`)
      await addPantryItem(pageA, 'Peras')

      const code = await generateInvitationCodeAsOwner(pageA)
      invitationCode = code

      const pageB = await contextB.newPage()
      await registerThroughLoginForm(pageB, emailB, passwordB, code)
      // B entra directamente al hogar: no se le ofrece crear uno.
      expect(new URL(pageB.url()).pathname).toBe('/despensa')
      await expect(
        pageB.getByRole('button', { name: 'Marcar Peras como terminado' }),
      ).toBeVisible()

      // Realtime: con la página de B abierta, un alta de A debe llegar sin recargar.
      await addPantryItem(pageA, 'Manzanas')
      await expect(
        pageB.getByRole('button', { name: 'Marcar Manzanas como terminado' }),
      ).toBeVisible({ timeout: 20_000 })
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('Caso 2: sin código no se entra', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await registerThroughLoginForm(page, emailC, passwordC)
      await expect(
        page.getByText(
          'Necesitas un código de invitación. Pídeselo a la persona que ya usa MiDespensa.',
        ),
      ).toBeVisible()
      expect(new URL(page.url()).pathname).toBe('/login')
    } finally {
      await context.close()
    }
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    expect(data.users.some((user) => user.email === emailC)).toBe(false)
  })

  test('Caso 3: el código es de un solo uso', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await registerThroughLoginForm(page, emailD, passwordD, invitationCode)
      await expect(
        page.getByText(
          'Ese código no es válido o ha caducado. Pídele uno nuevo a la otra persona.',
        ),
      ).toBeVisible()
      expect(new URL(page.url()).pathname).toBe('/login')
    } finally {
      await context.close()
    }
    // Acción compensatoria de registerAccount: no debe quedar cuenta huérfana.
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    expect(data.users.some((user) => user.email === emailD)).toBe(false)
  })

  test('Caso 4: hogar lleno, no se puede generar otro código', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    try {
      const page = await loginWithPassword(context, base, emailA, passwordA)
      await page.goto(`${base}/hogar`)
      const inviteButton = page.getByRole('button', {
        name: 'Generar código de invitación',
      })
      await expect(inviteButton).toBeVisible()
      await expect(inviteButton).toHaveAttribute('aria-disabled', 'true')
    } finally {
      await context.close()
    }
  })

  test('Caso 5: una cuenta existente sin hogar se une por /unirme', async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    await createSyntheticAccount(admin, emailE, passwordE)
    const contextE = await browser.newContext()
    const contextA = await browser.newContext()
    try {
      const pageE = await contextE.newPage()
      await loginThroughLoginForm(pageE, emailE, passwordE)
      // Cuenta autenticada pero sin membresía y con el hogar ya existente:
      // el middleware debe llevarla a /unirme, no al onboarding.
      expect(new URL(pageE.url()).pathname).toBe('/unirme')
      await expect(
        pageE.getByRole('heading', { name: 'Únete a tu hogar' }),
      ).toBeVisible()

      // Manipulación de fixture: el piloto no tiene función "salir del hogar",
      // así que se libera un hueco desactivando la membresía de B directamente
      // con el cliente admin, simulando la única baja posible hoy (soporte).
      const memberBId = await findUserId(admin, emailB)
      const { error: deactivateError } = await admin
        .from('household_members')
        .update({ status: 'inactive' })
        .eq('user_id', memberBId)
      if (deactivateError) throw deactivateError

      const pageA = await loginWithPassword(contextA, base, emailA, passwordA)
      const code = await generateInvitationCodeAsOwner(pageA)

      await pageE.getByLabel('Código de invitación').fill(code)
      await pageE.getByRole('button', { name: 'Unirme al hogar' }).click()
      await pageE.waitForURL(/\/despensa/, { timeout: 20_000 })
      await expect(
        pageE.getByRole('button', { name: 'Marcar Peras como terminado' }),
      ).toBeVisible()
    } finally {
      await contextE.close()
      await contextA.close()
    }
  })
})
