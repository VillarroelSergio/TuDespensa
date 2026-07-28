/**
 * Matriz de acciones del founder journey (ver docs/05-Architecture/E2E-FOUNDER-VALIDATION-DESIGN.md,
 * sección «2. founder-actions.spec.ts»). Cada `describe` cubre un módulo con casos
 * independientes: usuario sintético propio en `beforeEach`, limpieza en `afterEach`.
 * Real contra Supabase local: `npm run test:e2e:actions`.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import {
  adminClient,
  baseUrl as resolveBaseUrl,
  deleteSyntheticUser,
  loginViaMagicLink,
} from './support/auth'

function uniqueEmail(zone: string): string {
  return `accion-${zone}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`
}

/** Marca/desmarca un checkbox respaldado por una server action: reintenta hasta que se refleje. */
async function toggleCheckbox(
  checkbox: ReturnType<Page['getByRole']>,
  checked: boolean,
) {
  await expect(async () => {
    if ((await checkbox.isChecked()) !== checked) await checkbox.click()
    if (checked) await expect(checkbox).toBeChecked({ timeout: 3000 })
    else await expect(checkbox).not.toBeChecked({ timeout: 3000 })
  }).toPass({ timeout: 15_000 })
}

/**
 * Crea el hogar y confirma una línea base vacía (sin alimentos) para llegar al
 * área protegida lo antes posible. El recorrido físico de altas se cubre en
 * `founder-journey.spec.ts`; aquí solo hace falta un hogar con onboarding completo.
 */
async function completeEmptyOnboarding(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'Organiza la comida de casa' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Preparar mi despensa' }).click()
  for (const [zone, label] of [
    ['frigorífico', 'Frigorífico'],
    ['congelador', 'Congelador'],
    ['despensa', 'Despensa'],
  ] as const) {
    await expect(page.getByRole('heading', { name: label })).toBeVisible()
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

// --- helpers de Plan: reproducen la aritmética pura de presentation.ts sin
// depender de la resolución de alias '@/' fuera del árbol de Next. ---
const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
]
const MEAL_LABELS = { lunch: 'comida', dinner: 'cena' } as const

function isoToUtcDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1))
}

function slotLabelOf(iso: string, mealType: 'lunch' | 'dinner'): string {
  return `${DAY_NAMES[isoToUtcDate(iso).getUTCDay()]}, ${MEAL_LABELS[mealType]}`
}

function addDaysIso(iso: string, days: number): string {
  const date = isoToUtcDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Crea una receta (rápida u opcionalmente con ingredientes) y la deja `ready`. */
async function createRecipe(
  page: Page,
  base: string,
  title: string,
  ingredientNames: string[] = [],
) {
  await page.goto(`${base}/recetas`)
  await page.getByRole('button', { name: 'Añadir receta' }).click()
  await page.getByLabel('Nombre de la receta').fill(title)
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/recetas\/[0-9a-f-]+\/editar/)
  if (ingredientNames.length) {
    await page
      .getByLabel('Ingrediente', { exact: true })
      .first()
      .fill(ingredientNames[0]!)
    for (let index = 1; index < ingredientNames.length; index += 1) {
      await page.getByRole('button', { name: 'Añadir ingrediente' }).click()
      await page
        .getByLabel('Ingrediente', { exact: true })
        .nth(index)
        .fill(ingredientNames[index]!)
    }
  }
  await page.getByRole('button', { name: 'Guardar receta' }).click()
  await page.waitForURL(/\/recetas\/[0-9a-f-]+$/)
}

/** Añade un producto por presencia desde `/despensa` (formulario propio del componente). */
async function addPantryItem(page: Page, name: string, zoneLabel?: string) {
  await page.getByRole('button', { name: '+ Añadir producto' }).click()
  await page.getByRole('textbox', { name: 'Producto' }).fill(name)
  if (zoneLabel) await page.getByRole('button', { name: zoneLabel }).click()
  await page.getByRole('button', { name: 'Añadir a despensa' }).click()
}

