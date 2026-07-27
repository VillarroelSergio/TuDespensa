import { notFound } from 'next/navigation'

import { getIngredientCatalog } from '@/modules/plan/catalog'
import { getPantryListItems } from '@/modules/pantry/actions'
import { prioritizePantryItems } from '@/modules/pantry/presentation'
import { getRecipe } from '@/modules/recipes/actions'
import { RecipeDetailView } from '@/modules/recipes/RecipeDetailView'

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
