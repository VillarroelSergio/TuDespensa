import { describe, expect, it } from 'vitest'

import {
  parsePantryQuantity,
  parsePantryState,
  parsePantryTracking,
} from './validation'

describe('pantry validation', () => {
  it('accepts an approximate state without an exact quantity', () => {
    expect(parsePantryTracking('approximate', 'low', null, null)).toEqual({
      trackingMode: 'approximate',
      approximateState: 'low',
      quantity: null,
      unitCode: null,
    })
  })

  it('accepts exact units and measure quantities', () => {
    expect(parsePantryTracking('units', null, '3', 'unit')).toEqual({
      trackingMode: 'units',
      approximateState: null,
      quantity: 3,
      unitCode: 'unit',
    })
    expect(parsePantryTracking('measure', null, 0.75, 'kg')).toEqual({
      trackingMode: 'measure',
      approximateState: null,
      quantity: 0.75,
      unitCode: 'kg',
    })
  })

  it.each([0, -1, 'nope', Number.NaN])(
    'rejects invalid quantities: %j',
    (value) => {
      expect(() => parsePantryQuantity(value)).toThrow('quantity')
    },
  )

  it.each(['unknown', '', null])(
    'rejects invalid approximate states: %j',
    (state) => {
      expect(() => parsePantryState(state)).toThrow('approximate state')
    },
  )

  it('rejects incoherent tracking payloads', () => {
    expect(() => parsePantryTracking('approximate', 'some', 2, null)).toThrow(
      'approximate',
    )
    expect(() => parsePantryTracking('units', null, 1, 'kg')).toThrow('unit')
    expect(() => parsePantryTracking('measure', null, 1, 'unit')).toThrow(
      'measure',
    )
  })
})
