import { describe, expect, it } from 'vitest'

import { isRpcConflictResult } from './rpcConflict'

describe('isRpcConflictResult', () => {
  it('recognises the controlled database response for an optimistic conflict', () => {
    expect(isRpcConflictResult({ status: 'conflict' })).toBe(true)
  })

  it.each([
    [null, false],
    [undefined, false],
    [{}, false],
    [{ status: 'ok' }, false],
    [{ status: 'conflict', extra: 1 }, true],
  ])('classifies %j as conflict: %s', (value, expected) => {
    expect(isRpcConflictResult(value)).toBe(expected)
  })
})