test.describe('pantry', () => {
  test.describe.configure({ timeout: 120_000 })
  const admin = adminClient()
  let context: BrowserContext
  let page: Page
  let email: string

  test.beforeEach(async ({ browser }) => {
    email = uniqueEmail('pantry')
    context = await browser.newContext()
    page = await loginViaMagicLink(context, resolveBaseUrl(), email)
    await completeEmptyOnboarding(page)
    await page.goto(`${resolveBaseUrl()}/despensa`)
  })

  test.afterEach(async () => {
    await context.close()
    await deleteSyntheticUser(admin, email)
  })

  test('añade un producto por presencia en la zona elegida, sin cantidades', async () => {
    await expect(page.getByRole('heading', { name: 'Despensa' })).toBeVisible()
    await addPantryItem(page, 'Tomates', 'Frigorífico')
    await expect(
      page.getByRole('button', { name: 'Marcar Tomates como terminado' }),
    ).toBeVisible()
    // La alta por presencia no pide cantidad: el formulario nunca la ofrece.
    const fridge = page.getByRole('region', { name: 'Inventario: Frigorífico' })
    await expect(fridge.getByText('Tomates')).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('button', { name: 'Marcar Tomates como terminado' }),
    ).toBeVisible()
  })

  test('marca «Se terminó» y deshacer recupera la presencia', async () => {
    await addPantryItem(page, 'Leche')
    await page
      .getByRole('button', { name: 'Marcar Leche como terminado' })
      .click()
    const toast = page.getByRole('status')
    await expect(toast).toContainText('Leche → Se terminó')
    await expect(toast.getByRole('button', { name: 'Deshacer' })).toBeVisible()
    await expect(
      toast.getByRole('button', { name: 'Añadir a compra' }),
    ).toBeVisible()
    await toast.getByRole('button', { name: 'Deshacer' }).click()
    await expect(
      page.getByRole('button', { name: 'Marcar Leche como terminado' }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('button', { name: 'Marcar Leche como terminado' }),
    ).toBeVisible()
  })

  test('añadir un producto terminado a Compra no lo duplica en Despensa', async () => {
    await addPantryItem(page, 'Yogur')
    await page
      .getByRole('button', { name: 'Marcar Yogur como terminado' })
      .click()
    await page
      .getByRole('status')
      .getByRole('button', { name: 'Añadir a compra' })
      .click()
    await expect(page.getByText('Yogur: añadido a Compra.')).toBeVisible()
    await page.reload()
    // Sigue habiendo una única fila de Yogur y conserva la única acción de salida.
    await expect(page.getByText('Yogur', { exact: true })).toHaveCount(1)
    await expect(
      page.getByRole('button', { name: 'Marcar Yogur como terminado' }),
    ).toHaveCount(0)

    await page.goto(`${resolveBaseUrl()}/compra`)
    const yogurLine = page.getByRole('checkbox', { name: 'Yogur' })
    await expect(yogurLine).toHaveCount(1)
    await expect(page.getByText('Desde despensa')).toBeVisible()
  })
})

