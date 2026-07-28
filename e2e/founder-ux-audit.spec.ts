import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
  type Response,
} from '@playwright/test'

/**
 * Auditoría UX automática (docs/05-Architecture/E2E-FOUNDER-VALIDATION-DESIGN.md,
 * sección 3). Recorre rutas representativas con fixtures deterministas y
 * registra señales reproducibles; no evalúa estética.
 */

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 },
] as const

const views: { name: string; path: string; button?: string }[] = [
  { name: 'despensa', path: '/despensa' },
  { name: 'despensa-anadir', path: '/despensa', button: '+ Añadir producto' },
  { name: 'compra', path: '/compra' },
  { name: 'compra-revisar', path: '/compra/revisar' },
  { name: 'compra-ticket', path: '/compra/ticket' },
  { name: 'recetas', path: '/recetas' },
  { name: 'recetas-anadir', path: '/recetas', button: 'Añadir receta' },
  { name: 'plan', path: '/plan' },
  { name: 'plan-elegir', path: '/plan/elegir?fecha=2026-07-20&servicio=lunch' },
]

// Estados HTTP que no cuentan como "error técnico" (ninguno esperado hoy,
// pero se deja el hueco documentado por si una ruta empieza a servir un 404
// intencional en el futuro).
const EXPECTED_STATUS_EXCEPTIONS = new Set<number>([])

test.describe.configure({ mode: 'parallel' })

for (const viewport of viewports) {
  test.describe(`auditoría UX @ ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    for (const view of views) {
      test(`${view.path}${view.button ? ` (${view.button})` : ''} @ ${viewport.name}`, async ({
        page,
      }) => {
        const consoleErrors: string[] = []
        const badResponses: string[] = []

        page.on('console', (msg: ConsoleMessage) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text())
        })
        page.on('response', (res: Response) => {
          const status = res.status()
          if (status >= 400 && !EXPECTED_STATUS_EXCEPTIONS.has(status)) {
            badResponses.push(`${status} ${res.url()}`)
          }
        })

        await page.goto(view.path, { waitUntil: 'domcontentloaded' })
        if (view.button) {
          await page.getByRole('button', { name: view.button }).click()
        }
        // Deja que la navegación/mutación termine de asentarse antes de auditar.
        await page.waitForLoadState('networkidle')

        // 1. Error técnico (bloqueante)
        expect(
          consoleErrors,
          `Error técnico de consola en ${view.path} @ ${viewport.name}: ${consoleErrors.join(' | ')}`,
        ).toEqual([])
        expect(
          badResponses,
          `Respuesta 4xx/5xx inesperada en ${view.path} @ ${viewport.name}: ${badResponses.join(' | ')}`,
        ).toEqual([])

        // 2. Pérdida de flujo (bloqueante): sin redirección a /login ni fuera de la ruta esperada.
        const finalPath = new URL(page.url()).pathname
        expect(
          finalPath,
          `Pérdida de flujo en ${view.path} @ ${viewport.name}: acabó en ${finalPath}`,
        ).not.toBe('/login')
        expect(
          finalPath.startsWith(view.path.split('?')[0]),
          `Pérdida de flujo en ${view.path} @ ${viewport.name}: acabó en ${finalPath}`,
        ).toBe(true)

        await auditOverflow(page, view.path, viewport.name)
        if (viewport.name === 'mobile') {
          await auditTouchTargets(page, view.path, viewport.name)
        }
        await auditAccessibleNames(page, view.path, viewport.name)
        await auditFocus(page, view.path, viewport.name)
        await auditFrictionCandidates(page, view.path, viewport.name)
      })
    }
  })
}

// El overlay de desarrollo de Next.js vive bajo <nextjs-portal> (dentro de su
// propio shadow DOM) y no existe para las personas en producción: se excluye
// de toda auditoría de UI real. `closest` no cruza el límite del shadow root,
// así que subimos manualmente por `getRootNode().host`. Se ejecuta dentro del
// navegador vía `page.evaluate`/`locator.evaluate`.
function isInDevOverlay(node: Element | null): boolean {
  while (node) {
    if (node.tagName === 'NEXTJS-PORTAL') return true
    const root = node.getRootNode()
    node = root instanceof ShadowRoot ? root.host : node.parentElement
  }
  return false
}

/** 3. Desbordamiento (alta): scrollWidth > clientWidth fuera de overflow-x intencional. */
async function auditOverflow(page: Page, path: string, viewportName: string) {
  // page.evaluate no comparte closures de Node con el navegador: se manda el
  // código fuente de isInDevOverlay como texto y se reconstruye allí dentro.
  const offenders = await page.evaluate((isInDevOverlaySrc) => {
    const isInDevOverlay = new Function(`return ${isInDevOverlaySrc}`)() as (
      node: Element | null,
    ) => boolean
    const found: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      if (isInDevOverlay(el)) continue
      // El contenido de un <details> cerrado colapsa a una caja 0x0 en pantalla
      // aunque su `display` propio no sea `none` (p. ej. una regla de autor
      // como `display: grid` no anula el colapso de tamaño, solo el valor
      // computado): no cuenta como desbordamiento visible para la persona.
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      if (el.scrollWidth <= el.clientWidth + 1) continue
      const overflowX = getComputedStyle(el).overflowX
      // Cualquier valor salvo 'visible' (el navegador por defecto) contiene el
      // desbordamiento dentro del propio elemento: no se filtra por fuera hacia
      // el layout. Esto también evita falsos positivos con la técnica
      // `sr-only` (overflow: hidden + contenido más ancho que su caja de 1px).
      if (overflowX !== 'visible') continue
      const classAttr = typeof el.className === 'string' ? el.className : ''
      const classSuffix = classAttr
        ? `.${classAttr.trim().split(/\s+/).join('.')}`
        : ''
      found.push(
        `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${classSuffix}`,
      )
    }
    return found.slice(0, 10)
  }, isInDevOverlay.toString())
  expect(
    offenders,
    `Desbordamiento horizontal no intencional en ${path} @ ${viewportName}: ${offenders.join(' | ')}`,
  ).toEqual([])
}

/** 4. Objetivo táctil (alta, solo mobile): controles primarios visibles >= 44x44px. */
async function auditTouchTargets(
  page: Page,
  path: string,
  viewportName: string,
) {
  const controls = page.locator('button, a[href], [role="button"]')
  const count = await controls.count()
  const offenders: string[] = []
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i)
    if (!(await control.isVisible())) continue
    if (await control.evaluate(isInDevOverlay)) continue
    // El título de una comida planificada es un enlace de texto en línea dentro
    // de una fila compacta (WCAG 2.5.8 exime los enlaces en línea del tamaño
    // mínimo); la misma acción de cambiarla está disponible desde "Opciones".
    if (
      await control.evaluate((el) => el.closest('.plan-slot__recipe') !== null)
    )
      continue
    const box = await control.boundingBox()
    if (!box) continue
    // Ignora controles sin superficie real (icono de layout aún en transición, área 0).
    if (box.width === 0 || box.height === 0) continue
    if (box.width < 44 || box.height < 44) {
      const label =
        (await control.textContent())?.trim() ||
        (await control.getAttribute('aria-label')) ||
        '(sin nombre)'
      offenders.push(
        `${label} (${Math.round(box.width)}x${Math.round(box.height)}px)`,
      )
    }
  }
  expect(
    offenders,
    `Objetivo táctil por debajo de 44px en ${path} @ ${viewportName}: ${offenders.join(' | ')}`,
  ).toEqual([])
}

/** 5. Semántica (alta): botones/enlaces/campos visibles deben tener nombre accesible. */
async function auditAccessibleNames(
  page: Page,
  path: string,
  viewportName: string,
) {
  const controls = page.locator('button, a, input, select, textarea')
  const count = await controls.count()
  const offenders: string[] = []
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i)
    if (!(await control.isVisible())) continue
    if (await control.evaluate(isInDevOverlay)) continue
    const type = await control.getAttribute('type')
    if (type === 'hidden') continue
    // Un <input>/<select>/<textarea> también puede tomar su nombre de un
    // <label> asociado (envolvente o por `for`/`id`), que no aparece en su
    // propio textContent (los campos son elementos vacíos).
    const associatedLabelText = await control.evaluate((el) => {
      const wrapping = el.closest('label')
      if (wrapping?.textContent?.trim()) return wrapping.textContent.trim()
      const id = el.getAttribute('id')
      if (id) {
        const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`)
        if (byFor?.textContent?.trim()) return byFor.textContent.trim()
      }
      return ''
    })
    const accessibleName = (
      (await control.getAttribute('aria-label')) ||
      (await control.textContent())?.trim() ||
      associatedLabelText ||
      (await control.getAttribute('placeholder')) ||
      (await control.getAttribute('title')) ||
      (await control.getAttribute('alt')) ||
      ''
    ).trim()
    if (!accessibleName) {
      const tag = await control.evaluate((el) => el.tagName.toLowerCase())
      offenders.push(
        `${tag}${type ? `[type=${type}]` : ''} sin nombre accesible`,
      )
    }
  }
  expect(
    offenders,
    `Elemento sin nombre accesible en ${path} @ ${viewportName}: ${offenders.join(' | ')}`,
  ).toEqual([])
}

