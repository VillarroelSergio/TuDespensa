import { matches, type CatalogEntry } from './suggestions'

/**
 * Núcleo puro de Fase 8: empareja los ingredientes de una receta con lo que hay
 * en la despensa, propone un descuento por producto y, con lo que la persona
 * confirma o corrige, arma el estado resultante que la RPC aplicará. Sin acceso a
 * red ni a React: así el emparejamiento y la aritmética de unidades son testables.
 */

export type CookIngredient = {
  name: string
  quantity: number | null
  unitCode: string | null
}

/** Producto presente en la despensa, con lo justo para descontar y versionar. */
export type CookPantryItem = {
  itemId: string
  name: string
  version: number
  trackingMode: 'approximate' | 'units' | 'measure'
  approximateState: string | null
  quantity: number | null
  unitCode: string | null
}

/** Una fila de la revisión: un producto de despensa con su descuento propuesto. */
export type CookLine = {
  itemId: string
  name: string
  version: number
  trackingMode: 'approximate' | 'units' | 'measure'
  quantity: number | null
  unitCode: string | null
  /** Cantidad y unidad reales almacenadas; la interfaz usa siempre uds. */
  storageQuantity?: number | null
  storageUnitCode?: string | null
  approximateState: string | null
  /** Cantidad a descontar prefijada; null si no se pudo calcular (unidades u origen). */
  proposedDiscount: number | null
  /** Aproximado: un nivel menos que el actual, como sugerencia editable. */
  proposedState: string | null
}

/** Estado resultante de un producto tras cocinar; es lo que recibe `plan_cook_meal`. */
export type Consumption = {
  item_id: string
  version: number
  tracking_mode: string
  approximate_state: string | null
  quantity: number | null
  unit_code: string | null
}

/** Edición de una fila hecha por la persona en la revisión. */
export type CookEdit = { included: boolean; discount: number; state: string }

/** Cuenta los productos que la persona ha decidido revisar antes de confirmar. */
export function selectedCookLineCount(
  lines: CookLine[],
  edits: Record<string, CookEdit>,
): number {
  return lines.filter((line) => edits[line.itemId]?.included).length
}

/** Copy breve que anticipa el alcance de la revisión antes de confirmar. */
export function cookReviewSummary(lines: CookLine[]) {
  if (lines.length === 0) {
    return {
      eyebrow: 'Todo listo',
      message: 'No hay productos que descontar de tu despensa.',
    }
  }
  return {
    eyebrow: 'Antes de cocinar',
    message: `Revisarás ${lines.length} ${lines.length === 1 ? 'producto' : 'productos'} de tu despensa.`,
  }
}

// La revisión trabaja con una unidad canónica: 1 kg/l = 1 uds.
// La unidad original se conserva para escribir de nuevo en la despensa.
const CANONICAL_FACTOR: Record<string, number> = {
  unit: 1,
  g: 0.001,
  kg: 1,
  ml: 0.001,
  l: 1,
}

const APPROX_ORDER = ['plenty', 'some', 'low', 'out'] as const

/** Evita ruido de coma flotante al restar cantidades. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Convierte una cantidad a la unidad canónica de revisión. */
function toCanonical(qty: number, unit: string): number | null {
  const factor = CANONICAL_FACTOR[unit]
  return factor === undefined ? null : round(qty * factor)
}

function fromCanonical(qty: number, unit: string): number | null {
  const factor = CANONICAL_FACTOR[unit]
  return factor === undefined || factor === 0 ? null : round(qty / factor)
}

/** Un nivel menos: la sugerencia por defecto para un producto aproximado. */
function stepDown(state: string | null): string {
  const index = APPROX_ORDER.indexOf(
    (state ?? 'some') as (typeof APPROX_ORDER)[number],
  )
  return (
    APPROX_ORDER[
      Math.min(index < 0 ? 1 : index + 1, APPROX_ORDER.length - 1)
    ] ?? 'out'
  )
}

