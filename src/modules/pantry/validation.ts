import type {
  PantryApproximateState,
  PantryTrackingMode,
  PantryUnitCode,
} from './types'

const approximateStates = new Set<PantryApproximateState>([
  'plenty',
  'some',
  'low',
  'out',
])
const unitCodes = new Set<PantryUnitCode>(['unit', 'g', 'kg', 'ml', 'l'])

export function parsePantryQuantity(value: unknown): number {
  const quantity = typeof value === 'string' ? Number(value) : value
  if (
    typeof quantity !== 'number' ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    throw new Error('quantity must be a positive number')
  }
  return quantity
}

export function parsePantryState(value: unknown): PantryApproximateState {
  if (
    typeof value !== 'string' ||
    !approximateStates.has(value as PantryApproximateState)
  ) {
    throw new Error('approximate state is invalid')
  }
  return value as PantryApproximateState
}

export function parsePantryTracking(
  trackingMode: PantryTrackingMode,
  approximateState: unknown,
  quantity: unknown,
  unitCode: unknown,
) {
  if (trackingMode === 'approximate') {
    if (quantity !== null || unitCode !== null)
      throw new Error('approximate tracking cannot contain an exact quantity')
    return {
      trackingMode,
      approximateState: parsePantryState(approximateState),
      quantity: null,
      unitCode: null,
    }
  }

  const parsedQuantity = parsePantryQuantity(quantity)
  if (
    approximateState !== null ||
    typeof unitCode !== 'string' ||
    !unitCodes.has(unitCode as PantryUnitCode)
  ) {
    throw new Error('exact tracking requires a compatible unit')
  }
  if (trackingMode === 'units' && unitCode !== 'unit')
    throw new Error('unit tracking requires the unit code')
  if (trackingMode === 'measure' && unitCode === 'unit')
    throw new Error('measure tracking requires a mass or volume unit')

  return {
    trackingMode,
    approximateState: null,
    quantity: parsedQuantity,
    unitCode: unitCode as PantryUnitCode,
  }
}
