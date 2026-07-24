import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'mobile', viewport: { width: 390, height: 844 } },
  { name: 'tablet', viewport: { width: 768, height: 1024 } },
  { name: 'desktop', viewport: { width: 1440, height: 1000 } },
] as const

const views = [
  { path: '/login', heading: 'Acceso de desarrollo' },
  { path: '/onboarding', heading: 'Organiza la comida de casa' },
  { path: '/despensa', heading: 'Despensa' },
  { path: '/compra', heading: 'Compra' },
  { path: '/compra/revisar', heading: 'Revisa tu compra' },
  { path: '/recetas', heading: 'Recetas' },
  { path: '/plan', heading: 'Plan' },
  {
    path: '/plan/elegir?fecha=2026-07-20&servicio=lunch',
    heading: '¿Qué quieres comer?',
  },
] as const

for (const { name, viewport } of viewports) {
  test.describe(`navegación visible en ${name}`, () => {
    test.use({ viewport })

    for (const view of views) {
      test(`${view.path} muestra su pantalla principal`, async ({ page }) => {
        await page.goto(view.path)
        await expect(
          page.getByRole('heading', { name: view.heading }),
        ).toBeVisible()
        await expect(page.locator('body')).not.toContainText(
          'Application error',
        )
      })
    }

    test('la navegación principal llega a las cuatro áreas', async ({
      page,
    }) => {
      await page.goto('/despensa')
      for (const [name, path] of [
        ['Plan', '/plan'],
        ['Recetas', '/recetas'],
        ['Compra', '/compra'],
        ['Despensa', '/despensa'],
      ] as const) {
        // El panel de depuración de Next.js se superpone a la barra fija en
        // desarrollo. Activamos el enlace real por DOM, sin depender de esa
        // capa que no existe para las personas en producción.
        await page
          .getByRole('link', { name, exact: true })
          .last()
          .evaluate((link: HTMLAnchorElement) => link.click())
        await expect(page).toHaveURL(new RegExp(`${path}$`))
      }
    })

    test('los formularios se abren sin perder la pantalla', async ({
      page,
    }) => {
      await page.goto('/despensa')
      await page.getByRole('button', { name: '+ Añadir producto' }).click()
      await expect(
        page.getByRole('heading', { name: 'Añadir producto' }),
      ).toBeVisible()

      await page.goto('/recetas')
      await page.getByRole('button', { name: 'Añadir receta' }).click()
      await expect(page.getByLabel('Nombre de la receta')).toBeVisible()
    })
  })
}
