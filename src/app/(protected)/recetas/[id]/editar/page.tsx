import { notFound } from 'next/navigation'

import {
  getVisualFixtureRecipeDetail,
  getVisualFixtureScenario,
} from '@/lib/visual-context/fixtures'
import { getRecipe } from '@/modules/recipes/actions'
import { RecipeEditor } from '@/modules/recipes/RecipeEditor'

export default async function RecipeEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fixture?: string }>
}) {
  const { id } = await params
  const { fixture } = await searchParams
  const scenario = getVisualFixtureScenario(fixture)
  if (scenario) return <RecipeEditor recipe={getVisualFixtureRecipeDetail(scenario)} />
  const recipe = await getRecipe(id)
  if (!recipe) notFound()
  return <RecipeEditor recipe={recipe} />
}
