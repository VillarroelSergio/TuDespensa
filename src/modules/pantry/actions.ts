'use server'

import { revalidatePath } from 'next/cache'
import { AppError } from '@/lib/errors/AppError'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseFoodName, parseIdempotencyKey } from '@/lib/validation/onboarding'
import type { PantryMutationInput, PantryZone } from './types'
import type { PantryListItem } from './presentation'
import { parsePantryTracking } from './validation'

export type PantryMutationResult = {
  item_id: string
  version: number
  presence: boolean
}

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

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(name as never, args as never)
  if (error) failure(error)
  revalidatePath('/despensa')
  return data as T
}

function mutationArgs(input: PantryMutationInput) {
  const tracking = parsePantryTracking(
    input.trackingMode,
    input.approximateState,
    input.quantity,
    input.unitCode,
    true,
  )
  return {
    item_id: input.itemId,
    version: input.version,
    tracking_mode: tracking.trackingMode,
    approximate_state: tracking.approximateState,
    quantity: tracking.quantity,
    unit_code: tracking.unitCode,
    idempotency_key: parseIdempotencyKey(
      input.key ?? createIdempotencyKey('pantry_mutation'),
    ),
  }
}

export async function recordPantryEntry(input: {
  zone: PantryZone
  foodName: string
  trackingMode: PantryMutationInput['trackingMode']
  approximateState: PantryMutationInput['approximateState']
  quantity: PantryMutationInput['quantity']
  unitCode: PantryMutationInput['unitCode']
  key?: string
}) {
  const tracking = parsePantryTracking(
    input.trackingMode,
    input.approximateState,
    input.quantity,
    input.unitCode,
  )
  return rpc('pantry_record_entry', {
    zone: input.zone,
    food_name: parseFoodName(input.foodName),
    tracking_mode: tracking.trackingMode,
    approximate_state: tracking.approximateState,
    quantity: tracking.quantity,
    unit_code: tracking.unitCode,
    idempotency_key: parseIdempotencyKey(
      input.key ?? createIdempotencyKey('pantry_record_entry'),
    ),
  })
}

export async function correctPantryItem(input: PantryMutationInput) {
  return rpc<PantryMutationResult>('pantry_correct_item', mutationArgs(input))
}
export async function adjustPantryItem(input: PantryMutationInput) {
  return rpc<PantryMutationResult>('pantry_adjust_item', mutationArgs(input))
}
export async function consumePantryItem(input: PantryMutationInput) {
  return rpc('pantry_consume_item', mutationArgs(input))
}
export async function markPantryLow(
  itemId: string,
  version: number,
  key?: string,
) {
  return rpc<PantryMutationResult>('pantry_set_attention', {
    item_id: itemId,
    version,
    attention_state: 'low',
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('pantry_set_attention'),
    ),
  })
}
export async function clearPantryAttention(
  itemId: string,
  version: number,
  key?: string,
) {
  return rpc<PantryMutationResult>('pantry_set_attention', {
    item_id: itemId,
    version,
    attention_state: 'none',
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('pantry_set_attention'),
    ),
  })
}
export async function markPantryOut(
  itemId: string,
  version: number,
  key?: string,
) {
  return rpc('pantry_mark_out', {
    item_id: itemId,
    version,
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('pantry_mark_out'),
    ),
  })
}
export async function renameHouseholdFood(
  foodId: string,
  name: string,
  key?: string,
) {
  return rpc('pantry_rename_household_food', {
    food_id: foodId,
    name: parseFoodName(name),
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('pantry_rename_household_food'),
    ),
  })
}
export async function addHouseholdFoodAlias(
  foodId: string,
  alias: string,
  key?: string,
) {
  return rpc('pantry_add_household_food_alias', {
    food_id: foodId,
    alias: parseFoodName(alias),
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('pantry_add_household_food_alias'),
    ),
  })
}

export async function getPantryListItems(): Promise<PantryListItem[]> {
  const supabase = await createSupabaseServerClient()
  const { data: membership, error: membershipError } = await supabase.from('household_members').select('household_id').eq('status', 'active').maybeSingle()
  if (membershipError) failure(membershipError)
  if (!membership) return []
  const householdId = membership.household_id
  const [{ data: pantryItems, error: itemsError }, { data: consumeSoonRows, error: soonError }] = await Promise.all([
    supabase.from('pantry_items').select('id,food_id,version,tracking_mode,approximate_state,attention_state,quantity,unit_code').eq('household_id', householdId),
    supabase.from('pantry_consume_soon').select('pantry_item_id,consume_soon').eq('household_id', householdId),
  ])
  if (itemsError) failure(itemsError)
  if (soonError) failure(soonError)
  const foodIds = (pantryItems ?? []).map((item) => item.food_id)
  const { data: foods, error: foodsError } = foodIds.length ? await supabase.from('household_foods').select('id,name').in('id', foodIds) : { data: [], error: null }
  if (foodsError) failure(foodsError)
  const names = new Map((foods ?? []).map((food) => [food.id, food.name]))
  const consumeSoon = new Map((consumeSoonRows ?? []).map((row) => [row.pantry_item_id, row.consume_soon]))
  return (pantryItems ?? []).flatMap((item) => {
    const name = names.get(item.food_id)
    if (!name) return []
    return [{ id: item.id, foodId: item.food_id, name, version: item.version, trackingMode: item.tracking_mode, approximateState: item.approximate_state, attentionState: item.attention_state, quantity: item.quantity, unitCode: item.unit_code, consumeSoon: consumeSoon.get(item.id) ?? false }]
  })
}
