'use server'

import { revalidatePath } from 'next/cache'

import { AppError } from '@/lib/errors/AppError'
import {
  demoCheckoutLines,
  demoFixturesEnabled,
  demoShoppingItems,
} from '@/lib/dev/demo-fixtures'
import { createIdempotencyKey } from '@/lib/idempotency/keys'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseFoodName, parseIdempotencyKey } from '@/lib/validation/onboarding'

import type { PantryZone } from '@/modules/pantry/types'

import type { CheckoutLine, ShoppingItem } from './types'

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
  revalidatePath('/compra')
  return data as T
}

export async function addShoppingItem(input: {
  foodName: string
  source?: 'manual' | 'pantry'
  key?: string
}) {
  return rpc<{ item_id: string; version: number }>('shopping_add_item', {
    food_name: parseFoodName(input.foodName),
    item_source: input.source ?? 'manual',
    idempotency_key: parseIdempotencyKey(
      input.key ?? createIdempotencyKey('shopping_add_item'),
    ),
  })
}

/**
 * Consolida en Compra los ingredientes que faltan para una receta planificada.
 * Devuelve cuántos productos son nuevos: los que ya estaban no se duplican ni se
 * desmarcan, y un producto manual conserva su origen.
 */
export async function addPlanItems(
  items: { name: string; quantity: number | null; unitCode: string | null }[],
  key?: string,
) {
  if (!items.length) return { added: 0 }
  return rpc<{ added: number }>('shopping_add_plan_items', {
    items: items.map((item) => ({
      name: item.name.trim(),
      quantity: item.quantity,
      unit_code: item.unitCode,
    })),
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('shopping_add_plan_items'),
    ),
  })
}

/**
 * Fase 10: añade a Compra las líneas revisadas de un ticket, ya marcadas como
 * compradas (el ticket registra lo que ya está en casa). El cierre de compra
 * existente las lleva a la Despensa. Devuelve cuántos productos son nuevos.
 */
export async function importTicketItems(
  items: { name: string; quantity: number | null; unitCode: string | null }[],
  key?: string,
) {
  const clean = items
    .map((item) => ({ ...item, name: item.name.trim() }))
    .filter((item) => item.name.length > 0 && item.name.length <= 120)
  if (!clean.length) return { added: 0 }
  return rpc<{ added: number }>('shopping_add_ticket_items', {
    items: clean.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit_code: item.unitCode,
    })),
    idempotency_key: parseIdempotencyKey(
      key ?? createIdempotencyKey('shopping_add_ticket_items'),
    ),
  })
}

export async function toggleShoppingItem(
  itemId: string,
  version: number,
  purchased: boolean,
  key?: string,
) {
  return rpc<{ item_id: string; version: number; is_purchased: boolean }>(
    'shopping_toggle_item',
    {
      item_id: itemId,
      version,
      purchased,
      idempotency_key: parseIdempotencyKey(
        key ?? createIdempotencyKey('shopping_toggle_item'),
      ),
    },
  )
}

export async function getShoppingItems(): Promise<ShoppingItem[]> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user && process.env.NODE_ENV === 'development')
    return demoFixturesEnabled() ? demoShoppingItems : []
  if (!user) return []
  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id')
    // Filtrar por usuario es imprescindible: con dos personas en el hogar la
    // consulta sin filtro devuelve dos filas y `maybeSingle` falla.
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (membershipError) failure(membershipError)
  if (!membership) return []
  const { data: lists, error: listsError } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('household_id', membership.household_id)
    .eq('status', 'active')
    .limit(1)
  if (listsError) failure(listsError)
  const listId = lists?.[0]?.id
  if (!listId) return []
  const { data: items, error: itemsError } = await supabase
    .from('shopping_items')
    .select(
      'id,food_id,source,is_purchased,version,quantity,unit_code,created_at',
    )
    .eq('shopping_list_id', listId)
    .order('is_purchased')
    .order('created_at')
  if (itemsError) failure(itemsError)
  const foodIds = (items ?? []).map((item) => item.food_id)
  const { data: foods, error: foodsError } = foodIds.length
    ? await supabase.from('household_foods').select('id,name').in('id', foodIds)
    : { data: [], error: null }
  if (foodsError) failure(foodsError)
  const names = new Map((foods ?? []).map((food) => [food.id, food.name]))
  return (items ?? []).flatMap((item) => {
    const name = names.get(item.food_id)
    return name
      ? [
          {
            id: item.id,
            name,
            source: item.source as ShoppingItem['source'],
            isPurchased: item.is_purchased,
            version: item.version,
            quantity: item.quantity,
            unitCode: item.unit_code,
          },
        ]
      : []
  })
}

type CheckoutRow = {
  item_id: string
  version: number
  name: string
  action: 'add' | 'restore'
  suggested_zone: PantryZone | null
}

// Revisión C2: qué le pasará a la despensa a cada producto comprado.
export async function getCheckoutPreview(): Promise<CheckoutLine[]> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user && process.env.NODE_ENV === 'development')
    return demoFixturesEnabled() ? demoCheckoutLines : []
  const { data, error } = await supabase.rpc(
    'shopping_checkout_preview' as never,
  )
  if (error) failure(error)
  return ((data ?? []) as CheckoutRow[]).map((row) => ({
    itemId: row.item_id,
    version: row.version,
    name: row.name,
    action: row.action,
    suggestedZone: row.suggested_zone ?? null,
  }))
}

// Confirma la compra en la despensa. Idempotente; un CONFLICT significa que otro
// integrante cambió la lista y la revisión debe recargarse.
// `zone` solo aplica a productos nuevos sin zona sugerida por el catálogo: la
// persona la eligió a mano en la revisión.
export async function confirmPurchase(
  lines: { itemId: string; version: number; zone?: PantryZone }[],
  key?: string,
) {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(
    'shopping_confirm_purchase' as never,
    {
      item_versions: lines.map((line) => ({
        item_id: line.itemId,
        version: line.version,
        zone: line.zone,
      })),
      idempotency_key: parseIdempotencyKey(
        key ?? createIdempotencyKey('shopping_confirm_purchase'),
      ),
    } as never,
  )
  if (error) failure(error)
  revalidatePath('/compra')
  revalidatePath('/despensa')
  return data as { confirmed: number }
}

export async function setPurchaseQuantities(
  lines: { itemId: string; version: number; quantity: number }[],
) {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(
    'shopping_set_purchase_quantities' as never,
    {
      item_quantities: lines.map((line) => ({
        item_id: line.itemId,
        version: line.version,
        quantity: line.quantity,
      })),
    } as never,
  )
  if (error) failure(error)
  revalidatePath('/compra')
  return data as { items: { item_id: string; version: number }[] }
}
