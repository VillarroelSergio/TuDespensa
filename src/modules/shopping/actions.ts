'use server'

import { revalidatePath } from 'next/cache'

import { AppError } from '@/lib/errors/AppError'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseFoodName, parseIdempotencyKey } from '@/lib/validation/onboarding'

import type { ShoppingItem } from './types'

function failure(error: { code?: string; message: string }): never {
  const code = error.code === '42501' ? 'FORBIDDEN' : error.code === '40001' ? 'CONFLICT' : error.code === '22023' || error.code === '23514' ? 'INVALID_INPUT' : 'UNEXPECTED'
  throw new AppError(code, error.message)
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(name as never, args as never)
  if (error) failure(error)
  revalidatePath('/compra')
  return data as T
}

export async function addShoppingItem(input: { foodName: string; source?: 'manual' | 'pantry'; key?: string }) {
  return rpc<{ item_id: string; version: number }>('shopping_add_item', {
    food_name: parseFoodName(input.foodName),
    item_source: input.source ?? 'manual',
    idempotency_key: parseIdempotencyKey(input.key ?? createIdempotencyKey('shopping_add_item')),
  })
}

export async function toggleShoppingItem(itemId: string, version: number, purchased: boolean, key?: string) {
  return rpc<{ item_id: string; version: number; is_purchased: boolean }>('shopping_toggle_item', {
    item_id: itemId,
    version,
    purchased,
    idempotency_key: parseIdempotencyKey(key ?? createIdempotencyKey('shopping_toggle_item')),
  })
}

export async function getShoppingItems(): Promise<ShoppingItem[]> {
  const supabase = await createSupabaseServerClient()
  const { data: membership, error: membershipError } = await supabase.from('household_members').select('household_id').eq('status', 'active').maybeSingle()
  if (membershipError) failure(membershipError)
  if (!membership) return []
  const { data: lists, error: listsError } = await supabase.from('shopping_lists').select('id').eq('household_id', membership.household_id).eq('status', 'active').limit(1)
  if (listsError) failure(listsError)
  const listId = lists?.[0]?.id
  if (!listId) return []
  const { data: items, error: itemsError } = await supabase.from('shopping_items').select('id,food_id,source,is_purchased,version,created_at').eq('shopping_list_id', listId).order('is_purchased').order('created_at')
  if (itemsError) failure(itemsError)
  const foodIds = (items ?? []).map((item) => item.food_id)
  const { data: foods, error: foodsError } = foodIds.length ? await supabase.from('household_foods').select('id,name').in('id', foodIds) : { data: [], error: null }
  if (foodsError) failure(foodsError)
  const names = new Map((foods ?? []).map((food) => [food.id, food.name]))
  return (items ?? []).flatMap((item) => {
    const name = names.get(item.food_id)
    return name ? [{ id: item.id, name, source: item.source as ShoppingItem['source'], isPurchased: item.is_purchased, version: item.version }] : []
  })
}
