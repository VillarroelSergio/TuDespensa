import { getRecipes } from '@/modules/recipes/actions'
import { RecipesLibrary } from '@/modules/recipes/RecipesLibrary'
import {
  emptyVisualFixture,
  getVisualFixtureScenario,
  visualFixture,
} from '@/lib/visual-context/fixtures'

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>
}) {
  const { fixture } = await searchParams
  const scenario = getVisualFixtureScenario(fixture)
  const recipes = scenario
    ? scenario === 'everyday' ? visualFixture.recipes : emptyVisualFixture.recipes
    : await getRecipes()
  return <RecipesLibrary initialRecipes={recipes} isVisualFixture={Boolean(scenario)} />
}
