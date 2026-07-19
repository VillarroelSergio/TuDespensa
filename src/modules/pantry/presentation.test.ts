import { describe, expect, it } from 'vitest'

import {
  formatPantryQuantity,
  prioritizePantryItems,
  type PantryListItem,
} from './presentation'

const item = (overrides: Partial<PantryListItem>): PantryListItem => ({
  id: 'item-1',
  foodId: 'food-1',
  name: 'Aceite de oliva',
  version: 1,
  trackingMode: 'approximate',
  approximateState: 'plenty',
  quantity: null,
  unitCode: null,
  consumeSoon: false,
  ...overrides,
})

describe('pantry presentation', () => {
  it('places exhausted and low products before available products', () => {
    const rows = prioritizePantryItems([
      item({ id: 'available', name: 'Yogures', trackingMode: 'units', quantity: 4, unitCode: 'unit', approximateState: null }),
      item({ id: 'low', name: 'Arroz', trackingMode: 'measure', quantity: 200, unitCode: 'g', approximateState: null, consumeSoon: true }),
      item({ id: 'out', name: 'Leche', trackingMode: 'units', quantity: 0, unitCode: 'unit', approximateState: null }),
    ])

    expect(rows.map((row) => [row.name, row.status])).toEqual([
      ['Leche', 'out'],
      ['Arroz', 'low'],
      ['Yogures', 'available'],
    ])
  })

  it('does not mark a measured item as low solely because it has a quantity', () => {
    const [macarrones] = prioritizePantryItems([
      item({ trackingMode: 'measure', quantity: 500, unitCode: 'g', approximateState: null }),
    ])

    expect(macarrones?.status).toBe('available')
  })

  it('renders only the meaningful quantity for each tracking mode', () => {
    expect(formatPantryQuantity(item({ trackingMode: 'units', quantity: 3, unitCode: 'unit', approximateState: null }))).toBe('3 uds.')
    expect(formatPantryQuantity(item({ trackingMode: 'measure', quantity: 500, unitCode: 'g', approximateState: null }))).toBe('500 g')
    expect(formatPantryQuantity(item())).toBe(null)
  })
})
