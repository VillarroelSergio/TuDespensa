import type { Recipe, RecipeDishType } from './types'

const DISH_TYPE_LABELS: Record<RecipeDishType, string> = {
  breakfast: 'Desayuno',
  starter: 'Entrante',
  main: 'Principal',
  side: 'Guarnición',
  dessert: 'Postre',
  drink: 'Bebida',
  other: 'Otro',
}

export const DISH_TYPE_OPTIONS = Object.entries(DISH_TYPE_LABELS).map(
  ([value, label]) => ({ value: value as RecipeDishType, label }),
)

export function dishTypeLabel(dishType: RecipeDishType | null): string | null {
  return dishType ? DISH_TYPE_LABELS[dishType] : null
}

export function timeLabel(totalMinutes: number | null): string | null {
  return totalMinutes && totalMinutes > 0 ? `${totalMinutes} min` : null
}

// ponytail: filtra por título; la búsqueda por ingrediente llega en 4B, cuando
// los ingredientes se cargan con la receta.
export function filterRecipes(recipes: Recipe[], term: string): Recipe[] {
  const query = term.trim().toLocaleLowerCase('es')
  const matched = query
    ? recipes.filter((recipe) =>
        recipe.title.toLocaleLowerCase('es').includes(query),
      )
    : recipes
  return [...matched].sort((left, right) =>
    left.title.localeCompare(right.title, 'es'),
  )
}
