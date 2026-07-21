import type {
  PantryApproximateState,
  PantryAttentionState,
  PantryTrackingMode,
  PantryUnitCode,
} from './types'

export type PantryStatus = 'out' | 'low' | 'available'

export type PantryListItem = {
  id: string
  foodId: string
  name: string
  version: number
  trackingMode: PantryTrackingMode
  approximateState: PantryApproximateState | null
  attentionState: PantryAttentionState
  quantity: number | null
  unitCode: PantryUnitCode | null
  consumeSoon?: boolean
}

export type PresentedPantryItem = PantryListItem & {
  status: PantryStatus
  quantityLabel: string | null
}

export function pantryStatus(item: PantryListItem): PantryStatus {
  if (
    item.approximateState === 'out' ||
    ((item.trackingMode === 'units' || item.trackingMode === 'measure') &&
      (item.quantity ?? 0) <= 0)
  ) {
    return 'out'
  }

  if (
    item.approximateState === 'low' || item.attentionState === 'low' || item.consumeSoon === true
  ) {
    return 'low'
  }

  return 'available'
}

export function formatPantryQuantity(item: PantryListItem): string | null {
  if (item.trackingMode === 'approximate' || item.quantity === null) return null
  if (item.trackingMode === 'units') return `${item.quantity} uds.`
  return `${item.quantity} ${item.unitCode ?? ''}`.trim()
}

const rank: Record<PantryStatus, number> = { out: 0, low: 1, available: 2 }

export function prioritizePantryItems(
  items: PantryListItem[],
): PresentedPantryItem[] {
  return items
    .map((item) => ({
      ...item,
      status: pantryStatus(item),
      quantityLabel: formatPantryQuantity(item),
    }))
    .sort((left, right) =>
      rank[left.status] - rank[right.status] ||
      left.name.localeCompare(right.name, 'es'),
    )
}
