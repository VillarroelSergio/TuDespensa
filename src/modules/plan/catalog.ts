import { createSupabaseServerClient } from '@/lib/supabase/server'

import { buildCatalogEntries, type CatalogEntry } from './suggestions'

/**
 * Catálogo canónico de alimentos (con sinónimos) que hoy solo usa Compra para
 * adivinar la zona por defecto al confirmar una compra. Se reutiliza aquí para
 * que ingrediente↔despensa empareje por alimento real («pan del día anterior»
 * ↔ «Pan de molde»), no solo por texto parecido.
 */
export async function getCatalogEntries(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<CatalogEntry[]> {
  const [{ data: foods }, { data: aliases }] = await Promise.all([
    supabase.from('catalog_foods').select('id,canonical_name'),
    supabase.from('food_aliases').select('catalog_food_id,alias'),
  ])
  if (!foods?.length) return []
  const aliasesById = new Map<string, string[]>()
  for (const row of aliases ?? []) {
    aliasesById.set(row.catalog_food_id, [
      ...(aliasesById.get(row.catalog_food_id) ?? []),
      row.alias,
    ])
  }
  return buildCatalogEntries(
    foods.map((food) => ({
      canonicalName: food.canonical_name,
      terms: [food.canonical_name, ...(aliasesById.get(food.id) ?? [])],
    })),
  )
}

/** Para pantallas fuera de Plan (p. ej. la ficha de receta) sin un cliente ya abierto. */
export async function getIngredientCatalog(): Promise<CatalogEntry[]> {
  const supabase = await createSupabaseServerClient()
  return getCatalogEntries(supabase)
}