/** 6. Foco (alta): Tab debe mover el foco a un elemento visible, no quedarse en body. */
async function auditFocus(page: Page, path: string, viewportName: string) {
  await page.keyboard.press('Tab')
  const focusedIsBody = await page.evaluate(
    () => document.activeElement === document.body,
  )
  expect(
    focusedIsBody,
    `La navegación por teclado no movió el foco en ${path} @ ${viewportName}`,
  ).toBe(false)
}

/**
 * 7. Salida clara / Fricción (candidatas de mejora): no bloquean el test, solo
 * se anotan para revisión humana.
 */
async function auditFrictionCandidates(
  page: Page,
  path: string,
  viewportName: string,
) {
  const hasHeading = await page
    .getByRole('heading')
    .first()
    .isVisible()
    .catch(() => false)
  // `:visible` descarta el logo del panel lateral de escritorio: en móvil está
  // oculto con `display: none` (AppShell.tsx), pero al ser el primer
  // `a[href]` del DOM, `.first()` sin filtro lo detectaba como si fuera la
  // acción principal ausente en todas las pantallas (falso positivo).
  const hasPrimaryAction = await page
    .locator('button:visible, a[href]:visible')
    .first()
    .isVisible()
    .catch(() => false)
  if (!hasHeading || !hasPrimaryAction) {
    const note = `[Salida clara] ${path} @ ${viewportName}: encabezado=${hasHeading} acción principal=${hasPrimaryAction}`
    console.warn(note)
    test.info().annotations.push({ type: 'ux-candidate', description: note })
  }
}
