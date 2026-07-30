import { AppShell } from '@/components/ui/AppShell'
import { getHouseholdManagement } from '@/modules/household/actions'
import { HouseholdManager } from '@/modules/household/HouseholdManager'
import {
  emptyVisualFixture,
  getVisualFixtureScenario,
  visualFixture,
} from '@/lib/visual-context/fixtures'

export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>
}) {
  const { fixture } = await searchParams
  const scenario = getVisualFixtureScenario(fixture)
  const data = scenario
    ? scenario === 'everyday'
      ? visualFixture.household
      : emptyVisualFixture.household
    : await getHouseholdManagement()
  return (
    <AppShell current="hogar" contentClassName="household-page">
      {data ? (
        <HouseholdManager data={data} isVisualFixture={Boolean(scenario)} />
      ) : (
        <section className="household-manager">
          <h1>Hogar</h1>
          <p>No hemos podido cargar tu hogar. Inténtalo de nuevo.</p>
        </section>
      )}
    </AppShell>
  )
}
