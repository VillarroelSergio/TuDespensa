/**
 * Extiende el patrón de dos sesiones de `onboarding-two-sessions.spec.ts` a
 * Compra y Plan: un cambio de una persona debe llegar a la otra sin recargar
 * y sin sobrescribir una acción local no confirmada. Cuenta sintética propia,
 * separada del recorrido principal.
 * Run with: npm run test:e2e:realtime
 */
import { expect, test } from '@playwright/test'
import {
  adminClient,
  baseUrl as resolveBaseUrl,
  deleteSyntheticUser,
  loginViaMagicLink,
} from './support/auth'

test('compra converge en tiempo real entre dos sesiones', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const baseUrl = resolveBaseUrl()
  const admin = adminClient()
  const email = `realtime-compra-${Date.now()}@example.test`

  const first = await browser.newContext()
  const second = await browser.newContext()
  try {
    const pageA = await loginViaMagicLink(first, baseUrl, email)
    const pageB = await loginViaMagicLink(second, baseUrl, email)

    await pageA.goto(`${baseUrl}/compra`)
    await pageB.goto(`${baseUrl}/compra`)

    // A añade un artículo manual; debe llegar a B sin recargar.
    await pageA.getByPlaceholder('Añadir a la compra').fill('Naranjas')
    await pageA.getByRole('button', { name: 'Añadir' }).click()
    await expect(pageB.getByRole('checkbox', { name: 'Naranjas' })).toBeVisible(
      { timeout: 20_000 },
    )

    // B marca el artículo como comprado; A lo ve marcado sin recargar.
    await pageB.getByRole('checkbox', { name: 'Naranjas' }).check()
    await expect(pageA.getByRole('checkbox', { name: 'Naranjas' })).toBeChecked(
      { timeout: 20_000 },
    )

    // Una acción local no confirmada en A no se pierde al llegar la actualización remota.
    await pageA.getByPlaceholder('Añadir a la compra').fill('Limones')
    await pageA.getByRole('button', { name: 'Añadir' }).click()
    await expect(pageA.getByRole('checkbox', { name: 'Limones' })).toBeVisible()
    await pageB.getByRole('checkbox', { name: 'Naranjas' }).uncheck()
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
  const recipeTitle = `Receta realtime ${Date.now()}`

  const first = await browser.newContext()
  const second = await browser.newContext()
  try {
    const pageA = await loginViaMagicLink(first, baseUrl, email)

    // Crear una receta simple para poder asignarla desde el plan.
    await pageA.goto(`${baseUrl}/recetas`)
    await pageA.getByRole('button', { name: 'Añadir receta' }).click()
    await pageA.getByLabel('Nombre de la receta').fill(recipeTitle)
    await pageA.getByRole('button', { name: 'Crear' }).click()
    await pageA.waitForURL('**/recetas/*/editar')

    const pageB = await loginViaMagicLink(second, baseUrl, email)
    await pageA.goto(`${baseUrl}/plan`)
    await pageB.goto(`${baseUrl}/plan`)

    // A asigna la receta a un hueco vacío.
    await pageA.getByRole('link', { name: 'Añadir' }).first().click()
    await pageA.waitForURL('**/plan/elegir*')
    await pageA.getByLabel('Buscar una receta').fill(recipeTitle)
    await pageA.getByRole('button', { name: 'Buscar' }).click()
    await pageA.getByRole('button', { name: new RegExp(recipeTitle) }).click()
    await pageA.waitForURL('**/plan')

    // B ve el hueco ocupado sin recargar.
    await expect(pageB.getByText(recipeTitle)).toBeVisible({
      timeout: 20_000,
    })
  } finally {
    await first.close()
    await second.close()
    await deleteSyntheticUser(admin, email)
  }
})
