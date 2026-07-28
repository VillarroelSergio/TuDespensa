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

/** Vocabulario curado para el único ingrediente protagonista de una receta. */
export const MAIN_INGREDIENT_OPTIONS = [
  { value: 'Pasta', label: 'Pasta' },
  { value: 'Verduras', label: 'Verduras' },
  { value: 'Legumbres', label: 'Legumbres' },
  { value: 'Arroz y cereales', label: 'Arroz y cereales' },
  { value: 'Huevo', label: 'Huevo' },
  { value: 'Aves', label: 'Aves' },
  { value: 'Carne', label: 'Carne' },
  { value: 'Pescado', label: 'Pescado' },
] as const

/** Atajos para decidir qué cocinar; se reutilizan también al añadir al Plan. */
export const QUICK_MAIN_INGREDIENT_FILTERS = MAIN_INGREDIENT_OPTIONS.filter(
  (option) =>
    ['Pasta', 'Verduras', 'Legumbres', 'Carne', 'Pescado'].includes(
      option.value,
    ),
)

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

function normalizeFoodName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function sameCategory(left: string, right: string): boolean {
  return normalizeFoodName(left) === normalizeFoodName(right)
}

function nameVariants(name: string): string[] {
  const normalized = normalizeFoodName(name)
  return normalized.endsWith('s')
    ? [normalized, normalized.slice(0, -1)]
    : [normalized]
}

// ponytail: heurística de singular/plural con acentos, no el matching por
// trigramas de la base de datos (private.resolve_household_food); basta para
// un aviso visual al revisar los ingredientes de una receta.
export function pantryNameSet(names: string[]): Set<string> {
  return new Set(names.flatMap(nameVariants))
}

export function isIngredientInPantry(
  ingredientName: string,
  pantryNames: Set<string>,
): boolean {
  return nameVariants(ingredientName).some((variant) => pantryNames.has(variant))
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
  options: { favoritesOnly?: boolean; category?: string } = {},
): Recipe[] {
  const query = term.trim().toLocaleLowerCase('es')
  const matched = recipes.filter((recipe) => {
    if (options.favoritesOnly && !recipe.isFavorite) return false
    if (
      options.category &&
      !recipe.categories.some((category) =>
        sameCategory(category, options.category ?? ''),
      )
    )
      return false
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
