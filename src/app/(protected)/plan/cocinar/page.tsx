import Link from 'next/link'

import { AppShell } from '@/components/ui/AppShell'
import {
  getVisualFixtureCookPreview,
  getVisualFixtureScenario,
} from '@/lib/visual-context/fixtures'
import { getCookPreview } from '@/modules/plan/actions'
import { CookReview } from '@/modules/plan/CookReview'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function CookPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; servicio?: string; fixture?: string }>
}) {
  const { fecha, servicio, fixture } = await searchParams
  const valid =
    fecha &&
    ISO_DATE.test(fecha) &&
    (servicio === 'lunch' || servicio === 'dinner')
  const scenario = getVisualFixtureScenario(fixture)
  const preview = valid
    ? scenario
      ? getVisualFixtureCookPreview(fecha, servicio, scenario)
      : await getCookPreview(fecha, servicio)
    : null

  if (!preview) {
    return (
      <AppShell current="plan" contentClassName="cook-page">
        {/* Falta el <h1>: una pantalla sin encabezado deja a quien usa lector
            de pantalla sin saber dónde ha aterrizado. */}
        <section aria-labelledby="cook-empty-title">
          <Link className="cook-back" href="/plan">
            <span aria-hidden="true">←</span> Volver al plan
          </Link>
          <header className="cook-header">
            <h1 id="cook-empty-title">Cocinar</h1>
          </header>
          <p className="shopping-empty">
            No hay ninguna comida que cocinar aquí.{' '}
            <Link href="/plan">Volver al plan</Link>.
          </p>
        </section>
      </AppShell>
    )
  }

  return <CookReview preview={preview} visualFixture={Boolean(scenario)} />
}
