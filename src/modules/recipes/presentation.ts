import { matches } from '@/modules/plan/suggestions'

import type {
  Recipe,
  RecipeCategoryDimension,
  RecipeDishType,
  RecipeIngredient,
} from './types'

export const CATEGORY_DIMENSION_LABELS: Record<
  RecipeCategoryDimension,
  string
> = {
  dish_type: 'Tipo de plato',
  main_ingredient: 'Ingrediente principal',
  technique: 'Técnica',
  time: 'Tiempo',
  season: 'Temporada',
  mediterranean: 'Mediterránea',
}

export const CATEGORY_DIMENSION_OPTIONS = Object.entries(
  CATEGORY_DIMENSION_LABELS,
).map(([value, label]) => ({ value: value as RecipeCategoryDimension, label }))

// ponytail: unidades hardcodeadas; es un enum cerrado con CHECK en BD (unit,g,kg,ml,l).
export const UNIT_OPTIONS = [
  { value: 'unit', label: 'uds.' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'l', label: 'l' },
] as const

function unitLabel(code: string | null): string {
  return UNIT_OPTIONS.find((option) => option.value === code)?.label ?? ''
}

export function formatIngredient(ingredient: RecipeIngredient): string {
  const amount = [ingredient.quantity, unitLabel(ingredient.unitCode)]
    .filter((part) => part !== null && part !== '')
    .join(' ')
  return amount ? `${amount} · ${ingredient.name}` : ingredient.name
}

// Mismo criterio que Plan y «cocinar»: comparar por subcadena normalizada, no
// solo exacto+singular. Con el nombre ya limpio («cebolla» en vez de «1/4
// cebolla») esto detecta «Cebolla» / «Cebollas» de la despensa.
export function isIngredientInPantry(
  ingredientName: string,
  pantryNames: string[],
): boolean {
  return pantryNames.some((food) => matches(ingredientName, food))
}

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

// ponytail: filtra por título y categoría/favorito; la búsqueda por ingrediente
// llega cuando los ingredientes se carguen con la tarjeta.
export function filterRecipes(
  recipes: Recipe[],
  term: string,
  options: {
    favoritesOnly?: boolean
    category?: string
    dishType?: RecipeDishType
  } = {},
): Recipe[] {
  const query = term.trim().toLocaleLowerCase('es')
  const matched = recipes.filter((recipe) => {
    if (options.favoritesOnly && !recipe.isFavorite) return false
    if (options.category && !recipe.categories.includes(options.category))
      return false
    if (options.dishType && recipe.dishType !== options.dishType) return false
    return query ? recipe.title.toLocaleLowerCase('es').includes(query) : true
  })
  return [...matched].sort((left, right) =>
    left.title.localeCompare(right.title, 'es'),
  )
}

export function availableCategories(recipes: Recipe[]): string[] {
  return [...new Set(recipes.flatMap((recipe) => recipe.categories))].sort(
    (left, right) => left.localeCompare(right, 'es'),
  )
}
