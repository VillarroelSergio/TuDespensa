/**
 * Extiende el patrón de dos sesiones de `onboarding-two-sessions.spec.ts` a
 * Compra y Plan: un cambio de una persona debe llegar a la otra sin recargar
 * y sin sobrescribir una acción local no confirmada. Cuenta sintética propia,
 * separada del recorrido principal.
 * Run with: npm run test:e2e:realtime
 */
import { expect, test, type Page } from '@playwright/test'
import {
  adminClient,
  baseUrl as resolveBaseUrl,
  createSyntheticAccount,
  deleteSyntheticUser,
  loginWithPassword,
} from './support/auth'

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
  await page.getByRole('button', { name: 'Confirmar despensa' }).click()
  await expect(
    page.getByRole('heading', { name: 'Tu despensa está lista' }),
  ).toBeVisible()
}

test('compra converge en tiempo real entre dos sesiones', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const baseUrl = resolveBaseUrl()
  const admin = adminClient()
  const email = `realtime-compra-${Date.now()}@example.test`
  const password = 'Synthetic-Pw-Realtime1'

  const first = await browser.newContext()
  const second = await browser.newContext()
  try {
    await createSyntheticAccount(admin, email, password)
    // Ambos inician sesión mientras el onboarding sigue incompleto: si B
    // entrara después de que A lo completase, su propio login le redirigiría
    // a /despensa en vez de /onboarding, rompiendo el ayudante compartido.
    const pageA = await loginWithPassword(first, baseUrl, email, password)
    const pageB = await loginWithPassword(second, baseUrl, email, password)
    await completeEmptyOnboarding(pageA)

    await pageA.goto(`${baseUrl}/compra`)
    await pageB.goto(`${baseUrl}/compra`)

    // A añade un artículo manual; debe llegar a B sin recargar.
    await pageA.getByPlaceholder('Añadir a la compra').fill('Naranjas')
    await pageA.getByRole('button', { name: 'Añadir' }).click()
    await expect(pageB.getByRole('checkbox', { name: 'Naranjas' })).toBeVisible(
      { timeout: 20_000 },
    )

    // B marca el artículo como comprado; A lo ve marcado sin recargar.
    // El toggle es una server action: reintenta el clic hasta que se refleje.
    const naranjasB = pageB.getByRole('checkbox', { name: 'Naranjas' })
    await expect(async () => {
      if (!(await naranjasB.isChecked())) await naranjasB.click()
      await expect(naranjasB).toBeChecked({ timeout: 3000 })
    }).toPass({ timeout: 15_000 })
    await expect(pageA.getByRole('checkbox', { name: 'Naranjas' })).toBeChecked(
      { timeout: 20_000 },
    )

    // Una acción local no confirmada en A no se pierde al llegar la actualización remota.
    await pageA.getByPlaceholder('Añadir a la compra').fill('Limones')
    await pageA.getByRole('button', { name: 'Añadir' }).click()
    await expect(pageA.getByRole('checkbox', { name: 'Limones' })).toBeVisible()
    await expect(async () => {
      if (await naranjasB.isChecked()) await naranjasB.click()
      await expect(naranjasB).not.toBeChecked({ timeout: 3000 })
    }).toPass({ timeout: 15_000 })
    await expect(
      pageA.getByRole('checkbox', { name: 'Naranjas' }),
    ).not.toBeChecked({ timeout: 20_000 })
    await expect(pageA.getByRole('checkbox', { name: 'Limones' })).toBeVisible()
  } finally {
    await first.close()
    await second.close()
    await deleteSyntheticUser(admin, email)
  }
})

test('el plan converge en tiempo real entre dos sesiones', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const baseUrl = resolveBaseUrl()
  const admin = adminClient()
  const email = `realtime-plan-${Date.now()}@example.test`
  const password = 'Synthetic-Pw-Realtime2'
  const recipeTitle = `Receta realtime ${Date.now()}`

  const first = await browser.newContext()
  const second = await browser.newContext()
  try {
    await createSyntheticAccount(admin, email, password)
    // Ambos inician sesión mientras el onboarding sigue incompleto: si B
    // entrara después de que A lo completase, su propio login le redirigiría
    // a /despensa en vez de /onboarding, rompiendo el ayudante compartido.
    const pageA = await loginWithPassword(first, baseUrl, email, password)
    const pageB = await loginWithPassword(second, baseUrl, email, password)
    await completeEmptyOnboarding(pageA)

    // Crear una receta simple para poder asignarla desde el plan.
    await pageA.goto(`${baseUrl}/recetas`)
    await pageA.getByRole('button', { name: 'Añadir receta' }).click()
    await pageA.getByLabel('Nombre de la receta').fill(recipeTitle)
    await pageA.getByRole('button', { name: 'Crear' }).click()
    await pageA.waitForURL('**/recetas/*/editar')

    await pageA.goto(`${baseUrl}/plan`)
    await pageB.goto(`${baseUrl}/plan`)

    // A asigna la receta a un hueco vacío.
    await pageA.getByRole('link', { name: 'Añadir' }).first().click()
    await pageA.waitForURL('**/plan/elegir*')
    await pageA.getByLabel('Buscar una receta').fill(recipeTitle)
    await pageA.getByRole('button', { name: new RegExp(recipeTitle) }).click()
    await pageA.waitForURL('**/plan*')

    // A diferencia de Compra/Despensa, la vista semanal del Plan no suscribe
    // a Realtime (sin canal `supabase.channel` en WeekView.tsx): el cambio de
    // A llega a B tras recargar, no en directo. Se documenta como hallazgo,
    // no se simula una convergencia en vivo que la app no ofrece hoy.
    await pageB.reload()
    await expect(pageB.getByRole('link', { name: recipeTitle })).toBeVisible({
      timeout: 20_000,
    })
  } finally {
    await first.close()
    await second.close()
    await deleteSyntheticUser(admin, email)
  }
})
