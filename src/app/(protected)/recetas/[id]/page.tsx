import { notFound } from 'next/navigation'

import { getPantryListItems } from '@/modules/pantry/actions'
import { prioritizePantryItems } from '@/modules/pantry/presentation'
import { getRecipe } from '@/modules/recipes/actions'
import { RecipeDetailView } from '@/modules/recipes/RecipeDetailView'

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [recipe, pantryItems] = await Promise.all([
    getRecipe(id),
    getPantryListItems(),
  ])
  if (!recipe) notFound()
  const pantryItemNames = prioritizePantryItems(pantryItems)
    .filter((item) => item.status !== 'out')
    .map((item) => item.name)
  return <RecipeDetailView recipe={recipe} pantryItemNames={pantryItemNames} />
}
