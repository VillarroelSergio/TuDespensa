import { getPantryListItems } from '@/modules/pantry/actions'
import { PantryWorkspace } from '@/modules/pantry/PantryWorkspace'
import {
  emptyVisualFixture,
  getVisualFixtureScenario,
  visualFixture,
} from '@/lib/visual-context/fixtures'

export default async function PantryPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>
}) {
  const { fixture } = await searchParams
  const scenario = getVisualFixtureScenario(fixture)
  const items = scenario
    ? scenario === 'everyday' ? visualFixture.pantry : emptyVisualFixture.pantry
    : await getPantryListItems()
  return <PantryWorkspace initialItems={items} isVisualFixture={Boolean(scenario)} />
}
