'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { AppError } from '@/lib/errors/AppError'
import { demoFixturesEnabled, demoWeekMeals } from '@/lib/dev/demo-fixtures'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseIdempotencyKey } from '@/lib/validation/onboarding'

import type { RecipeDishType } from '@/modules/recipes/types'
import { parseIngredient } from '@/modules/recipes/ingredient-normalize'

import { addPlanItems } from '@/modules/shopping/actions'

import { getCatalogEntries } from './catalog'
import { buildCookLines } from './cooking'
import type { Consumption, CookLine, CookPantryItem } from './cooking'
import { classifyFoodGroup } from './foodGroups'
import { addDays, weekStart } from './presentation'
import {
  buildCatalogEntries,
  missingIngredients,
  rankSuggestions,
} from './suggestions'
import type { Suggestion } from './suggestions'
import type { MealType, PlannedMeal } from './types'

function failure(error: { code?: string; message: string }): never {
  const code =
    error.code === '42501'
      ? 'FORBIDDEN'
      : error.code === '40001'
        ? 'CONFLICT'
        : error.code === '22023' || error.code === '23514'
          ? 'INVALID_INPUT'
          : 'UNEXPECTED'
  throw new AppError(code, error.message)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function invalid(message: string): never {
  throw new AppError('INVALID_INPUT', message)
}

// Los formularios son la única entrada de estas acciones: validamos aquí lo que
// la RPC también comprueba, para fallar antes de tocar la red.
function parseSlot(formData: FormData, prefix = '') {
  const mealDate = String(formData.get(`${prefix}fecha`) ?? '')
  const mealType = String(formData.get(`${prefix}servicio`) ?? '')
  if (!ISO_DATE.test(mealDate)) invalid('Fecha de plan inválida')
  if (mealType !== 'lunch' && mealType !== 'dinner') {
    invalid('Servicio de plan inválido')
  }
  return { mealDate, mealType: mealType as MealType }
}

function parseRecipeId(formData: FormData) {
  const recipeId = String(formData.get('receta') ?? '')
  if (!UUID.test(recipeId)) invalid('Receta inválida')
  return recipeId
}

function parseServings(formData: FormData) {
  const raw = String(formData.get('raciones') ?? '').trim()
  if (!raw) return null
  const servings = Number(raw)
  if (!Number.isInteger(servings) || servings < 1 || servings > 99) {
    invalid('Raciones fuera de rango')
  }
  return servings
}

async function setMeal(input: {
  mealDate: string
  mealType: MealType
  recipeId: string
  servings: number | null
}) {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('plan_set_meal', {
    meal_date_value: input.mealDate,
    meal_type_value: input.mealType,
    recipe_id_value: input.recipeId,
    servings_value: input.servings,
    idempotency_key: parseIdempotencyKey(createIdempotencyKey('plan_set_meal')),
  })
  if (error) failure(error)
}

async function clearMeal(input: { mealDate: string; mealType: MealType }) {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('plan_clear_meal', {
    meal_date_value: input.mealDate,
    meal_type_value: input.mealType,
    idempotency_key: parseIdempotencyKey(
      createIdempotencyKey('plan_clear_meal'),
    ),
  })
  if (error) failure(error)
}

function backToWeek(mealDate: string, query = ''): never {
  revalidatePath('/plan')
  redirect(`/plan?semana=${weekStart(mealDate)}${query}`)
}

/** No se ha podido actualizar Compra; el hueco sí quedó planificado. */
const SHOPPING_FAILED = -1

/**
 * Lleva a Compra los ingredientes de la receta que no están en la despensa.
 * Devuelve cuántos productos son nuevos allí.
 */
async function consolidateShopping(recipeId: string): Promise<number> {
  const supabase = await createSupabaseServerClient()
  const [ingredientsRes, pantry, catalog] = await Promise.all([
    supabase
      .from('recipe_ingredients')
      .select('name,quantity,unit_code')
      .eq('recipe_id', recipeId),
    getSuggestionPantry(supabase),
    getCatalogEntries(supabase),
  ])
  // Nombre y cantidad limpios: «1/4 cebolla» → «cebolla», 0.25 uds. La Compra
  // solo maneja artículos completos, así que las unidades contables se redondean
  // hacia arriba (nunca se compra media cebolla). El peso/volumen se deja igual.
  const rows = (ingredientsRes.data ?? []).map((row) => {
    const parsed = parseIngredient(row.name, row.quantity, row.unit_code)
    return {
      name: parsed.name,
      quantity:
        parsed.unitCode === 'unit' && parsed.quantity !== null
          ? Math.ceil(parsed.quantity)
          : parsed.quantity,
      unitCode: parsed.unitCode,
    }
  })
  const missing = new Set(
    missingIngredients(
      rows.map((row) => row.name),
      pantry,
      catalog,
    ),
  )
  const items = rows.filter((row) => missing.has(row.name))
  if (!items.length) return 0
  try {
    return (await addPlanItems(items)).added
  } catch {
    // Planificar no debe fallar porque Compra falle: el hueco ya está asignado,
    // así que lo decimos en vez de romper la acción entera.
    return SHOPPING_FAILED
  }
}

/**
 * Asigna una receta a un hueco. Cubre elegir desde P2 y deshacer un borrado:
 * las dos son la misma escritura sobre el mismo hueco. Solo al elegir desde
 * P2 se consolidan los faltantes en Compra.
 */
export async function assignMealAction(formData: FormData) {
  const slot = parseSlot(formData)
  const recipeId = parseRecipeId(formData)
  await setMeal({ ...slot, recipeId, servings: parseServings(formData) })
  if (formData.get('consolidar') !== '1') backToWeek(slot.mealDate)
  const added = await consolidateShopping(recipeId)
  backToWeek(slot.mealDate, added ? `&compra=${added}` : '')
}

/** Mueve una comida a otro hueco; si el destino está ocupado, lo sustituye. */
export async function moveMealAction(formData: FormData) {
  const from = parseSlot(formData, 'origen-')
  const to = parseSlot(formData)
  const recipeId = parseRecipeId(formData)
  const servings = parseServings(formData)
  if (to.mealDate !== from.mealDate || to.mealType !== from.mealType) {
    // Escribimos el destino antes de vaciar el origen: si lo segundo falla, la
    // comida aparece duplicada, que es preferible a perderla.
    await setMeal({ ...to, recipeId, servings })
    await clearMeal(from)
  }
  backToWeek(to.mealDate)
}

/** Vacía un hueco y devuelve a la semana con la oferta de deshacer. */
export async function removeMealAction(formData: FormData) {
  const slot = parseSlot(formData)
  const recipeId = parseRecipeId(formData)
  const servings = parseServings(formData)
  await clearMeal(slot)
  // ponytail: el estado para deshacer viaja en la URL en vez de en un registro
  // de deshacer; la acción inversa es un `plan_set_meal` con estos mismos datos.
  const undo = [slot.mealDate, slot.mealType, recipeId, servings ?? ''].join(
    ':',
  )
  backToWeek(slot.mealDate, `&deshacer=${undo}`)
}

/**
 * Alimentos presentes en la despensa. Prioritario = escaso, marcado por el hogar
 * o a punto de consumirse: es lo que da el motivo «Aprovecha …».
 */
async function getSuggestionPantry(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const [itemsRes, soonRes] = await Promise.all([
    supabase
      .from('pantry_items')
      .select('id,food_id,approximate_state,attention_state')
      .eq('presence', true),
    supabase.from('pantry_consume_soon').select('pantry_item_id,consume_soon'),
  ])
  const items = itemsRes.data ?? []
  if (!items.length) return []
  const { data: foods } = await supabase
    .from('household_foods')
    .select('id,name')
    .in(
      'id',
      items.map((item) => item.food_id),
    )
  const nameById = new Map((foods ?? []).map((food) => [food.id, food.name]))
  const soon = new Set(
    (soonRes.data ?? [])
      .filter((row) => row.consume_soon)
      .map((row) => row.pantry_item_id),
  )
  return items.flatMap((item) => {
    const name = nameById.get(item.food_id)
    if (!name) return []
    const priority =
      item.attention_state === 'low' ||
      item.approximate_state === 'low' ||
      soon.has(item.id)
    return [{ name, priority }]
  })
}

/** Índice mínimo para el buscador de recetas del selector (Plan P2). */
export type SearchableRecipe = {
  id: string
  title: string
  totalMinutes: number | null
  categories: string[]
}

/**
 * 3 sugerencias explicadas + 10 recomendadas adicionales, y el índice de
 * búsqueda del selector — comparten la misma consulta de recetas en vez de
 * que el selector pida además la biblioteca completa por separado.
 */
export type ChooseRecipeOptions = {
  suggestions: Suggestion[]
  recommended: Suggestion[]
  recipes: SearchableRecipe[]
}

const RECOMMENDED_COUNT = 10

/** Forma cruda que devuelve la RPC `plan_choose_recipe_options`. */
type ChooseRecipeOptionsRpc = {
  recipes: {
    id: string
    title: string
    dishType: string | null
    totalMinutes: number | null
    ingredients: string[]
  }[]
  preferences: {
    recipeId: string
    isFavorite: boolean
    rating: number | null
  }[]
  categoryAssignments: { recipeId: string; categoryName: string }[]
  plannedRecipeIds: string[]
  pantry: { name: string; priority: boolean }[]
  catalog: { canonicalName: string; terms: string[] }[]
}

/**
 * Sugerencias explicables para un hueco: reúne biblioteca, despensa y semana, y
 * delega la puntuación en `rankSuggestions`, que es puro y determinista. Además
 * de las 3 sugerencias, devuelve 10 recomendadas más y el índice de búsqueda
 * completo, para que el selector no repita la consulta de recetas.
 *
 * Toda la lectura viene de una sola RPC (`plan_choose_recipe_options`) en vez
 * de ~11 consultas separadas: mismo dato, un solo viaje de red (auditoría
 * 2026-07-29).
 */
export async function getSuggestions(
  mealDate: string,
): Promise<ChooseRecipeOptions> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { suggestions: [], recommended: [], recipes: [] }

  const startIso = weekStart(mealDate)
  const { data, error } = await supabase.rpc('plan_choose_recipe_options', {
    week_start_value: startIso,
  })
  if (error) failure(error)
  const options = (data ?? {}) as Partial<ChooseRecipeOptionsRpc>
  const recipes = options.recipes ?? []
  if (!recipes.length) return { suggestions: [], recommended: [], recipes: [] }

  const ingredientsByRecipe = new Map<string, string[]>()
  for (const recipe of recipes) {
    ingredientsByRecipe.set(
      recipe.id,
      recipe.ingredients.map((name) => parseIngredient(name).name),
    )
  }
  const prefByRecipe = new Map(
    (options.preferences ?? []).map((row) => [row.recipeId, row]),
  )
  const categoriesByRecipe = new Map<string, string[]>()
  for (const row of options.categoryAssignments ?? []) {
    categoriesByRecipe.set(row.recipeId, [
      ...(categoriesByRecipe.get(row.recipeId) ?? []),
      row.categoryName,
    ])
  }

  const plannedRecipeIds = options.plannedRecipeIds ?? []
  const dishTypeById = new Map(
    recipes.map((recipe) => [recipe.id, recipe.dishType]),
  )
  const plannedDishTypes = plannedRecipeIds.map(
    (id) => (dishTypeById.get(id) ?? null) as RecipeDishType | null,
  )
  // Misma lógica de equilibrio semanal que ve cada sugerencia: qué grupo de
  // alimento (legumbre, carne roja...) ya lleva la semana mostrada.
  const plannedFoodGroups = plannedRecipeIds.map((id) =>
    classifyFoodGroup(ingredientsByRecipe.get(id) ?? []),
  )

  const rankInput = {
    candidates: recipes.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      totalMinutes: recipe.totalMinutes,
      dishType: recipe.dishType as RecipeDishType | null,
      isFavorite: prefByRecipe.get(recipe.id)?.isFavorite ?? false,
      rating: prefByRecipe.get(recipe.id)?.rating ?? null,
      categories: categoriesByRecipe.get(recipe.id) ?? [],
      ingredients: ingredientsByRecipe.get(recipe.id) ?? [],
    })),
    pantry: options.pantry ?? [],
    plannedRecipeIds,
    plannedDishTypes,
    plannedFoodGroups,
    catalog: buildCatalogEntries(options.catalog ?? []),
  }
  // Las 10 recomendadas son las siguientes en el mismo ranking, sin repetir
  // las 3 sugerencias ya mostradas.
  const ranked = rankSuggestions(rankInput, 3 + RECOMMENDED_COUNT)
  return {
    suggestions: ranked.slice(0, 3),
    recommended: ranked.slice(3, 3 + RECOMMENDED_COUNT),
    recipes: recipes.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      totalMinutes: recipe.totalMinutes,
      categories: categoriesByRecipe.get(recipe.id) ?? [],
    })),
  }
}