test.describe('shopping', () => {
  test.describe.configure({ timeout: 120_000 })
  const admin = adminClient()
  let context: BrowserContext
  let page: Page
  let email: string

  test.beforeEach(async ({ browser }) => {
    email = uniqueEmail('shopping')
    context = await browser.newContext()
    page = await loginViaMagicLink(context, resolveBaseUrl(), email)
    await completeEmptyOnboarding(page)
    await page.goto(`${resolveBaseUrl()}/compra`)
  })

  test.afterEach(async () => {
    await context.close()
    await deleteSyntheticUser(admin, email)
  })

  test('alta manual, marcar y desmarcar comprado persisten tras recargar', async () => {
    await page.getByLabel('Añadir a la compra').fill('Pan')
    await page.getByRole('button', { name: 'Añadir' }).click()
    const checkbox = page.getByRole('checkbox', { name: 'Pan' })
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()

    await toggleCheckbox(checkbox, true)
    await page.reload()
    await expect(page.getByRole('checkbox', { name: 'Pan' })).toBeChecked()

    await toggleCheckbox(page.getByRole('checkbox', { name: 'Pan' }), false)
    await expect(page.getByRole('checkbox', { name: 'Pan' })).not.toBeChecked()
    await page.reload()
    await expect(page.getByRole('checkbox', { name: 'Pan' })).not.toBeChecked()
  })

  test('revisar la compra conserva las marcas al volver y confirma una sola vez', async () => {
    await page.getByLabel('Añadir a la compra').fill('Arroz')
    await page.getByRole('button', { name: 'Añadir' }).click()
    await toggleCheckbox(page.getByRole('checkbox', { name: 'Arroz' }), true)

    await page.getByRole('link', { name: 'Confirmar compra · 1' }).click()
    await expect(
      page.getByRole('heading', { name: 'Revisa tu compra' }),
    ).toBeVisible()
    await expect(page.getByText('Arroz')).toBeVisible()

    await page.getByRole('link', { name: '← Volver a la lista' }).click()
    await expect(page.getByRole('checkbox', { name: 'Arroz' })).toBeChecked()

    await page.getByRole('link', { name: 'Confirmar compra · 1' }).click()
    await page.getByRole('button', { name: 'Confirmar en despensa' }).click()
    await page.waitForURL(/\/compra\?confirmado=1/)
    await expect(page.getByRole('checkbox', { name: 'Arroz' })).toHaveCount(0)

    await page.goto(`${resolveBaseUrl()}/despensa`)
    await expect(
      page.getByRole('button', { name: 'Marcar Arroz como terminado' }),
    ).toBeVisible()
  })

  test('importar ticket, editar una línea y excluir otra: solo lo incluido llega marcado', async () => {
    await page.goto(`${resolveBaseUrl()}/compra/ticket`)
    await expect(
      page.getByRole('heading', { name: 'Importar de un ticket' }),
    ).toBeVisible()
    const detect = page.getByRole('button', { name: 'Detectar productos' })
    await expect(detect).toBeDisabled()
    await page
      .getByLabel('Texto del ticket')
      .fill('Tomate 500 g\nLeche 1,5 l\nManzanas 3')
    await expect(detect).toBeEnabled()
    await detect.click()

    // Filas detectadas en el orden del texto pegado: Tomate, Leche, Manzanas.
    await expect(page.locator('#ticket-name-0')).toHaveValue('Tomate')
    await expect(page.locator('#ticket-name-1')).toHaveValue('Leche')
    await expect(page.locator('#ticket-name-2')).toHaveValue('Manzanas')

    // Nada debe cambiar antes de confirmar.
    const checkPage = await context.newPage()
    await checkPage.goto(`${resolveBaseUrl()}/compra`)
    await expect(
      checkPage.getByRole('checkbox', { name: 'Tomate' }),
    ).toHaveCount(0)
    await checkPage.close()

    await page.locator('#ticket-name-2').fill('Manzanas Golden')
    await page.getByRole('button', { name: 'Quitar Leche' }).click()

    const confirm = page.getByRole('button', { name: 'Añadir a la compra · 2' })
    await expect(confirm).toBeVisible()
    await confirm.click()
    await page.waitForURL(/\/compra\?ticket=2/)

    await expect(page.getByRole('checkbox', { name: 'Tomate' })).toBeChecked()
    await expect(
      page.getByRole('checkbox', { name: 'Manzanas Golden' }),
    ).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Leche' })).toHaveCount(0)
  })
})

