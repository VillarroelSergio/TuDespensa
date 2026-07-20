import { redirect } from 'next/navigation'

import { getSuggestions } from '@/modules/plan/actions'
import { ChooseRecipeView } from '@/modules/plan/ChooseRecipeView'
import type { MealType } from '@/modules/plan/types'
import { getRecipes } from '@/modules/recipes/actions'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function ChooseRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; servicio?: string; q?: string }>
}) {
  const { fecha, servicio, q } = await searchParams
  // Sin un hueco válido esta vista no significa nada: volvemos al plan.
  if (
    !fecha ||
    !ISO_DATE.test(fecha) ||
    (servicio !== 'lunch' && servicio !== 'dinner')
  ) {
    redirect('/plan')
  }

  const [recipes, suggestions] = await Promise.all([
    getRecipes(),
    getSuggestions(fecha),
  ])

  return (
    <ChooseRecipeView
      mealDate={fecha}
      mealType={servicio as MealType}
      query={q?.trim() ?? ''}
      recipes={recipes}
      suggestions={suggestions}
    />
  )
}
