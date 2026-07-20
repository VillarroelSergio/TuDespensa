'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { AppError } from '@/lib/errors/AppError'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseIdempotencyKey } from '@/lib/validation/onboarding'

import { addDays, weekStart } from './presentation'
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

/**
 * Asigna una receta a un hueco. Cubre elegir desde P2, ajustar raciones y
 * deshacer un borrado: los tres son la misma escritura sobre el mismo hueco.
 */
export async function assignMealAction(formData: FormData) {
  const slot = parseSlot(formData)
  await setMeal({
    ...slot,
    recipeId: parseRecipeId(formData),
    servings: parseServings(formData),
  })
  backToWeek(slot.mealDate)
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
  const undo = [slot.mealDate, slot.mealType, recipeId, servings ?? ''].join(':')
  backToWeek(slot.mealDate, `&deshacer=${undo}`)
}

/** Comidas planificadas de la semana que empieza en `startIso` (lunes). */
export async function getWeekMeals(startIso: string): Promise<PlannedMeal[]> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user && process.env.NODE_ENV === 'development') return []
  // RLS limita la selección al hogar activo; no hace falta filtrar por hogar aquí.
  const { data, error } = await supabase
    .from('planned_meals')
    .select('meal_date,meal_type,recipe_id,servings')
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
      },
    ]
  })
}
