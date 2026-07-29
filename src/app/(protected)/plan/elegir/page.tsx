import { redirect } from 'next/navigation'

import { getSuggestions } from '@/modules/plan/actions'
import { ChooseRecipeView } from '@/modules/plan/ChooseRecipeView'
import type { MealType } from '@/modules/plan/types'
import {
  emptyVisualFixture,
  getVisualFixtureScenario,
  visualFixture,
} from '@/lib/visual-context/fixtures'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function ChooseRecipePage({
  searchParams,
}: {
  searchParams: Promise<{
    fecha?: string
    servicio?: string
    q?: string
    fixture?: string
  }>
}) {
  const { fecha, servicio, q, fixture } = await searchParams
  // Sin un hueco válido esta vista no significa nada: volvemos al plan.
  if (
    !fecha ||
    !ISO_DATE.test(fecha) ||
    (servicio !== 'lunch' && servicio !== 'dinner')
  ) {
    redirect('/plan')
  }

  const scenario = getVisualFixtureScenario(fixture)
  const options = scenario
    ? scenario === 'everyday'
      ? {
          recipes: visualFixture.recipes,
          suggestions: visualFixture.suggestions,
          recommended: [],
        }
      : {
          recipes: emptyVisualFixture.recipes,
          suggestions: emptyVisualFixture.suggestions,
          recommended: [],
        }
    : await getSuggestions(fecha)

  return (
    <ChooseRecipeView
      mealDate={fecha}
      mealType={servicio as MealType}
      query={q?.trim() ?? ''}
      recipes={options.recipes}
      suggestions={options.suggestions}
      recommended={options.recommended}
    />
  )
}