/** Comidas planificadas de la semana que empieza en `startIso` (lunes). */
export async function getWeekMeals(startIso: string): Promise<PlannedMeal[]> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user && process.env.NODE_ENV === 'development')
    return demoFixturesEnabled() ? demoWeekMeals(startIso) : []
  // RLS limita la selección al hogar activo; no hace falta filtrar por hogar aquí.
  const { data, error } = await supabase
    .from('planned_meals')
    .select('meal_date,meal_type,recipe_id,servings,cooked_at')
    .gte('meal_date', startIso)
    .lte('meal_date', addDays(startIso, 6))
  if (error) failure(error)
  const meals = data ?? []
  if (!meals.length) return []

  // ponytail: join manual por ids; `database.ts` no declara Relationships, así
  // que un select embebido de PostgREST no quedaría tipado.
  const { data: recipes } = await supabase
    .from('recipes')
    .select('id,title,total_minutes')
    .in(
      'id',
      meals.map((meal) => meal.recipe_id),
    )
  const recipeById = new Map(
    (recipes ?? []).map((recipe) => [recipe.id, recipe]),
  )

  return meals.flatMap((meal) => {
    const recipe = recipeById.get(meal.recipe_id)
    // Una receta borrada arrastra su planificación (on delete cascade); si aun
    // así no se puede leer, el hueco se muestra vacío en vez de romper la semana.
    if (!recipe) return []
    return [
      {
        mealDate: meal.meal_date,
        mealType: meal.meal_type as MealType,
        recipeId: meal.recipe_id,
        title: recipe.title,
        totalMinutes: recipe.total_minutes,
        servings: meal.servings,
        cookedAt: meal.cooked_at,
      },
    ]
  })
}

