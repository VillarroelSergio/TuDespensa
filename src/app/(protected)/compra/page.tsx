import { getShoppingItems } from '@/modules/shopping/actions'
import { confirmNotice, ticketNotice } from '@/modules/shopping/presentation'
import { ShoppingWorkspace } from '@/modules/shopping/ShoppingWorkspace'
import {
  emptyVisualFixture,
  getVisualFixtureScenario,
  visualFixture,
} from '@/lib/visual-context/fixtures'

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmado?: string; fixture?: string; ticket?: string }>
}) {
  const { confirmado, fixture, ticket } = await searchParams
  const scenario = getVisualFixtureScenario(fixture)
  const items = scenario
    ? scenario === 'everyday' ? visualFixture.shopping : emptyVisualFixture.shopping
    : await getShoppingItems()
  return <ShoppingWorkspace initialItems={items} notice={confirmNotice(confirmado) ?? ticketNotice(ticket)} isVisualFixture={Boolean(scenario)} />
}
