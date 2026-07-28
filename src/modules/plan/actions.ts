'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { AppError } from '@/lib/errors/AppError'
import { demoFixturesEnabled, demoWeekMeals } from '@/lib/dev/demo-fixtures'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseIdempotencyKey } from '@/lib/validation/onboarding'

import type { RecipeDishType } from '@/modules/recipes/types'

import { addPlanItems } from '@/modules/shopping/actions'

import { buildCookLines } from './cooking'
import type { Consumption, CookLine, CookPantryItem } from './cooking'
import { addDays, weekStart } from './presentation'
import { missingIngredients, rankSuggestions } from './suggestions'
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

async function moveMeal(input: {
  from: { mealDate: string; mealType: MealType }
  to: { mealDate: string; mealType: MealType }
}) {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('plan_move_meal', {
    from_meal_date_value: input.from.mealDate,
    from_meal_type_value: input.from.mealType,
    to_meal_date_value: input.to.mealDate,
    to_meal_type_value: input.to.mealType,
    idempotency_key: parseIdempotencyKey(
      createIdempotencyKey('plan_move_meal'),
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
/**
 * Escala una cantidad de ingrediente sin inventar precisión: si falta la
 * ración base o elegida, se conserva la cantidad original de la receta.
 */
export function scalePlanQuantity(
  quantity: number | null,
  recipeServings: number | null,
  plannedServings: number | null,
) {
  if (
    quantity === null ||
    !recipeServings ||
    !plannedServings ||
    recipeServings <= 0
  ) {
    return quantity
  }

  // Redondear a milésimas evita residuos de coma flotante en el JSON que viaja
  // a Postgres, sin perder precisión útil para g/ml.
  return Math.round((quantity * plannedServings * 1000) / recipeServings) / 1000
}

async function consolidateShopping(
  recipeId: string,
  plannedServings: number | null,
): Promise<number> {
  const supabase = await createSupabaseServerClient()
  const [ingredientsRes, recipeRes, pantry] = await Promise.all([
    supabase
      .from('recipe_ingredients')
      .select('name,quantity,unit_code')
      .eq('recipe_id', recipeId),
    supabase.from('recipes').select('servings').eq('id', recipeId).maybeSingle(),
    getSuggestionPantry(supabase),
  ])
  // Compra es una ayuda posterior a la asignacion: un fallo de lectura no debe
  // deshacer la comida ya planificada ni convertir el flujo en un error.
  if (ingredientsRes.error || recipeRes.error) return SHOPPING_FAILED
  const rows = ingredientsRes.data ?? []
  const recipeServings = recipeRes.data?.servings ?? null
  const missing = new Set(
    missingIngredients(
      rows.map((row) => row.name),
      pantry,
    ),
  )
  const items = rows
    .filter((row) => missing.has(row.name))
    .map((row) => ({
      name: row.name,
      quantity: scalePlanQuantity(
        row.quantity,
        recipeServings,
        plannedServings,
      ),
      unitCode: row.unit_code,
    }))
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
 * Asigna una receta a un hueco. Cubre elegir desde P2, ajustar raciones y
 * deshacer un borrado: los tres son la misma escritura sobre el mismo hueco.
 * Solo al elegir desde P2 se consolidan los faltantes en Compra.
 */
export async function assignMealAction(formData: FormData) {
  const slot = parseSlot(formData)
  const recipeId = parseRecipeId(formData)
  const servings = parseServings(formData)
  await setMeal({ ...slot, recipeId, servings })
  if (formData.get('consolidar') !== '1') backToWeek(slot.mealDate)
  const added = await consolidateShopping(recipeId, servings)
  backToWeek(slot.mealDate, added ? `&compra=${added}` : '')
}

/** Mueve una comida en una sola RPC; un destino ocupado se rechaza sin cambios. */
export async function moveMealAction(formData: FormData) {
  const from = parseSlot(formData, 'origen-')
  const to = parseSlot(formData)
  parseRecipeId(formData)
  parseServings(formData)
  if (to.mealDate !== from.mealDate || to.mealType !== from.mealType) {
    await moveMeal({ from, to })
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

/**
 * Sugerencias explicables para un hueco: reúne biblioteca, despensa y semana, y
 * delega la puntuación en `rankSuggestions`, que es puro y determinista.
 */
export async function getSuggestions(mealDate: string): Promise<Suggestion[]> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const startIso = weekStart(mealDate)
  const [
    recipesRes,
    ingredientsRes,
    prefsRes,
    assignsRes,
    catsRes,
    plannedRes,
    pantry,
  ] = await Promise.all([
    // Solo recetas listas: una captura `pending` todavía no se puede cocinar.
    supabase
      .from('recipes')
      .select('id,title,dish_type,total_minutes,servings')
      .eq('status', 'ready'),
    supabase.from('recipe_ingredients').select('recipe_id,name'),
    supabase
      .from('recipe_preferences')
      .select('recipe_id,is_favorite,rating')
      .eq('user_id', user.id),
    supabase
      .from('recipe_category_assignments')
      .select('recipe_id,category_id'),
    supabase.from('recipe_categories').select('id,name'),
    supabase
      .from('planned_meals')
      .select('recipe_id')
      .gte('meal_date', startIso)
      .lte('meal_date', addDays(startIso, 6)),
    getSuggestionPantry(supabase),
  ])
  if (recipesRes.error) failure(recipesRes.error)
  const recipes = recipesRes.data ?? []
  if (!recipes.length) return []

  const ingredientsByRecipe = new Map<string, string[]>()
  for (const row of ingredientsRes.data ?? []) {
    ingredientsByRecipe.set(row.recipe_id, [
      ...(ingredientsByRecipe.get(row.recipe_id) ?? []),
      row.name,
    ])
  }
  const prefByRecipe = new Map(
    (prefsRes.data ?? []).map((row) => [row.recipe_id, row]),
  )
  const categoryNameById = new Map(
    (catsRes.data ?? []).map((row) => [row.id, row.name]),
  )
  const categoriesByRecipe = new Map<string, string[]>()
  for (const row of assignsRes.data ?? []) {
    const name = categoryNameById.get(row.category_id)
    if (!name) continue
    categoriesByRecipe.set(row.recipe_id, [
      ...(categoriesByRecipe.get(row.recipe_id) ?? []),
      name,
    ])
  }

  const plannedRecipeIds = (plannedRes.data ?? []).map((row) => row.recipe_id)
  const dishTypeById = new Map(
    recipes.map((recipe) => [recipe.id, recipe.dish_type]),
  )
  const plannedDishTypes = plannedRecipeIds.map(
    (id) => (dishTypeById.get(id) ?? null) as RecipeDishType | null,
  )

  return rankSuggestions({
    candidates: recipes.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      totalMinutes: recipe.total_minutes,
      servings: recipe.servings,
      dishType: recipe.dish_type as RecipeDishType | null,
      isFavorite: prefByRecipe.get(recipe.id)?.is_favorite ?? false,
      rating: prefByRecipe.get(recipe.id)?.rating ?? null,
      categories: categoriesByRecipe.get(recipe.id) ?? [],
      ingredients: ingredientsByRecipe.get(recipe.id) ?? [],
    })),
    pantry,
    plannedRecipeIds,
    plannedDishTypes,
  })
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

  const [recipeRes, ingredientsRes, pantry] = await Promise.all([
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
  ])
  if (recipeRes.error) failure(recipeRes.error)

  return {
    title: recipeRes.data?.title ?? 'Receta',
    mealDate,
    mealType,
    alreadyCooked: meal.cooked_at !== null,
    lines: buildCookLines(
      (ingredientsRes.data ?? []).map((ingredient) => ({
        name: ingredient.name,
        quantity: ingredient.quantity,
        unitCode: ingredient.unit_code,
      })),
      pantry,
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
