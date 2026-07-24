import { notFound } from 'next/navigation'

import { getRecipe } from '@/modules/recipes/actions'
import { RecipeEditor } from '@/modules/recipes/RecipeEditor'

export default async function RecipeEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const recipe = await getRecipe(id)
  if (!recipe) notFound()
  return <RecipeEditor recipe={recipe} />
}
