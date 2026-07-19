'use server'

import { revalidatePath } from 'next/cache'
import { AppError } from '@/lib/errors/AppError'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseFoodName, parseIdempotencyKey } from '@/lib/validation/onboarding'
import type { PantryMutationInput, PantryZone } from './types'
import { parsePantryTracking } from './validation'

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
  return rpc('pantry_correct_item', mutationArgs(input))
}
export async function adjustPantryItem(input: PantryMutationInput) {
  return rpc('pantry_adjust_item', mutationArgs(input))
}
export async function consumePantryItem(input: PantryMutationInput) {
  return rpc('pantry_consume_item', mutationArgs(input))
}
export async function markPantryLow(
  itemId: string,
  version: number,
  key?: string,
) {
  return rpc('pantry_mark_low', {
    item_id: itemId,
    version,
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('pantry_mark_low'),
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
