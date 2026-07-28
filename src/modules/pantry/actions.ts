'use server'

import { revalidatePath } from 'next/cache'
import { AppError } from '@/lib/errors/AppError'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseFoodName, parseIdempotencyKey } from '@/lib/validation/onboarding'
import type { PantryMutationInput, PantryZone } from './types'
import type { PantryListItem } from './presentation'
import { parsePantryTracking } from './validation'
import { demoFixturesEnabled, demoPantryItems } from '@/lib/dev/demo-fixtures'

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
        : error.code === '22023' ||
            error.code === '23514' ||
            error.code === '23505'
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
export async function deletePantryItem(
  itemId: string,
  version: number,
  key?: string,
) {
  return rpc('pantry_delete_item', {
    item_id: itemId,
    version,
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('pantry_delete_item'),
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
export async function movePantryItem(
  itemId: string,
  version: number,
  zone: PantryZone,
  key?: string,
) {
  return rpc<PantryMutationResult>('pantry_move_item', {
    item_id: itemId,
    version,
    zone,
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('pantry_move_item'),
    ),
  })
}

export async function updatePantryItem(input: {
  itemId: string
  foodId: string
  version: number
  name: string
  currentName: string
  zone: PantryZone
  currentZone: PantryZone
  trackingMode: PantryMutationInput['trackingMode']
  approximateState: PantryMutationInput['approximateState']
  quantity: PantryMutationInput['quantity']
  currentQuantity: number | null
  unitCode: PantryMutationInput['unitCode']
}) {
  let version = input.version
  const name = parseFoodName(input.name)
  if (name !== input.currentName.trim()) {
    await renameHouseholdFood(input.foodId, name)
  }
  // La cantidad se corrige antes de mover: si el destino fusiona con un
  // producto existente, debe fusionar con la cantidad ya editada.
  if (input.quantity !== null && input.quantity !== input.currentQuantity) {
    const corrected = await correctPantryItem({
      itemId: input.itemId,
      version,
      trackingMode: input.trackingMode,
      approximateState: input.approximateState,
      quantity: input.quantity,
      unitCode: input.unitCode,
    })
    version = corrected.version
  }
  if (input.zone !== input.currentZone) {
    const moved = await movePantryItem(input.itemId, version, input.zone)
    version = moved.version
  }
  return { version }
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
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  // El middleware permite abrir la interfaz durante `next dev` sin OTP. En ese
  // caso no existe una sesión que RLS pueda autorizar, así que mostramos el
  // estado vacío en lugar de intentar leer datos privados del hogar.
  if (!user && process.env.NODE_ENV === 'development')
    return demoFixturesEnabled() ? demoPantryItems : []
  if (userError) failure(userError)
  if (!user) return []
  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id')
    // Sin filtrar por usuario esto devuelve TODOS los miembros del hogar (RLS
    // permite que se vean entre sí), así que con dos personas `maybeSingle`
    // fallaba con "multiple rows returned" y la despensa dejaba de cargar.
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (membershipError) failure(membershipError)
  if (!membership) return []
  const householdId = membership.household_id
  const [
    { data: pantryItems, error: itemsError },
    { data: consumeSoonRows, error: soonError },
    { data: locations, error: locationsError },
  ] = await Promise.all([
    supabase
      .from('pantry_items')
      .select(
        'id,food_id,version,tracking_mode,approximate_state,attention_state,quantity,unit_code,location_id',
      )
      .eq('household_id', householdId)
      .is('removed_at', null),
    supabase
      .from('pantry_consume_soon')
      .select('pantry_item_id,consume_soon')
      .eq('household_id', householdId),
    supabase
      .from('pantry_locations')
      .select('id,kind')
      .eq('household_id', householdId),
  ])
  if (itemsError) failure(itemsError)
  if (soonError) failure(soonError)
  if (locationsError) failure(locationsError)
  const zones = new Map(
    (locations ?? []).map((location) => [
      location.id,
      location.kind as PantryZone,
    ]),
  )
  const foodIds = (pantryItems ?? []).map((item) => item.food_id)
  const { data: foods, error: foodsError } = foodIds.length
    ? await supabase.from('household_foods').select('id,name').in('id', foodIds)
    : { data: [], error: null }
  if (foodsError) failure(foodsError)
  const names = new Map((foods ?? []).map((food) => [food.id, food.name]))
  const consumeSoon = new Map(
    (consumeSoonRows ?? []).map((row) => [
      row.pantry_item_id,
      row.consume_soon,
    ]),
  )
  return (pantryItems ?? []).flatMap((item) => {
    const name = names.get(item.food_id)
    if (!name) return []
    return [
      {
        id: item.id,
        foodId: item.food_id,
        name,
        version: item.version,
        trackingMode: item.tracking_mode,
        approximateState: item.approximate_state,
        attentionState: item.attention_state,
        quantity: item.quantity,
        unitCode: item.unit_code,
        consumeSoon: consumeSoon.get(item.id) ?? false,
        zone: zones.get(item.location_id),
      },
    ]
  })
}
