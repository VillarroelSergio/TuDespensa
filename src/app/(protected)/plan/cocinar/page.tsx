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
        <section className="cook-empty-state">
          <a className="cook-back" href="/plan">
            ← Volver al plan
          </a>
          <p className="shopping-empty">
            No hay ninguna comida que cocinar aquí.{' '}
            <a href="/plan">Volver al plan</a>.
          </p>
        </section>
      </AppShell>
    )
  }

  return <CookReview preview={preview} visualFixture={Boolean(scenario)} />
}
