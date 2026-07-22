import type { PantryListItem } from '@/modules/pantry/presentation'
import type { PlannedMeal } from '@/modules/plan/types'
import type { Recipe } from '@/modules/recipes/types'
import type { ShoppingItem } from '@/modules/shopping/types'

/**
 * Datos de demostración para las capturas de contexto visual. Sintéticos,
 * deterministas y sin PII. Doble barrera: solo se sirven en `next dev` y con el
 * flag activo, y siempre dentro de la rama de bypass sin sesión de los loaders,
 * así que nunca pueden llegar a producción ni mezclarse con datos reales.
 */
export function demoFixturesEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEMO_FIXTURES === 'true'
  )
}

export const demoPantryItems: PantryListItem[] = [
  {
    id: 'demo-p-1',
    foodId: 'f1',
    name: 'Leche',
    version: 1,
    trackingMode: 'measure',
    approximateState: null,
    attentionState: 'none',
    quantity: 1,
    unitCode: 'l',
    consumeSoon: false,
  },
  {
    id: 'demo-p-2',
    foodId: 'f2',
    name: 'Huevos',
    version: 1,
    trackingMode: 'units',
    approximateState: null,
    attentionState: 'none',
    quantity: 6,
    unitCode: 'unit',
    consumeSoon: false,
  },
  {
    id: 'demo-p-3',
    foodId: 'f3',
    name: 'Tomates',
    version: 1,
    trackingMode: 'approximate',
    approximateState: 'some',
    attentionState: 'none',
    quantity: null,
    unitCode: null,
    consumeSoon: true,
  },
  {
    id: 'demo-p-4',
    foodId: 'f4',
    name: 'Yogures',
    version: 1,
    trackingMode: 'approximate',
    approximateState: 'low',
    attentionState: 'low',
    quantity: null,
    unitCode: null,
    consumeSoon: true,
  },
  {
    id: 'demo-p-5',
    foodId: 'f5',
    name: 'Aceite de oliva virgen extra',
    version: 1,
    trackingMode: 'measure',
    approximateState: null,
    attentionState: 'none',
    quantity: 0.5,
    unitCode: 'l',
    consumeSoon: false,
  },
  {
    id: 'demo-p-6',
    foodId: 'f6',
    name: 'Arroz',
    version: 1,
    trackingMode: 'approximate',
    approximateState: 'plenty',
    attentionState: 'none',
    quantity: null,
    unitCode: null,
    consumeSoon: false,
  },
  {
    id: 'demo-p-7',
    foodId: 'f7',
    name: 'Pechuga de pollo',
    version: 1,
    trackingMode: 'approximate',
    approximateState: 'out',
    attentionState: 'none',
    quantity: null,
    unitCode: null,
    consumeSoon: false,
  },
  {
    id: 'demo-p-8',
    foodId: 'f8',
    name: 'Espinacas',
    version: 1,
    trackingMode: 'approximate',
    approximateState: 'some',
    attentionState: 'none',
    quantity: null,
    unitCode: null,
    consumeSoon: true,
  },
]

export const demoShoppingItems: ShoppingItem[] = [
  {
    id: 'demo-s-1',
    name: 'Tomates',
    source: 'plan',
    isPurchased: false,
    version: 1,
    quantity: 500,
    unitCode: 'g',
  },
  {
    id: 'demo-s-2',
    name: 'Garbanzos',
    source: 'plan',
    isPurchased: false,
    version: 1,
    quantity: 400,
    unitCode: 'g',
  },
  {
    id: 'demo-s-3',
    name: 'Cebolla',
    source: 'manual',
    isPurchased: false,
    version: 1,
    quantity: null,
    unitCode: null,
  },
  {
    id: 'demo-s-4',
    name: 'Pan',
    source: 'manual',
    isPurchased: false,
    version: 1,
    quantity: null,
    unitCode: null,
  },
  {
    id: 'demo-s-5',
    name: 'Leche',
    source: 'manual',
    isPurchased: true,
    version: 1,
    quantity: null,
    unitCode: null,
  },
  {
    id: 'demo-s-6',
    name: 'Aceite de oliva',
    source: 'pantry',
    isPurchased: true,
    version: 1,
    quantity: 1,
    unitCode: 'l',
  },
]

