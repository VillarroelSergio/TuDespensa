import type { PantryListItem } from '@/modules/pantry/presentation'
import type { PlannedMeal } from '@/modules/plan/types'
import type { MealType } from '@/modules/plan/types'
import type { Suggestion } from '@/modules/plan/suggestions'
import type { CookPreview } from '@/modules/plan/actions'
import type { Recipe } from '@/modules/recipes/types'
import type { CheckoutLine, ShoppingItem } from '@/modules/shopping/types'

export type VisualFixtureScenario = 'empty' | 'everyday'

const recipeIds = {
  tortilla: 'fixture-recipe-tortilla-calabacin',
  garbanzos: 'fixture-recipe-ensalada-garbanzos',
  salmon: 'fixture-recipe-salmon-horno',
  pasta: 'fixture-recipe-pasta-tomate',
  arroz: 'fixture-recipe-arroz-verduras',
  crema: 'fixture-recipe-crema-calabacin',
  yogur: 'fixture-recipe-yogur-fruta',
  lentejas: 'fixture-recipe-lentejas',
} as const

function addDays(isoDate: string, amount: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

/**
 * El query param solo sirve para desarrollo y para datos sintéticos locales.
 * En producción nunca sustituye la lectura real del hogar.
 */
export function getVisualFixtureScenario(
  value: string | undefined,
  environment = process.env.NODE_ENV,
): VisualFixtureScenario | null {
  if (environment !== 'development') return null
  return value === 'empty' || value === 'everyday' ? value : null
}

const pantry: PantryListItem[] = [
  {
    id: 'fixture-pantry-tomates',
    foodId: 'fixture-food-tomates',
    name: 'Tomates cherry',
    version: 1,
    trackingMode: 'measure',
    approximateState: null,
    attentionState: 'low',
    quantity: 350,
    unitCode: 'g',
    consumeSoon: true,
  },
  {
    id: 'fixture-pantry-calabacines',
    foodId: 'fixture-food-calabacines',
    name: 'Calabacines',
    version: 1,
    trackingMode: 'approximate',
    approximateState: 'low',
    attentionState: 'low',
    quantity: null,
    unitCode: null,
    consumeSoon: true,
  },
  {
    id: 'fixture-pantry-espinacas',
    foodId: 'fixture-food-espinacas',
    name: 'Espinacas',
    version: 1,
    trackingMode: 'approximate',
    approximateState: 'out',
    attentionState: 'none',
    quantity: null,
    unitCode: null,
  },
  {
    id: 'fixture-pantry-yogur',
    foodId: 'fixture-food-yogur',
    name: 'Yogur griego',
    version: 1,
    trackingMode: 'units',
    approximateState: null,
    attentionState: 'low',
    quantity: 2,
    unitCode: 'unit',
    consumeSoon: true,
  },
  {
    id: 'fixture-pantry-huevos',
    foodId: 'fixture-food-huevos',
    name: 'Huevos',
    version: 1,
    trackingMode: 'units',
    approximateState: null,
    attentionState: 'none',
    quantity: 6,
    unitCode: 'unit',
  },
  {
    id: 'fixture-pantry-salmon',
    foodId: 'fixture-food-salmon',
    name: 'Salmón',
    version: 1,
    trackingMode: 'measure',
    approximateState: null,
    attentionState: 'none',
    quantity: 400,
    unitCode: 'g',
  },
  {
    id: 'fixture-pantry-garbanzos',
    foodId: 'fixture-food-garbanzos',
    name: 'Garbanzos cocidos',
    version: 1,
    trackingMode: 'units',
    approximateState: null,
    attentionState: 'none',
    quantity: 2,
    unitCode: 'unit',
  },
  {
    id: 'fixture-pantry-arroz',
    foodId: 'fixture-food-arroz',
    name: 'Arroz integral',
    version: 1,
    trackingMode: 'measure',
    approximateState: null,
    attentionState: 'none',
    quantity: 1,
    unitCode: 'kg',
  },
  {
    id: 'fixture-pantry-leche',
    foodId: 'fixture-food-leche',
    name: 'Leche',
    version: 1,
    trackingMode: 'measure',
    approximateState: null,
    attentionState: 'none',
    quantity: 1.5,
    unitCode: 'l',
  },
  {
    id: 'fixture-pantry-limones',
    foodId: 'fixture-food-limones',
    name: 'Limones',
    version: 1,
    trackingMode: 'units',
    approximateState: null,
    attentionState: 'none',
    quantity: 3,
    unitCode: 'unit',
  },
  {
    id: 'fixture-pantry-aceite',
    foodId: 'fixture-food-aceite',
    name: 'Aceite de oliva',
    version: 1,
    trackingMode: 'measure',
    approximateState: null,
    attentionState: 'none',
    quantity: 750,
    unitCode: 'ml',
  },
  {
    id: 'fixture-pantry-cebolla',
    foodId: 'fixture-food-cebolla',
    name: 'Cebollas',
    version: 1,
    trackingMode: 'approximate',
    approximateState: 'plenty',
    attentionState: 'none',
    quantity: null,
    unitCode: null,
  },
]

const recipes: Recipe[] = [
  {
    id: recipeIds.tortilla,
    title: 'Tortilla de calabacín',
    dishType: 'main',
    totalMinutes: 25,
    servings: 2,
    status: 'ready',
    isFavorite: true,
    categories: ['Mediterránea', 'Rápida', 'Verduras'],
  },
  {
    id: recipeIds.garbanzos,
    title: 'Ensalada templada de garbanzos',
    dishType: 'main',
    totalMinutes: 20,
    servings: 2,
    status: 'ready',
    isFavorite: true,
    categories: ['Mediterránea', 'Legumbres', 'Rápida'],
  },
  {
    id: recipeIds.salmon,
    title: 'Salmón al horno con limón',
    dishType: 'main',
    totalMinutes: 35,
    servings: 2,
    status: 'ready',
    isFavorite: true,
    categories: ['Mediterránea', 'Pescado'],
  },
  {
    id: recipeIds.pasta,
    title: 'Pasta con tomate y espinacas',
    dishType: 'main',
    totalMinutes: 30,
    servings: 2,
    status: 'ready',
    isFavorite: false,
    categories: ['Rápida', 'Vegetariana'],
  },
  {
    id: recipeIds.arroz,
    title: 'Arroz integral con verduras',
    dishType: 'main',
    totalMinutes: 40,
    servings: 2,
    status: 'ready',
    isFavorite: false,
    categories: ['Mediterránea', 'Verduras'],
  },
  {
    id: recipeIds.crema,
    title: 'Crema de calabacín',
    dishType: 'starter',
    totalMinutes: 30,
    servings: 2,
    status: 'ready',
    isFavorite: false,
    categories: ['Verduras', 'Ligera'],
  },
  {
    id: recipeIds.yogur,
    title: 'Yogur con fruta y nueces',
    dishType: 'breakfast',
    totalMinutes: 5,
    servings: 2,
    status: 'ready',
    isFavorite: true,
    categories: ['Rápida', 'Desayuno'],
  },
  {
    id: recipeIds.lentejas,
    title: 'Lentejas especiadas',
    dishType: 'main',
    totalMinutes: 50,
    servings: 2,
    status: 'pending',
    isFavorite: false,
    categories: ['Legumbres'],
  },
]

const shopping: ShoppingItem[] = [
  {
    id: 'fixture-shopping-espinacas',
    name: 'Espinacas',
    source: 'plan',
    isPurchased: true,
    version: 1,
    quantity: 200,
    unitCode: 'g',
  },
  {
    id: 'fixture-shopping-pan',
    name: 'Pan integral',
    source: 'manual',
    isPurchased: true,
    version: 1,
    quantity: 1,
    unitCode: 'unit',
  },
  {
    id: 'fixture-shopping-yogur',
    name: 'Yogur griego',
    source: 'pantry',
    isPurchased: true,
    version: 1,
    quantity: 4,
    unitCode: 'unit',
  },
  {
    id: 'fixture-shopping-pasta',
    name: 'Pasta corta',
    source: 'plan',
    isPurchased: false,
    version: 1,
    quantity: 500,
    unitCode: 'g',
  },
  {
    id: 'fixture-shopping-fruta',
    name: 'Fruta de temporada',
    source: 'manual',
    isPurchased: false,
    version: 1,
    quantity: null,
    unitCode: null,
  },
  {
    id: 'fixture-shopping-queso',
    name: 'Queso feta',
    source: 'plan',
    isPurchased: false,
    version: 1,
    quantity: 150,
    unitCode: 'g',
  },
]

const checkout: CheckoutLine[] = [
  {
    itemId: 'fixture-shopping-espinacas',
    version: 1,
    name: 'Espinacas',
    action: 'add',
    suggestedZone: 'fridge',
    quantity: 1,
  },
  {
    itemId: 'fixture-shopping-pan',
    version: 1,
    name: 'Pan integral',
    action: 'add',
    suggestedZone: 'pantry',
    quantity: 2,
  },
  {
    itemId: 'fixture-shopping-yogur',
    version: 1,
    name: 'Yogur griego',
    action: 'restore',
    suggestedZone: null,
    quantity: null,
  },
]

const suggestions: Suggestion[] = [
  {
    recipeId: recipeIds.tortilla,
    title: 'Tortilla de calabacín',
    totalMinutes: 25,
    reason: 'Aprovecha Calabacines',
    missing: [],
    score: 89,
    factors: [],
  },
  {
    recipeId: recipeIds.garbanzos,
    title: 'Ensalada templada de garbanzos',
    totalMinutes: 20,
    reason: 'Lista en 20 min',
    missing: ['Queso feta'],
    score: 74,
    factors: [],
  },
  {
    recipeId: recipeIds.pasta,
    title: 'Pasta con tomate y espinacas',
    totalMinutes: 30,
    reason: 'Para variar esta semana',
    missing: ['Pasta corta', 'Espinacas'],
    score: 61,
    factors: [],
  },
]

const weekPlan = [
  {
    recipeId: recipeIds.tortilla,
    mealType: 'dinner' as const,
    cookedAt: '2026-07-20T20:15:00.000Z',
  },
  { recipeId: recipeIds.garbanzos, mealType: 'lunch' as const, cookedAt: null },
  { recipeId: recipeIds.salmon, mealType: 'dinner' as const, cookedAt: null },
  { recipeId: recipeIds.arroz, mealType: 'lunch' as const, cookedAt: null },
  { recipeId: recipeIds.crema, mealType: 'dinner' as const, cookedAt: null },
  { recipeId: recipeIds.pasta, mealType: 'dinner' as const, cookedAt: null },
  { recipeId: recipeIds.yogur, mealType: 'lunch' as const, cookedAt: null },
]

export function getVisualFixtureWeekMeals(
  startIso: string,
  scenario: VisualFixtureScenario = 'everyday',
): PlannedMeal[] {
  if (scenario === 'empty') return []
  return weekPlan.map((entry, index) => {
    const recipe = recipes.find((candidate) => candidate.id === entry.recipeId)
    if (!recipe)
      throw new Error(`Missing visual fixture recipe: ${entry.recipeId}`)
    return {
      mealDate: addDays(startIso, index),
      mealType: entry.mealType,
      recipeId: recipe.id,
      title: recipe.title,
      totalMinutes: recipe.totalMinutes,
      servings: recipe.servings,
      cookedAt: entry.cookedAt,
    }
  })
}

export const visualFixture = {
  pantry,
  recipes,
  shopping,
  checkout,
  suggestions,
}

export const emptyVisualFixture = {
  pantry: [] as PantryListItem[],
  recipes: [] as Recipe[],
  shopping: [] as ShoppingItem[],
  checkout: [] as CheckoutLine[],
  suggestions: [] as Suggestion[],
}

/** Cocina usa datos locales en las capturas: jamás consulta la despensa real. */
export function getVisualFixtureCookPreview(
  mealDate: string,
  mealType: MealType,
  scenario: VisualFixtureScenario,
): CookPreview | null {
  if (scenario === 'empty') return null
  return {
    title: 'Ensalada templada de garbanzos',
    mealDate,
    mealType,
    alreadyCooked: false,
    lines: [
      {
        itemId: 'fixture-pantry-garbanzos',
        name: 'Garbanzos cocidos',
        version: 1,
        trackingMode: 'units',
        quantity: 2,
        unitCode: 'unit',
        approximateState: null,
        proposedDiscount: 1,
        proposedState: null,
      },
      {
        itemId: 'fixture-pantry-tomates',
        name: 'Tomates cherry',
        version: 1,
        trackingMode: 'measure',
        quantity: 350,
        unitCode: 'g',
        approximateState: null,
        proposedDiscount: 150,
        proposedState: null,
      },
      {
        itemId: 'fixture-pantry-cebolla',
        name: 'Cebollas',
        version: 1,
        trackingMode: 'approximate',
        quantity: null,
        unitCode: null,
        approximateState: 'plenty',
        proposedDiscount: null,
        proposedState: 'some',
      },
    ],
  }
}
