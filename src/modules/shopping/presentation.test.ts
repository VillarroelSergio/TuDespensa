import { describe, expect, it } from 'vitest'

import { checkoutActionLabel, confirmNotice, formatQuantity } from './presentation'
import type { CheckoutLine } from './types'

const line = (overrides: Partial<CheckoutLine> = {}): CheckoutLine => ({
  itemId: 'item-1',
  version: 1,
  name: 'Tomates',
  action: 'add',
  fromQuantity: null,
  fromUnit: null,
  toQuantity: null,
  toUnit: null,
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
    expect(checkoutActionLabel(line({ action: 'add' }))).toBe('Añadir a despensa')
  })
  it('un producto con cantidad compatible muestra la suma proyectada', () => {
    const label = checkoutActionLabel(
      line({ action: 'update', fromQuantity: 0.5, fromUnit: 'l', toQuantity: 1.5, toUnit: 'l' }),
    )
    expect(label).toBe('Actualizar: 0.5 l → 1.5 l')
  })
  it('sin suma posible solo refresca la presencia', () => {
    // Ya presente pero sin cantidad conocida: no hay «de → a» que mostrar.
    expect(checkoutActionLabel(line({ action: 'update' }))).toBe('Actualizar en despensa')
  })
  it('misma cantidad de entrada y salida no finge un cambio', () => {
    const label = checkoutActionLabel(
      line({ action: 'update', fromQuantity: 2, fromUnit: 'unit', toQuantity: 2, toUnit: 'unit' }),
    )
    expect(label).toBe('Actualizar en despensa')
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
