export type RecipeDishType =
  'breakfast' | 'starter' | 'main' | 'side' | 'dessert' | 'drink' | 'other'

export type RecipeStatus = 'pending' | 'ready'

export type RecipeCategoryDimension =
  'dish_type' | 'main_ingredient' | 'technique' | 'time' | 'season' | 'mediterranean'

export type RecipeCategory = {
  dimension: RecipeCategoryDimension
  name: string
}

export type RecipePreference = {
  isFavorite: boolean
  rating: number | null
}

export type Recipe = {
  id: string
  title: string
  dishType: RecipeDishType | null
  totalMinutes: number | null
  servings: number | null
  status: RecipeStatus
  isFavorite: boolean
  categories: string[]
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
  recipeCategories: RecipeCategory[]
  preference: RecipePreference
}
