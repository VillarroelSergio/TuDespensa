export type RecipeDishType =
  'breakfast' | 'starter' | 'main' | 'side' | 'dessert' | 'drink' | 'other'

export type RecipeStatus = 'pending' | 'ready'

export type Recipe = {
  id: string
  title: string
  dishType: RecipeDishType | null
  totalMinutes: number | null
  servings: number | null
  status: RecipeStatus
}

export type RecipeIngredient = {
  position: number
  name: string
  quantity: number | null
  unitCode: string | null
}

export type RecipeStep = {
  position: number
  instruction: string
}

export type RecipeDetail = Recipe & {
  version: number
  sourceUrl: string | null
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
}
