import { describe, expect, it } from 'vitest'

import { checkoutActionLabel, confirmNotice, formatQuantity, shoppingProgress, ticketNotice } from './presentation'
import type { CheckoutLine } from './types'

const line = (overrides: Partial<CheckoutLine> = {}): CheckoutLine => ({
  itemId: 'item-1',
  version: 1,
  name: 'Tomates',
  action: 'add',
  suggestedZone: 'pantry',
  ...overrides,
})

describe('formatQuantity', () => {
  it('formatea cantidad con unidad', () => {
    expect(formatQuantity(500, 'g')).toBe('500 g')
    expect(formatQuantity(2, 'unit')).toBe('2 uds.')
  })
  it('sin cantidad no muestra nada', () => {
    expect(formatQuantity(null, 'g')).toBeNull()
  })
  it('sin unidad muestra solo el número, no inventa «uds.»', () => {
    expect(formatQuantity(3, null)).toBe('3')
  })
})

describe('checkoutActionLabel', () => {
  it('un producto nuevo se añade a la despensa', () => {
    expect(checkoutActionLabel(line({ action: 'add' }))).toBe('Añadir a Despensa')
  })
  it('pide elegir la zona cuando el catálogo no ofrece una', () => {
    expect(checkoutActionLabel(line({ suggestedZone: null }))).toBe('Añadir a despensa — elige dónde')
  })
  it('un producto existente solo refresca su presencia', () => {
    expect(checkoutActionLabel(line({ action: 'restore', suggestedZone: null }))).toBe('Ya estaba en tu despensa')
  })
})

describe('confirmNotice', () => {
  it('singular y plural', () => {
    expect(confirmNotice('1')).toBe('Hemos actualizado tu despensa con 1 producto.')
    expect(confirmNotice('3')).toBe('Hemos actualizado tu despensa con 3 productos.')
  })
  it('valores ausentes o inválidos no muestran aviso', () => {
    expect(confirmNotice(undefined)).toBeNull()
    expect(confirmNotice('0')).toBeNull()
    expect(confirmNotice('-1')).toBeNull()
    expect(confirmNotice('dos')).toBeNull()
  })
})

describe('ticketNotice', () => {
  it('informa de los productos importados', () => {
    expect(ticketNotice('1')).toBe('Hemos añadido 1 producto del ticket a Compra, ya marcados como comprados.')
    expect(ticketNotice('4')).toBe('Hemos añadido 4 productos del ticket a Compra, ya marcados como comprados.')
  })

  it('no muestra avisos para valores ausentes o inválidos', () => {
    expect(ticketNotice(undefined)).toBeNull()
    expect(ticketNotice('0')).toBeNull()
    expect(ticketNotice('dos')).toBeNull()
  })
})

describe('shoppingProgress', () => {
  it('explica lo que queda por comprar con un texto útil', () => {
    expect(shoppingProgress(6, 3)).toEqual({ label: '3 pendientes', ratio: 0.5 })
    expect(shoppingProgress(1, 1)).toEqual({ label: 'Compra lista', ratio: 1 })
  })

  it('no inventa progreso para una lista vacía', () => {
    expect(shoppingProgress(0, 0)).toEqual({ label: 'Aún no hay productos', ratio: 0 })
  })
})
