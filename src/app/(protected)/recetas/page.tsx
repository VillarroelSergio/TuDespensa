import { getRecipes } from '@/modules/recipes/actions'
import { RecipesLibrary } from '@/modules/recipes/RecipesLibrary'

export default async function RecipesPage() {
  const recipes = await getRecipes()
  return <RecipesLibrary initialRecipes={recipes} />
}
