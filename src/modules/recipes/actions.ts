'use server'

import { revalidatePath } from 'next/cache'

import { AppError } from '@/lib/errors/AppError'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseIdempotencyKey, parseRecipeTitle } from '@/lib/validation/onboarding'

import type { Recipe, RecipeDetail, RecipeDishType, RecipeStatus } from './types'

function failure(error: { code?: string; message: string }): never {
  const code = error.code === '42501' ? 'FORBIDDEN' : error.code === '40001' ? 'CONFLICT' : error.code === '22023' || error.code === '23514' ? 'INVALID_INPUT' : 'UNEXPECTED'
  throw new AppError(code, error.message)
}

export async function createRecipe(input: { title: string; dishType?: RecipeDishType | null; totalMinutes?: number | null; servings?: number | null; key?: string }) {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('recipes_create_recipe', {
    title: parseRecipeTitle(input.title),
    dish_type: input.dishType ?? null,
    total_minutes: input.totalMinutes ?? null,
    servings: input.servings ?? null,
    idempotency_key: parseIdempotencyKey(input.key ?? createIdempotencyKey('recipes_create_recipe')),
  })
  if (error) failure(error)
  revalidatePath('/recetas')
  return data as { recipe_id: string; version: number }
}

// Captura un enlace como receta `pending` para revisarla luego en el editor R2.
export async function captureLink(url: string, key?: string) {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('recipes_capture_link', {
    source_url: url.trim(),
    idempotency_key: parseIdempotencyKey(key ?? createIdempotencyKey('recipes_capture_link')),
  })
  if (error) failure(error)
  revalidatePath('/recetas')
  return data as { recipe_id: string; version: number }
}

export type SaveRecipeInput = {
  recipeId: string
  version: number
  title: string
  dishType?: RecipeDishType | null
  totalMinutes?: number | null
  servings?: number | null
  sourceUrl?: string | null
  ingredients: { name: string; quantity: number | null; unitCode: string | null }[]
  steps: string[]
  key?: string
}

export type SaveRecipeResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'conflict' | 'invalid' | 'error' }

// Devuelve un resultado tipado en vez de lanzar: el editor conserva lo visible y
// distingue conflicto (cambió en otra sesión) de dato inválido o error de red.
export async function saveRecipe(input: SaveRecipeInput): Promise<SaveRecipeResult> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('recipes_save_recipe', {
    recipe_id_value: input.recipeId,
    title: parseRecipeTitle(input.title),
    dish_type: input.dishType ?? null,
    total_minutes: input.totalMinutes ?? null,
    servings: input.servings ?? null,
    source_url: input.sourceUrl?.trim() || null,
    ingredients: input.ingredients.map((row) => ({ name: row.name.trim(), quantity: row.quantity, unit_code: row.unitCode })),
    steps: input.steps.map((step) => step.trim()).filter(Boolean),
    expected_version: input.version,
    idempotency_key: parseIdempotencyKey(input.key ?? createIdempotencyKey('recipes_save_recipe')),
  })
  if (error) {
    const reason = error.code === '40001' ? 'conflict' : error.code === '22023' || error.code === '23514' || error.code === '22P02' ? 'invalid' : 'error'
    return { ok: false, reason }
  }
  revalidatePath('/recetas')
  revalidatePath(`/recetas/${input.recipeId}`)
  return { ok: true, version: (data as { version: number }).version }
}

export async function getRecipes(): Promise<Recipe[]> {
  const supabase = await createSupabaseServerClient()
  // RLS limita la selección al hogar activo; no hace falta filtrar por hogar aquí.
  const { data, error } = await supabase.from('recipes').select('id,title,dish_type,total_minutes,servings,status').order('updated_at', { ascending: false })
  if (error) failure(error)
  return (data ?? []).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    dishType: recipe.dish_type as RecipeDishType | null,
    totalMinutes: recipe.total_minutes,
    servings: recipe.servings,
    status: recipe.status as RecipeStatus,
  }))
}

export async function getRecipe(id: string): Promise<RecipeDetail | null> {
  const supabase = await createSupabaseServerClient()
  const [recipe, ingredients, steps] = await Promise.all([
    supabase.from('recipes').select('id,title,dish_type,total_minutes,servings,status,version,source_url').eq('id', id).maybeSingle(),
    supabase.from('recipe_ingredients').select('position,name,quantity,unit_code').eq('recipe_id', id).order('position'),
    supabase.from('recipe_steps').select('position,instruction').eq('recipe_id', id).order('position'),
  ])
  if (recipe.error) failure(recipe.error)
  if (!recipe.data) return null
  if (ingredients.error) failure(ingredients.error)
  if (steps.error) failure(steps.error)
  return {
    id: recipe.data.id,
    title: recipe.data.title,
    dishType: recipe.data.dish_type as RecipeDishType | null,
    totalMinutes: recipe.data.total_minutes,
    servings: recipe.data.servings,
    status: recipe.data.status as RecipeStatus,
    version: recipe.data.version,
    sourceUrl: recipe.data.source_url,
    ingredients: (ingredients.data ?? []).map((row) => ({ position: row.position, name: row.name, quantity: row.quantity, unitCode: row.unit_code })),
    steps: (steps.data ?? []).map((row) => ({ position: row.position, instruction: row.instruction })),
  }
}
