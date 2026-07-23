import { getCheckoutPreview } from '@/modules/shopping/actions'
import { CheckoutReview } from '@/modules/shopping/CheckoutReview'
import {
  emptyVisualFixture,
  getVisualFixtureScenario,
  visualFixture,
} from '@/lib/visual-context/fixtures'

export default async function CheckoutReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>
}) {
  const { fixture } = await searchParams
  const scenario = getVisualFixtureScenario(fixture)
  const lines = scenario
    ? scenario === 'everyday' ? visualFixture.checkout : emptyVisualFixture.checkout
    : await getCheckoutPreview()
  return <CheckoutReview initialLines={lines} isVisualFixture={Boolean(scenario)} />
}