export const demoRecipes: Recipe[] = [
  {
    id: 'demo-r-1',
    title: 'Ensalada mediterránea',
    dishType: 'starter',
    totalMinutes: 15,
    servings: 2,
    status: 'ready',
    isFavorite: true,
    categories: ['Mediterránea', 'Rápida'],
  },
  {
    id: 'demo-r-2',
    title: 'Tortilla de patatas',
    dishType: 'main',
    totalMinutes: 40,
    servings: 2,
    status: 'ready',
    isFavorite: false,
    categories: ['Tradicional'],
  },
  {
    id: 'demo-r-3',
    title: 'Paella de verduras',
    dishType: 'main',
    totalMinutes: 45,
    servings: 4,
    status: 'ready',
    isFavorite: true,
    categories: ['Mediterránea', 'Arroz'],
  },
  {
    id: 'demo-r-4',
    title: 'Salmón al horno',
    dishType: 'main',
    totalMinutes: 30,
    servings: 2,
    status: 'ready',
    isFavorite: false,
    categories: ['Pescado', 'Horno'],
  },
  {
    id: 'demo-r-5',
    title: 'Lentejas estofadas',
    dishType: 'main',
    totalMinutes: 50,
    servings: 4,
    status: 'ready',
    isFavorite: true,
    categories: ['Legumbres', 'Invierno'],
  },
  {
    id: 'demo-r-6',
    title: 'Pasta con tomate',
    dishType: 'main',
    totalMinutes: 20,
    servings: 2,
    status: 'ready',
    isFavorite: false,
    categories: ['Rápida'],
  },
  {
    id: 'demo-r-7',
    title: 'Pollo al limón',
    dishType: 'main',
    totalMinutes: 35,
    servings: 3,
    status: 'ready',
    isFavorite: false,
    categories: ['Mediterránea'],
  },
  {
    id: 'demo-r-8',
    title: 'Bizcocho de yogur',
    dishType: 'dessert',
    totalMinutes: 45,
    servings: 8,
    status: 'pending',
    isFavorite: false,
    categories: [],
  },
]

// UTC para no desplazar el día por zona horaria (misma convención que el plan).
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Semana parcialmente planificada (7 de 14 huecos), con dos comidas ya cocinadas. */
export function demoWeekMeals(startIso: string): PlannedMeal[] {
  return [
    {
      mealDate: addDays(startIso, 0),
      mealType: 'lunch',
      recipeId: 'demo-r-1',
      title: 'Ensalada mediterránea',
      totalMinutes: 15,
      servings: 2,
      cookedAt: `${addDays(startIso, 0)}T13:00:00Z`,
    },
    {
      mealDate: addDays(startIso, 0),
      mealType: 'dinner',
      recipeId: 'demo-r-2',
      title: 'Tortilla de patatas',
      totalMinutes: 40,
      servings: 2,
      cookedAt: null,
    },
    {
      mealDate: addDays(startIso, 1),
      mealType: 'lunch',
      recipeId: 'demo-r-3',
      title: 'Paella de verduras',
      totalMinutes: 45,
      servings: 4,
      cookedAt: null,
    },
    {
      mealDate: addDays(startIso, 2),
      mealType: 'dinner',
      recipeId: 'demo-r-4',
      title: 'Salmón al horno',
      totalMinutes: 30,
      servings: 2,
      cookedAt: null,
    },
    {
      mealDate: addDays(startIso, 3),
      mealType: 'lunch',
      recipeId: 'demo-r-5',
      title: 'Lentejas estofadas',
      totalMinutes: 50,
      servings: 4,
      cookedAt: `${addDays(startIso, 3)}T13:00:00Z`,
    },
    {
      mealDate: addDays(startIso, 4),
      mealType: 'dinner',
      recipeId: 'demo-r-6',
      title: 'Pasta con tomate',
      totalMinutes: 20,
      servings: 2,
      cookedAt: null,
    },
    {
      mealDate: addDays(startIso, 5),
      mealType: 'lunch',
      recipeId: 'demo-r-7',
      title: 'Pollo al limón',
      totalMinutes: 35,
      servings: 3,
      cookedAt: null,
    },
  ]
}