/** Revisión de cocinado: título del hueco y descuentos propuestos por producto. */
export type CookPreview = {
  title: string
  mealDate: string
  mealType: MealType
  alreadyCooked: boolean
  lines: CookLine[]
}

/**
 * Prepara la revisión de «marcar como cocinada»: empareja los ingredientes de la
 * receta planificada con la despensa y propone un descuento por producto. Devuelve
 * `null` si el hueco no existe (nada que cocinar).
 */
export async function getCookPreview(
  mealDate: string,
  mealType: MealType,
): Promise<CookPreview | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: meal, error: mealError } = await supabase
    .from('planned_meals')
    .select('recipe_id,cooked_at')
    .eq('meal_date', mealDate)
    .eq('meal_type', mealType)
    .maybeSingle()
  if (mealError) failure(mealError)
  if (!meal) return null

  const [recipeRes, ingredientsRes, pantry, catalog] = await Promise.all([
    supabase
      .from('recipes')
      .select('title')
      .eq('id', meal.recipe_id)
      .maybeSingle(),
    supabase
      .from('recipe_ingredients')
      .select('name,quantity,unit_code')
      .eq('recipe_id', meal.recipe_id),
    getCookPantry(supabase),
    getCatalogEntries(supabase),
  ])
  if (recipeRes.error) failure(recipeRes.error)

  return {
    title: recipeRes.data?.title ?? 'Receta',
    mealDate,
    mealType,
    alreadyCooked: meal.cooked_at !== null,
    lines: buildCookLines(
      (ingredientsRes.data ?? []).map((ingredient) =>
        parseIngredient(
          ingredient.name,
          ingredient.quantity,
          ingredient.unit_code,
        ),
      ),
      pantry,
      catalog,
    ),
  }
}

