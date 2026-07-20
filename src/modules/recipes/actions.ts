'use server'

import { revalidatePath } from 'next/cache'

import { AppError } from '@/lib/errors/AppError'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseIdempotencyKey, parseRecipeTitle } from '@/lib/validation/onboarding'

import type { Recipe, RecipeDishType } from './types'

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

export async function getRecipes(): Promise<Recipe[]> {
  const supabase = await createSupabaseServerClient()
  // RLS limita la selección al hogar activo; no hace falta filtrar por hogar aquí.
  const { data, error } = await supabase.from('recipes').select('id,title,dish_type,total_minutes,servings').order('updated_at', { ascending: false })
  if (error) failure(error)
  return (data ?? []).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    dishType: recipe.dish_type as RecipeDishType | null,
    totalMinutes: recipe.total_minutes,
    servings: recipe.servings,
  }))
}
