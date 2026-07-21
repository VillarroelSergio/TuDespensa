import { describe, expect, it } from 'vitest'

import { createIdempotencyKey } from './keys'

describe('createIdempotencyKey', () => {
  it('combines a safe operation name with an opaque UUID', () => {
    expect(
      createIdempotencyKey(
        'confirm_baseline',
        () => '123e4567-e89b-12d3-a456-426614174000',
      ),
    ).toBe('confirm_baseline:123e4567-e89b-12d3-a456-426614174000')
  })

  it.each(['', 'has spaces', 'x'.repeat(41)])(
    'rejects an unsafe operation name: %j',
    (operation) => {
      expect(() => createIdempotencyKey(operation)).toThrow('operation')
    },
  )
})
