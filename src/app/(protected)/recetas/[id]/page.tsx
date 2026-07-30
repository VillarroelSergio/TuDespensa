import { notFound } from 'next/navigation'

import {
  emptyVisualFixture,
  getVisualFixtureRecipeDetail,
  getVisualFixtureScenario,
  visualFixture,
} from '@/lib/visual-context/fixtures'
import { getIngredientCatalog } from '@/modules/plan/catalog'
import { getPantryListItems } from '@/modules/pantry/actions'
import { prioritizePantryItems } from '@/modules/pantry/presentation'
import { getRecipe } from '@/modules/recipes/actions'
import { RecipeDetailView } from '@/modules/recipes/RecipeDetailView'

export default async function RecipeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fixture?: string }>
}) {
  const { id } = await params
  const { fixture } = await searchParams
  const scenario = getVisualFixtureScenario(fixture)
  if (scenario) {
    const pantryItems =
      scenario === 'everyday' ? visualFixture.pantry : emptyVisualFixture.pantry
    return (
      <RecipeDetailView
        recipe={getVisualFixtureRecipeDetail(scenario)}
        pantryAvailability={prioritizePantryItems(pantryItems).map((item) => ({
          name: item.name,
          status: item.status,
        }))}
      />
    )
  }
  const [recipe, pantryItems, catalog] = await Promise.all([
    getRecipe(id),
    getPantryListItems(),
    getIngredientCatalog(),
  ])
  if (!recipe) notFound()
  const pantryAvailability = prioritizePantryItems(pantryItems).map((item) => ({
    name: item.name,
    status: item.status,
  }))
  return (
    <RecipeDetailView
      recipe={recipe}
      pantryAvailability={pantryAvailability}
      catalog={catalog}
    />
  )
}
