import { getPantryListItems } from '@/modules/pantry/actions'
import { PantryWorkspace } from '@/modules/pantry/PantryWorkspace'
import {
  emptyVisualFixture,
  getVisualFixtureScenario,
  visualFixture,
} from '@/lib/visual-context/fixtures'
import { withPhaseTiming } from '@/lib/observability/logPhaseDuration'

export default async function PantryPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>
}) {
  const { fixture } = await searchParams
  const scenario = getVisualFixtureScenario(fixture)
  const items = scenario
    ? scenario === 'everyday' ? visualFixture.pantry : emptyVisualFixture.pantry
    : await withPhaseTiming('despensa.getPantryListItems', getPantryListItems)
  return <PantryWorkspace initialItems={items} isVisualFixture={Boolean(scenario)} />
}
