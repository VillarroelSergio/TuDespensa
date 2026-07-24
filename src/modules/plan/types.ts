export type MealType = 'lunch' | 'dinner'

export type PlannedMeal = {
  mealDate: string
  mealType: MealType
  recipeId: string
  title: string
  totalMinutes: number | null
  servings: number | null
  /** Fecha de cocinado (Fase 8); null si aún no se ha cocinado. */
  cookedAt: string | null
}

export type PlanSlot = {
  mealDate: string
  mealType: MealType
  meal: PlannedMeal | null
}

export type PlanDay = {
  mealDate: string
  slots: PlanSlot[]
}
