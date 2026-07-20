import { notFound } from 'next/navigation'

import { getRecipe } from '@/modules/recipes/actions'
import { RecipeDetailView } from '@/modules/recipes/RecipeDetailView'

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const recipe = await getRecipe(id)
  if (!recipe) notFound()
  return <RecipeDetailView recipe={recipe} />
}
