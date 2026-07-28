/**
 * Recorrido de valor completo del hogar fundador contra Supabase local:
 * acceso con contraseña → línea base → receta → plan → compra → cocina →
 * ticket. Cada etapa comprueba el resultado visible y el estado persistido.
 * Run with: npm run test:e2e:founder
 */
import { expect, test } from '@playwright/test'
import {
  adminClient,
  baseUrl as resolveBaseUrl,
  createSyntheticAccount,
  deleteSyntheticUser,
  loginWithPassword,
} from './support/auth'

test('el hogar fundador recorre el valor completo de MiDespensa', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const baseUrl = resolveBaseUrl()
  const admin = adminClient()
  const email = `founder-e2e-${Date.now()}@example.test`
  const password = 'Synthetic-Pw-Founder1'
  const recipeTitle = `Receta fundadora ${Date.now()}`

  const context = await browser.newContext()
  try {
    // Acceso: contraseña → onboarding.
    await createSyntheticAccount(admin, email, password)
    const page = await loginWithPassword(context, baseUrl, email, password)

    // Línea base: crear hogar y declarar presencia por zona.
    await expect(
      page.getByRole('heading', { name: 'Organiza la comida de casa' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Preparar mi despensa' }).click()

    for (const zone of ['Frigorífico', 'Congelador', 'Despensa']) {
      await expect(page.getByRole('heading', { name: zone })).toBeVisible()
      await page
        .getByRole('button', { name: `Mi ${zone.toLowerCase()} está vacío` })
        .click()
    }
    await expect(
      page.getByRole('heading', { name: 'Revisa tu despensa' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar despensa' }).click()
    await expect(
      page.getByRole('heading', { name: 'Tu despensa está lista' }),
    ).toBeVisible()

    // Receta: crear una receta ready con ingredientes y pasos.
    await page.getByRole('link', { name: 'Añadir mi primera receta' }).click()
    await page.waitForURL('**/recetas')
    await page.getByRole('button', { name: 'Añadir receta' }).click()
    await page.getByLabel('Nombre de la receta').fill(recipeTitle)
    await page.getByRole('button', { name: 'Crear' }).click()
    await page.waitForURL('**/recetas/*/editar')

    await expect(
      page.getByRole('heading', { name: 'Editar receta' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Añadir ingrediente' }).click()
    await page.getByLabel('Ingrediente').first().fill('Tomate')
    await page.getByLabel('Cantidad').first().fill('2')
    await page.getByRole('button', { name: 'Añadir paso' }).click()
    await page.getByLabel('Paso 1').fill('Cortar y servir.')
    await page.getByRole('button', { name: 'Guardar receta' }).click()
    await page.waitForURL('**/recetas/*')
    await expect(page.getByRole('heading', { name: recipeTitle })).toBeVisible()

    await page.goto(`${baseUrl}/recetas`)
    await expect(
      page.getByRole('link', { name: new RegExp(recipeTitle) }),
    ).toBeVisible()

    // Plan: asignar la receta a un hueco.
    await page.goto(`${baseUrl}/plan`)
    await page.getByRole('link', { name: /^Añadir / }).first().click()
    await page.waitForURL('**/plan/elegir*')
    await expect(
      page.getByRole('heading', { name: '¿Qué quieres comer?' }),
    ).toBeVisible()
    await page.getByLabel('Buscar una receta').fill(recipeTitle)
    await page.getByRole('button', { name: new RegExp(recipeTitle) }).click()
    await page.waitForURL('**/plan*')
    await expect(page.getByRole('link', { name: recipeTitle })).toBeVisible()

    // Compra: comprobar faltantes, marcar y confirmar sin duplicados.
    await page.goto(`${baseUrl}/compra`)
    const tomateRow = page.getByRole('checkbox', { name: 'Tomate' })
    await expect(tomateRow).toBeVisible()
    // El toggle es una server action: reintenta el clic hasta que el estado
    // marcado se refleje, en vez de asumir que un único clic basta.
    await expect(async () => {
      if (!(await tomateRow.isChecked())) await tomateRow.click()
      await expect(tomateRow).toBeChecked({ timeout: 3000 })
    }).toPass({ timeout: 15_000 })
    await page.getByRole('link', { name: /Confirmar compra · 1/ }).click()
    await page.waitForURL('**/compra/revisar')
    await expect(
      page.getByRole('heading', { name: 'Revisa tu compra' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar en despensa' }).click()
    await page.waitForURL('**/compra*confirmado*')

    await page.goto(`${baseUrl}/despensa`)
    await expect(
      page.getByRole('button', { name: 'Marcar Tomate como terminado' }),
    ).toBeVisible()

    // Cocina: marcar la comida como cocinada y confirmar propuestas.
    await page.goto(`${baseUrl}/plan`)
    const optionsMenu = page.locator('details.plan-menu').first()
    await optionsMenu.locator('summary').first().click()
    await optionsMenu
      .getByRole('link', { name: 'Marcar como cocinada' })
      .click()
    await page.waitForURL('**/plan/cocinar*')
    await expect(
      page.getByRole('heading', { name: new RegExp('Cocinar') }),
    ).toBeVisible()
    // Por defecto el desplegable conserva el estado actual del ingrediente;
    // hay que marcarlo "Agotado" para que la confirmación lo dé por terminado.
    await page
      .locator('.cook-row')
      .filter({ has: page.getByRole('checkbox', { name: 'Tomate' }) })
      .getByRole('combobox')
      .selectOption({ label: 'Agotado' })
    await page.getByRole('button', { name: 'Marcar como cocinada' }).click()
    await page.waitForURL('**/plan*cocinada*')
    await expect(page.locator('text=✓ Cocinada').first()).toBeVisible()

    await page.goto(`${baseUrl}/despensa`)
    await expect(
      page.getByRole('button', { name: 'Marcar Tomate como terminado' }),
    ).toBeHidden({ timeout: 15_000 })

    // Ticket: pegar líneas, corregir una y confirmar (nada cambia antes de confirmar).
    await page.goto(`${baseUrl}/compra/ticket`)
    await expect(
      page.getByRole('heading', { name: 'Importar de un ticket' }),
    ).toBeVisible()
    await page.getByLabel('Texto del ticket').fill('Pan 1 ud\nLeche 1 l')
    await page.getByRole('button', { name: 'Detectar productos' }).click()
    await expect(page.getByLabel('Producto').first()).toBeVisible()

    // No debe reflejarse nada en Compra hasta confirmar.
    await expect(page.getByRole('checkbox', { name: 'Pan' })).toHaveCount(0)

    await page.getByLabel('Cantidad').first().fill('2')
    await page.getByRole('button', { name: /Añadir a la compra/ }).click()
    await page.waitForURL('**/compra*ticket*')
    await expect(page.getByRole('checkbox', { name: 'Pan' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Leche' })).toBeChecked()
  } finally {
    await context.close()
    await deleteSyntheticUser(admin, email)
  }
})
