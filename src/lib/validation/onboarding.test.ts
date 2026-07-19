import { describe, expect, it } from 'vitest'

import {
  parseFoodName,
  parseHouseholdName,
  parseIdempotencyKey,
  parsePeople,
} from './onboarding'

describe('onboarding validation', () => {
  it('normalizes a valid household name', () => {
    expect(parseHouseholdName('  Casa   Villa  ')).toBe('Casa Villa')
  })

  it.each(['', '   ', 'x'.repeat(81)])(
    'rejects an invalid household name: %j',
    (name) => {
      expect(() => parseHouseholdName(name)).toThrow('household name')
    },
  )

  it('normalizes up to ten household people', () => {
    expect(parsePeople(['  Ana ', 'Luis   Pérez'])).toEqual([
      'Ana',
      'Luis Pérez',
    ])
  })

  it('rejects duplicate people case-insensitively', () => {
    expect(() => parsePeople(['Ana', ' ana '])).toThrow('duplicate')
  })

  it('rejects more than ten household people', () => {
    expect(() =>
      parsePeople(Array.from({ length: 11 }, (_, i) => `P${i}`)),
    ).toThrow('at most 10')
  })

  it('normalizes a valid food name', () => {
    expect(parseFoodName('  Tomate   triturado ')).toBe('Tomate triturado')
  })

  it.each(['', 'x'.repeat(121)])('rejects an invalid food name', (name) => {
    expect(() => parseFoodName(name)).toThrow('food name')
  })

  it('accepts an opaque idempotency key within bounds', () => {
    expect(parseIdempotencyKey('onboard-12345678')).toBe('onboard-12345678')
  })

  it.each(['short', 'x'.repeat(121), ' contains-space '])(
    'rejects an invalid idempotency key',
    (key) => {
      expect(() => parseIdempotencyKey(key)).toThrow('idempotency key')
    },
  )
})
