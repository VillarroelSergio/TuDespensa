'use server'

import { revalidatePath } from 'next/cache'

import { demoFixturesEnabled, demoRecipes } from '@/lib/dev/demo-fixtures'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { failure } from '@/lib/supabase/rpc'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  parseIdempotencyKey,
  parseRecipeTitle,
} from '@/lib/validation/onboarding'

import { parseIngredient } from './ingredient-normalize'

import type {
  Recipe,
  RecipeCategory,
  RecipeCategoryDimension,
  RecipeDetail,
  RecipeDishType,
  RecipeStatus,
} from './types'

export async function createRecipe(input: {
  title: string
  dishType?: RecipeDishType | null
  totalMinutes?: number | null
  servings?: number | null
  key?: string
}) {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('recipes_create_recipe', {
    title: parseRecipeTitle(input.title),
    dish_type: input.dishType ?? null,
    total_minutes: input.totalMinutes ?? null,
    servings: input.servings ?? null,
    idempotency_key: parseIdempotencyKey(
      input.key ?? createIdempotencyKey('recipes_create_recipe'),
    ),
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
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('recipes_capture_link'),
    ),
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
  ingredients: {
    name: string
    quantity: number | null
    unitCode: string | null
  }[]
  steps: string[]
  key?: string
}

export type SaveRecipeResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'conflict' | 'invalid' | 'error' }

// Devuelve un resultado tipado en vez de lanzar: el editor conserva lo visible y
// distingue conflicto (cambió en otra sesión) de dato inválido o error de red.
export async function saveRecipe(
  input: SaveRecipeInput,
): Promise<SaveRecipeResult> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('recipes_save_recipe', {
    recipe_id_value: input.recipeId,
    title: parseRecipeTitle(input.title),
    dish_type: input.dishType ?? null,
    total_minutes: input.totalMinutes ?? null,
    servings: input.servings ?? null,
    source_url: input.sourceUrl?.trim() || null,
    ingredients: input.ingredients.map((row) => ({
      name: row.name.trim(),
      quantity: row.quantity,
      unit_code: row.unitCode,
    })),
    steps: input.steps.map((step) => step.trim()).filter(Boolean),
    expected_version: input.version,
    idempotency_key: parseIdempotencyKey(
      input.key ?? createIdempotencyKey('recipes_save_recipe'),
    ),
  })
  if (error) {
    const reason =
      error.code === '40001'
        ? 'conflict'
        : error.code === '22023' ||
            error.code === '23514' ||
            error.code === '22P02'
          ? 'invalid'
          : 'error'
    return { ok: false, reason }
  }
  revalidatePath('/recetas')
  revalidatePath(`/recetas/${input.recipeId}`)
  return { ok: true, version: (data as { version: number }).version }
}

export async function setPreference(input: {
  recipeId: string
  isFavorite: boolean
  rating: number | null
  key?: string
}) {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('recipes_set_preference', {
    recipe_id_value: input.recipeId,
    is_favorite: input.isFavorite,
    rating: input.rating,
    idempotency_key: parseIdempotencyKey(
      input.key ?? createIdempotencyKey('recipes_set_preference'),
    ),
  })
  if (error) failure(error)
  revalidatePath('/recetas')
  revalidatePath(`/recetas/${input.recipeId}`)
  return data as {
    recipe_id: string
    is_favorite: boolean
    rating: number | null
  }
}

export async function setCategories(input: {
  recipeId: string
  categories: RecipeCategory[]
  key?: string
}) {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('recipes_set_categories', {
    recipe_id_value: input.recipeId,
    categories: input.categories.map((category) => ({
      dimension: category.dimension,
      name: category.name.trim(),
    })),
    idempotency_key: parseIdempotencyKey(
      input.key ?? createIdempotencyKey('recipes_set_categories'),
    ),
  })
  if (error) failure(error)
  revalidatePath('/recetas')
  revalidatePath(`/recetas/${input.recipeId}`)
}

export async function loadSeed(key?: string) {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('recipes_load_seed', {
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('recipes_load_seed'),
    ),
  })
  if (error) failure(error)
  revalidatePath('/recetas')
  return data as { loaded: number }
}

