export type RecipeDishType =
  'breakfast' | 'starter' | 'main' | 'side' | 'dessert' | 'drink' | 'other'

export type Recipe = {
  id: string
  title: string
  dishType: RecipeDishType | null
  totalMinutes: number | null
  servings: number | null
}
