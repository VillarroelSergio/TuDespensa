import { describe, expect, it } from 'vitest'

import { backupFileName, parseBackup } from './backup'

describe('backupFileName', () => {
  it('creates a portable, dated filename without accents', () => {
    expect(backupFileName('Casa de María', '2026-07-28T10:30:00.000Z')).toBe(
      'midespensa-casa-de-maria-2026-07-28.json',
    )
  })

  it('uses a safe household fallback when the name has no usable characters', () => {
    expect(backupFileName('---', '2026-07-28T10:30:00.000Z')).toBe(
      'midespensa-hogar-2026-07-28.json',
    )
  })

  it('accepts a recognised backup envelope and rejects other JSON files', () => {
    const backup = {
      format: 'midespensa-backup',
      version: 1,
      generatedAt: '2026-07-28T10:30:00.000Z',
      household: { name: 'Casa' },
      counts: { recipes: 0, shoppingItems: 0, pantryItems: 0 },
      data: {},
    }

    expect(parseBackup(backup)).toEqual(backup)
    expect(parseBackup({ format: 'other' })).toBeNull()
  })
})