async function categoryNamesByRecipe(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const [cats, assignments] = await Promise.all([
    supabase.from('recipe_categories').select('id,name'),
    supabase
      .from('recipe_category_assignments')
      .select('recipe_id,category_id'),
  ])
  const nameById = new Map(
    (cats.data ?? []).map((category) => [category.id, category.name]),
  )
  const byRecipe = new Map<string, string[]>()
  for (const assignment of assignments.data ?? []) {
    const name = nameById.get(assignment.category_id)
    if (!name) continue
    byRecipe.set(assignment.recipe_id, [
      ...(byRecipe.get(assignment.recipe_id) ?? []),
      name,
    ])
  }
  return byRecipe
}

export async function getRecipes(): Promise<Recipe[]> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user && process.env.NODE_ENV === 'development')
    return demoFixturesEnabled() ? demoRecipes : []
  const userId = user?.id ?? ''
  // RLS limita la selección al hogar activo; no hace falta filtrar por hogar aquí.
  const [recipesRes, prefsRes, categories] = await Promise.all([
    supabase
      .from('recipes')
      .select('id,title,dish_type,total_minutes,servings,status')
      .order('updated_at', { ascending: false }),
    supabase
      .from('recipe_preferences')
      .select('recipe_id,is_favorite')
      .eq('user_id', userId),
    categoryNamesByRecipe(supabase),
  ])
  if (recipesRes.error) failure(recipesRes.error)
  const favorites = new Set(
    (prefsRes.data ?? [])
      .filter((preference) => preference.is_favorite)
      .map((preference) => preference.recipe_id),
  )
  return (recipesRes.data ?? []).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    dishType: recipe.dish_type as RecipeDishType | null,
    totalMinutes: recipe.total_minutes,
    servings: recipe.servings,
    status: recipe.status as RecipeStatus,
    isFavorite: favorites.has(recipe.id),
    categories: categories.get(recipe.id) ?? [],
  }))
}

export async function getRecipe(id: string): Promise<RecipeDetail | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user && process.env.NODE_ENV === 'development') return null
  const userId = user?.id ?? ''
  const [recipe, ingredients, steps, prefRes, assignRes, catsRes] =
    await Promise.all([
      supabase
        .from('recipes')
        .select(
          'id,title,dish_type,total_minutes,servings,status,version,source_url',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('recipe_ingredients')
        .select('position,name,quantity,unit_code')
        .eq('recipe_id', id)
        .order('position'),
      supabase
        .from('recipe_steps')
        .select('position,instruction')
        .eq('recipe_id', id)
        .order('position'),
      supabase
        .from('recipe_preferences')
        .select('is_favorite,rating')
        .eq('recipe_id', id)
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('recipe_category_assignments')
        .select('category_id')
        .eq('recipe_id', id),
      supabase.from('recipe_categories').select('id,dimension,name'),
    ])
  if (recipe.error) failure(recipe.error)
  if (!recipe.data) return null
  if (ingredients.error) failure(ingredients.error)
  if (steps.error) failure(steps.error)
  const categoryById = new Map(
    (catsRes.data ?? []).map((category) => [category.id, category]),
  )
  const recipeCategories = (assignRes.data ?? [])
    .map((assignment) => categoryById.get(assignment.category_id))
    .filter((category): category is NonNullable<typeof category> =>
      Boolean(category),
    )
    .map((category) => ({
      dimension: category.dimension as RecipeCategoryDimension,
      name: category.name,
    }))
  const preference = prefRes.data
    ? { isFavorite: prefRes.data.is_favorite, rating: prefRes.data.rating }
    : { isFavorite: false, rating: null }
  return {
    id: recipe.data.id,
    title: recipe.data.title,
    dishType: recipe.data.dish_type as RecipeDishType | null,
    totalMinutes: recipe.data.total_minutes,
    servings: recipe.data.servings,
    status: recipe.data.status as RecipeStatus,
    isFavorite: preference.isFavorite,
    categories: recipeCategories.map((category) => category.name),
    version: recipe.data.version,
    sourceUrl: recipe.data.source_url,
    ingredients: (ingredients.data ?? []).map((row) => {
      const parsed = parseIngredient(row.name, row.quantity, row.unit_code)
      return {
        position: row.position,
        name: parsed.name,
        quantity: parsed.quantity,
        unitCode: parsed.unitCode,
      }
    }),
    steps: (steps.data ?? []).map((row) => ({
      position: row.position,
      instruction: row.instruction,
    })),
    recipeCategories,
    preference,
  }
}
