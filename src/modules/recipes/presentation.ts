import { matches, type CatalogEntry } from '@/modules/plan/suggestions'

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

const CANONICAL_FACTOR: Record<string, number> = {
  unit: 1,
  g: 0.001,
  kg: 1,
  ml: 0.001,
  l: 1,
}

function canonicalAmount(
  quantity: number | null,
  unitCode: string | null,
): number | null {
  if (quantity === null || !unitCode) return quantity
  const factor = CANONICAL_FACTOR[unitCode]
  return factor === undefined
    ? quantity
    : Math.round(quantity * factor * 1000) / 1000
}

export function formatIngredient(ingredient: RecipeIngredient): string {
  const amount = [
    canonicalAmount(ingredient.quantity, ingredient.unitCode),
    ingredient.quantity === null ? '' : 'uds.',
  ]
    .filter((part) => part !== null && part !== '')
    .join(' ')
  return amount ? `${amount} · ${ingredient.name}` : ingredient.name
}

export type IngredientAvailability = 'owned' | 'low' | 'missing'

export type PantryAvailabilityItem = {
  name: string
  status: 'out' | 'low' | 'available'
}

// Mismo criterio que Plan y «cocinar»: comparar por subcadena normalizada, no
// solo exacto+singular. Con el nombre ya limpio («cebolla» en vez de «1/4
// cebolla») esto detecta «Cebolla» / «Cebollas» de la despensa. Un producto
// «out» cuenta como si no estuviera (igual que antes); «low» se distingue
// para el semáforo en vez de mezclarse con «lo tienes de sobra».
export function ingredientAvailability(
  ingredientName: string,
  pantryItems: PantryAvailabilityItem[],
  catalog: CatalogEntry[] = [],
): IngredientAvailability {
  const found = pantryItems.find(
    (item) =>
      item.status !== 'out' && matches(ingredientName, item.name, catalog),
  )
  if (!found) return 'missing'
  return found.status === 'low' ? 'low' : 'owned'
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

/** Compara texto ignorando mayúsculas y tildes (buscar "jamon" encuentra "jamón"). */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim()
}

// Las 8 categorías fijas del filtro por ingrediente principal (dimensión
// `main_ingredient`). Se guardan como `recipe_categories.name` normales, sin
// enum en BD: son sugerencias de nombre, no un valor cerrado por columna.
export const MAIN_INGREDIENT_CATEGORIES = [
  'Pasta',
  'Verduras',
  'Legumbres',
  'Arroz y cereales',
  'Huevo',
  'Aves',
  'Carne',
  'Pescado',
] as const

/** Subconjunto que se muestra como chip de un toque (el resto vive en "Todas las categorías"). */
export const QUICK_MAIN_INGREDIENT_CATEGORIES: readonly string[] = [
  'Pasta',
  'Verduras',
  'Legumbres',
  'Carne',
  'Pescado',
]

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
  const query = normalizeText(term)
  const category = options.category ? normalizeText(options.category) : null
  const matched = recipes.filter((recipe) => {
    if (options.favoritesOnly && !recipe.isFavorite) return false
    if (
      category &&
      !recipe.categories.some((name) => normalizeText(name) === category)
    )
      return false
    if (options.dishType && recipe.dishType !== options.dishType) return false
    return query ? normalizeText(recipe.title).includes(query) : true
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