/** Productos presentes en la despensa, con lo necesario para descontar y versionar. */
async function getCookPantry(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<CookPantryItem[]> {
  const { data: items } = await supabase
    .from('pantry_items')
    .select(
      'id,food_id,version,tracking_mode,approximate_state,quantity,unit_code',
    )
    .eq('presence', true)
  if (!items?.length) return []
  const { data: foods } = await supabase
    .from('household_foods')
    .select('id,name')
    .in(
      'id',
      items.map((item) => item.food_id),
    )
  const nameById = new Map((foods ?? []).map((food) => [food.id, food.name]))
  return items.flatMap((item) => {
    const name = nameById.get(item.food_id)
    if (!name) return []
    return [
      {
        itemId: item.id,
        name,
        version: item.version,
        trackingMode: item.tracking_mode,
        approximateState: item.approximate_state,
        quantity: item.quantity,
        unitCode: item.unit_code,
      },
    ]
  })
}

/**
 * Marca una comida como cocinada y aplica los descuentos confirmados en la
 * despensa. Idempotente; un CONFLICT significa que otro integrante ya la cocinó o
 * cambió un producto, y la revisión debe recargarse.
 */
export async function cookMeal(
  mealDate: string,
  mealType: MealType,
  consumptions: Consumption[],
  key?: string,
) {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('plan_cook_meal', {
    meal_date_value: mealDate,
    meal_type_value: mealType,
    consumptions: consumptions as never,
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('plan_cook_meal'),
    ),
  })
  if (error) failure(error)
  revalidatePath('/plan')
  revalidatePath('/despensa')
  return data as { cooked: boolean; consumed: number }
}