test.describe('recipes', () => {
  test.describe.configure({ timeout: 120_000 })
  const admin = adminClient()
  let context: BrowserContext
  let page: Page
  let email: string
  let base: string

  test.beforeEach(async ({ browser }) => {
    email = uniqueEmail('recipes')
    base = resolveBaseUrl()
    context = await browser.newContext()
    page = await loginViaMagicLink(context, base, email)
    await completeEmptyOnboarding(page)
    await page.goto(`${base}/recetas`)
  })

  test.afterEach(async () => {
    await context.close()
    await deleteSyntheticUser(admin, email)
  })

  test('crea una receta rápida desde la biblioteca y abre el editor correcto', async () => {
    const title = `Tortilla rápida ${Date.now()}`
    await page.getByRole('button', { name: 'Añadir receta' }).click()
    await page.getByLabel('Nombre de la receta').fill(title)
    await page.getByRole('button', { name: 'Crear' }).click()
    await page.waitForURL(/\/recetas\/[0-9a-f-]+\/editar/)
    await expect(
      page.getByRole('heading', { name: 'Editar receta' }),
    ).toBeVisible()

    await page.goto(`${base}/recetas`)
    const card = page.getByRole('link', { name: title })
    await expect(card).toBeVisible()
    await card.click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
  })

  test('crea una receta completa y conserva ingredientes y orden de pasos tras recargar', async () => {
    const title = `Tortilla completa ${Date.now()}`
    await page.getByRole('button', { name: 'Añadir receta' }).click()
    await page.getByLabel('Nombre de la receta').fill(title)
    await page.getByRole('button', { name: 'Crear' }).click()
    await page.waitForURL(/\/recetas\/[0-9a-f-]+\/editar/)

    await page.getByLabel('Raciones').fill('2')
    await page.getByLabel('Tiempo (min)').fill('20')
    await page.getByLabel('Ingrediente', { exact: true }).first().fill('Harina')
    await page.getByLabel('Cantidad').first().fill('200')
    await page.getByLabel('Unidad').first().selectOption('g')
    await page.getByRole('button', { name: 'Añadir ingrediente' }).click()
    await page.getByLabel('Ingrediente', { exact: true }).nth(1).fill('Huevos')
    await page.getByLabel('Cantidad').nth(1).fill('3')
    await page.getByLabel('Unidad').nth(1).selectOption('unit')
    await page.getByLabel('Paso 1').fill('Batir los huevos')
    await page.getByRole('button', { name: 'Añadir paso' }).click()
    await page.getByLabel('Paso 2').fill('Cocinar la tortilla')
    await page.getByRole('button', { name: 'Guardar receta' }).click()
    await page.waitForURL(/\/recetas\/[0-9a-f-]+$/)

    async function assertPersisted() {
      const ingredients = page.getByRole('region', { name: 'Ingredientes' })
      await expect(ingredients.getByText('200 g · Harina')).toBeVisible()
      await expect(ingredients.getByText('3 uds. · Huevos')).toBeVisible()
      const steps = page.getByRole('region', { name: 'Pasos' })
      await expect(steps.getByRole('listitem')).toHaveText([
        'Batir los huevos',
        'Cocinar la tortilla',
      ])
    }
    await assertPersisted()
    await page.reload()
    await assertPersisted()
  })

  test('edita una receta existente y guarda sin crear una tarjeta duplicada', async () => {
    const title = `Receta original ${Date.now()}`
    await createRecipe(page, base, title)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    await page.getByRole('link', { name: 'Editar' }).click()
    await page.waitForURL(/\/recetas\/[0-9a-f-]+\/editar/)
    const editedTitle = `Receta editada ${Date.now()}`
    await page.getByLabel('Nombre de la receta').fill(editedTitle)
    await page.getByRole('button', { name: 'Guardar receta' }).click()
    await page.waitForURL(/\/recetas\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: editedTitle })).toBeVisible()

    await page.goto(`${base}/recetas`)
    await expect(
      page.getByRole('link', { name: editedTitle, exact: true }),
    ).toHaveCount(1)
    await expect(
      page.getByRole('link', { name: title, exact: true }),
    ).toHaveCount(0)
  })

  test('captura un enlace como receta pendiente y al completarla pasa a lista', async () => {
    await page.getByRole('button', { name: 'Añadir receta' }).click()
    await page
      .getByLabel('Enlace de la receta')
      .fill(`https://example.test/receta-${Date.now()}`)
    await page.getByRole('button', { name: 'Guardar enlace' }).click()
    await page.waitForURL(/\/recetas\/[0-9a-f-]+\/editar/)
    await expect(
      page.getByRole('heading', { name: 'Revisar receta' }),
    ).toBeVisible()
    const editorUrl = page.url()

    await page.goto(`${base}/recetas`)
    await expect(page.getByText('Por revisar')).toBeVisible()

    await page.goto(editorUrl)
    const title = `Pollo al horno ${Date.now()}`
    await page.getByLabel('Nombre de la receta').fill(title)
    await page.getByRole('button', { name: 'Guardar receta' }).click()
    await page.waitForURL(/\/recetas\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    await page.goto(`${base}/recetas`)
    await expect(page.getByText('Por revisar')).toHaveCount(0)
    await expect(page.getByRole('link', { name: title })).toBeVisible()
  })

  test('favorito, puntuación y categoría se conservan y el filtro las encuentra', async () => {
    const title = `Receta favorita ${Date.now()}`
    await page.getByRole('button', { name: 'Añadir receta' }).click()
    await page.getByLabel('Nombre de la receta').fill(title)
    await page.getByRole('button', { name: 'Crear' }).click()
    await page.waitForURL(/\/recetas\/[0-9a-f-]+\/editar/)
    await page.getByRole('button', { name: 'Más detalles' }).click()
    await page.getByRole('button', { name: 'Añadir categoría' }).click()
    await page.getByLabel('Nombre', { exact: true }).fill('Rápido')
    await page.getByRole('button', { name: 'Guardar receta' }).click()
    await page.waitForURL(/\/recetas\/[0-9a-f-]+$/)

    await page.getByRole('button', { name: '☆ Marcar favorita' }).click()
    await expect(
      page.getByRole('button', { name: '★ Favorita' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: '4 de 5' }).click()

    await page.reload()
    await expect(
      page.getByRole('button', { name: '★ Favorita' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '4 de 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByText('Rápido')).toBeVisible()

    await page.goto(`${base}/recetas`)
    await page.getByRole('button', { name: '★ Favoritas' }).click()
    await expect(page.getByRole('link', { name: title })).toBeVisible()
  })
})

test.describe('plan', () => {
  test.describe.configure({ timeout: 150_000 })
  const admin = adminClient()
  let context: BrowserContext
  let page: Page
  let email: string
  let base: string

  test.beforeEach(async ({ browser }) => {
    email = uniqueEmail('plan')
    base = resolveBaseUrl()
    context = await browser.newContext()
    page = await loginViaMagicLink(context, base, email)
    await completeEmptyOnboarding(page)
    await page.goto(`${base}/plan`)
  })

  test.afterEach(async () => {
    await context.close()
    await deleteSyntheticUser(admin, email)
  })

  test('añadir una receta a un hueco desde el selector lo ocupa', async () => {
    const title = `Plan directo ${Date.now()}`
    await createRecipe(page, base, title)

    await page.goto(`${base}/plan`)
    await page.getByRole('link', { name: /^Añadir / }).first().click()
    await expect(
      page.getByRole('heading', { name: '¿Qué quieres comer?' }),
    ).toBeVisible()
    await page.getByLabel('Buscar una receta').fill(title)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByRole('button', { name: title }).click()
    await page.waitForURL(/\/plan\?semana=/)
    await expect(page.getByRole('link', { name: title })).toBeVisible()
  })

  test('abrir las opciones de una comida planificada no oculta la receta', async () => {
    const title = `Plan con opciones ${Date.now()}`
    await createRecipe(page, base, title)

    await page.goto(`${base}/plan`)
    await page.getByRole('link', { name: /^Añadir / }).first().click()
    const slotUrl = new URL(page.url())
    const fecha = slotUrl.searchParams.get('fecha')!
    const servicio = slotUrl.searchParams.get('servicio') as 'lunch' | 'dinner'
    await page.getByLabel('Buscar una receta').fill(title)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByRole('button', { name: title }).click()
    await page.waitForURL(/\/plan\?semana=/)

    const label = slotLabelOf(fecha, servicio)
    await expect(page.getByRole('link', { name: title })).toBeVisible()
    await page.locator(`summary[aria-label="Opciones de ${label}"]`).click()
    await expect(
      page.getByRole('link', { name: 'Cambiar receta' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: title })).toBeVisible()
  })

  test('cambiar receta, ajustar raciones, mover, eliminar y deshacer solo tocan el hueco objetivo', async () => {
    const titleA = `Plan A ${Date.now()}`
    const titleB = `Plan B ${Date.now()}`
    const titleC = `Plan C ${Date.now()}`
    await createRecipe(page, base, titleA)
    await createRecipe(page, base, titleB)
    await createRecipe(page, base, titleC)

    async function assign(title: string) {
      await page.getByRole('link', { name: /^Añadir / }).first().click()
      const slotUrl = new URL(page.url())
      const fecha = slotUrl.searchParams.get('fecha')!
      const servicio = slotUrl.searchParams.get('servicio') as
        'lunch' | 'dinner'
      await page.getByLabel('Buscar una receta').fill(title)
      await page.getByRole('button', { name: 'Buscar' }).click()
      await page.getByRole('button', { name: title }).click()
      await page.waitForURL(/\/plan\?semana=/)
      return { fecha, servicio }
    }

    await page.goto(`${base}/plan`)
    const slot1 = await assign(titleA)
    const slot2 = await assign(titleB)
    const label1 = slotLabelOf(slot1.fecha, slot1.servicio)
    const label2 = slotLabelOf(slot2.fecha, slot2.servicio)
    const menu1 = () =>
      page
        .locator('.plan-menu')
        .filter({
          has: page.locator(`summary[aria-label="Opciones de ${label1}"]`),
        })

    // Cambiar receta: solo afecta al hueco 1; el hueco 2 permanece intacto.
    await page.locator(`summary[aria-label="Opciones de ${label1}"]`).click()
    await menu1().getByRole('link', { name: 'Cambiar receta' }).click()
    await page.waitForURL(/\/plan\/elegir/)
    await page.getByLabel('Buscar una receta').fill(titleC)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByRole('button', { name: titleC }).click()
    await page.waitForURL(/\/plan\?semana=/)
    await expect(page.getByRole('link', { name: titleC })).toBeVisible()
    await expect(page.getByRole('link', { name: titleB })).toBeVisible()
    await expect(
      page.locator(`summary[aria-label="Opciones de ${label2}"]`),
    ).toBeVisible()

    // Ajustar raciones: persiste tras recargar.
    await page.locator(`summary[aria-label="Opciones de ${label1}"]`).click()
    await menu1().getByLabel('Ajustar raciones').fill('4')
    await menu1().getByRole('button', { name: 'Guardar' }).click()
    await page.waitForURL(/\/plan\?semana=/)
    await expect(page.getByText('4 raciones')).toBeVisible()
    await page.reload()
    await expect(page.getByText('4 raciones')).toBeVisible()

    // Mover a otro día: el origen queda vacío y el destino conserva la comida.
    const movedFecha = addDaysIso(slot1.fecha, 2)
    await page.locator(`summary[aria-label="Opciones de ${label1}"]`).click()
    await menu1().getByLabel('Mover a').fill(movedFecha)
    await menu1().getByRole('button', { name: 'Mover' }).click()
    await page.waitForURL(/\/plan\?semana=/)
    await expect(
      page.locator(`summary[aria-label="Opciones de ${label1}"]`),
    ).toHaveCount(0)
    const labelMoved = slotLabelOf(movedFecha, slot1.servicio)
    const menuMoved = () =>
      page
        .locator('.plan-menu')
        .filter({
          has: page.locator(`summary[aria-label="Opciones de ${labelMoved}"]`),
        })
    await expect(
      page.locator(`summary[aria-label="Opciones de ${labelMoved}"]`),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: titleC })).toBeVisible()
    await expect(page.getByText('4 raciones')).toBeVisible()

    // Eliminar y deshacer: restaura la misma receta y raciones en el mismo hueco.
    await page
      .locator(`summary[aria-label="Opciones de ${labelMoved}"]`)
      .click()
    await menuMoved().getByRole('button', { name: 'Eliminar' }).click()
    await menuMoved().getByRole('button', { name: 'Sí, eliminar' }).click()
    await page.waitForURL(/\/plan\?semana=.*deshacer=/)
    const toast = page.getByRole('status')
    await expect(toast).toContainText(`Hemos quitado ${labelMoved}.`)
    await toast.getByRole('button', { name: 'Deshacer' }).click()
    await page.waitForURL(/\/plan\?semana=/)
    await expect(
      page.locator(`summary[aria-label="Opciones de ${labelMoved}"]`),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: titleC })).toBeVisible()
    await expect(page.getByText('4 raciones')).toBeVisible()
  })

  test('cocinar con revisión solo descuenta en Despensa los productos que quedan marcados', async () => {
    await page.goto(`${base}/despensa`)
    await addPantryItem(page, 'Tomate')
    await addPantryItem(page, 'Cebolla')

    const title = `Sofrito ${Date.now()}`
    await createRecipe(page, base, title, ['Tomate', 'Cebolla'])

    await page.goto(`${base}/plan`)
    await page.getByRole('link', { name: /^Añadir / }).first().click()
    const slotUrl = new URL(page.url())
    const fecha = slotUrl.searchParams.get('fecha')!
    const servicio = slotUrl.searchParams.get('servicio') as 'lunch' | 'dinner'
    await page.getByLabel('Buscar una receta').fill(title)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByRole('button', { name: title }).click()
    await page.waitForURL(/\/plan\?semana=/)

    const label = slotLabelOf(fecha, servicio)
    await page.locator(`summary[aria-label="Opciones de ${label}"]`).click()
    await page.getByRole('link', { name: 'Marcar como cocinada' }).click()
    await page.waitForURL(/\/plan\/cocinar/)
    await expect(
      page.getByRole('heading', { name: `Cocinar «${title}»` }),
    ).toBeVisible()

    const cookRow = (name: string) =>
      page
        .locator('.cook-row')
        .filter({ has: page.getByRole('checkbox', { name }) })
    await cookRow('Tomate')
      .getByRole('combobox')
      .selectOption({ label: 'Agotado' })
    await cookRow('Cebolla').getByRole('checkbox').uncheck()

    await page.getByRole('button', { name: 'Marcar como cocinada' }).click()
    await page.waitForURL(/\/plan\?cocinada=/)
    await expect(page.getByText('✓ Cocinada')).toBeVisible()

    await page.goto(`${base}/despensa`)
    await expect(
      page.getByRole('button', { name: 'Marcar Tomate como terminado' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Marcar Cebolla como terminado' }),
    ).toBeVisible()
  })
})