/**
 * Filas de descuento: un producto por cada alimento de la despensa que empareja
 * con algún ingrediente. Los ingredientes sin producto en despensa no aparecen
 * (no hay nada que descontar); su falta se resuelve en Compra (Fase 6).
 */
export function buildCookLines(
  ingredients: CookIngredient[],
  pantry: CookPantryItem[],
  catalog: CatalogEntry[] = [],
): CookLine[] {
  return pantry.flatMap((item) => {
    // ponytail: primer ingrediente que empareja. Un producto que empareja con dos
    // ingredientes se descuenta una vez; la persona corrige si hace falta.
    const ingredient = ingredients.find((entry) =>
      matches(entry.name, item.name, catalog),
    )
    if (!ingredient) return []

    let proposedDiscount: number | null = null
    if (
      item.trackingMode !== 'approximate' &&
      item.quantity !== null &&
      item.unitCode &&
      ingredient.quantity !== null &&
      ingredient.unitCode
    ) {
      const converted = toCanonical(ingredient.quantity, ingredient.unitCode)
      const available = toCanonical(item.quantity, item.unitCode)
      // No se descuenta más de lo que hay: el resto se resolverá al reponer.
      if (converted !== null && available !== null)
        proposedDiscount = Math.min(available, converted)
    }

    const canonicalQuantity =
      item.trackingMode === 'approximate' ||
      item.quantity === null ||
      !item.unitCode
        ? item.quantity
        : toCanonical(item.quantity, item.unitCode)

    return [
      {
        itemId: item.itemId,
        name: item.name,
        version: item.version,
        trackingMode: item.trackingMode,
        quantity: canonicalQuantity,
        unitCode:
          item.trackingMode === 'approximate' ? item.unitCode : 'unit',
        storageQuantity: item.quantity,
        storageUnitCode: item.unitCode,
        approximateState: item.approximateState,
        proposedDiscount,
        proposedState:
          item.trackingMode === 'approximate'
            ? stepDown(item.approximateState)
            : null,
      },
    ]
  })
}

/** measure/units: descuenta la cantidad corregida, sin bajar de cero. */
function discountConsumption(line: CookLine, discount: number): Consumption {
  if (line.storageQuantity === undefined && line.storageUnitCode === undefined) {
    return {
      item_id: line.itemId,
      version: line.version,
      tracking_mode: line.trackingMode,
      approximate_state: null,
      quantity: Math.max(0, round((line.quantity ?? 0) - discount)),
      unit_code: line.unitCode,
    }
  }

  const storageUnit = line.storageUnitCode ?? 'unit'
  const currentCanonical =
    line.quantity ?? toCanonical(line.storageQuantity ?? 0, storageUnit) ?? 0
  const remainingCanonical = Math.max(0, round(currentCanonical - discount))
  return {
    item_id: line.itemId,
    version: line.version,
    tracking_mode: line.trackingMode,
    approximate_state: null,
    quantity:
      fromCanonical(remainingCanonical, storageUnit) ??
      Math.max(0, round((line.storageQuantity ?? 0) - discount)),
    unit_code: storageUnit,
  }
}

/** approximate: pasa al nivel elegido. */
function stateConsumption(line: CookLine, state: string): Consumption {
  return {
    item_id: line.itemId,
    version: line.version,
    tracking_mode: 'approximate',
    approximate_state: state,
    quantity: null,
    unit_code: null,
  }
}

/**
 * Con las ediciones de la persona, arma los descuentos a aplicar. Solo incluye
 * las filas marcadas y con un cambio real: un descuento de cero o un nivel igual
 * al actual no generan movimiento (evita ruido en la despensa).
 */
export function buildConsumptions(
  lines: CookLine[],
  edits: Record<string, CookEdit>,
): Consumption[] {
  return lines.flatMap((line) => {
    const edit = edits[line.itemId]
    if (!edit || !edit.included) return []
    if (line.trackingMode === 'approximate') {
      if (edit.state === (line.approximateState ?? 'some')) return []
      return [stateConsumption(line, edit.state)]
    }
    if (!edit.discount || edit.discount <= 0) return []
    return [discountConsumption(line, edit.discount)]
  })
}
