import { describe, expect, it } from 'vitest'

import {
  buildConsumptions,
  buildCookLines,
  cookReviewSummary,
  selectedCookLineCount,
  type CookEdit,
  type CookLine,
  type CookPantryItem,
} from './cooking'

const pantryItem = (
  overrides: Partial<CookPantryItem> = {},
): CookPantryItem => ({
  itemId: 'item-1',
  name: 'Tomate',
  version: 1,
  trackingMode: 'measure',
  approximateState: null,
  quantity: 500,
  unitCode: 'g',
  ...overrides,
})

const line = (overrides: Partial<CookLine> = {}): CookLine => ({
  itemId: 'item-1',
  name: 'Tomate',
  version: 1,
  trackingMode: 'measure',
  quantity: 500,
  unitCode: 'g',
  approximateState: null,
  proposedDiscount: 200,
  proposedState: null,
  ...overrides,
})

describe('buildCookLines', () => {
  it('propone el descuento de un ingrediente con la misma unidad', () => {
    const lines = buildCookLines(
      [{ name: 'tomate', quantity: 200, unitCode: 'g' }],
      [pantryItem()],
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]!.proposedDiscount).toBe(0.2)
    expect(lines[0]!.quantity).toBe(0.5)
    expect(lines[0]!.unitCode).toBe('unit')
  })

  it('convierte cuando el ingrediente y el producto miden lo mismo en otra unidad', () => {
    const lines = buildCookLines(
      [{ name: 'aceite', quantity: 0.2, unitCode: 'l' }],
      [pantryItem({ name: 'Aceite', quantity: 1000, unitCode: 'ml' })],
    )
    expect(lines[0]!.proposedDiscount).toBe(0.2)
  })

  it('nunca propone descontar más de lo que hay', () => {
    const lines = buildCookLines(
      [{ name: 'tomate', quantity: 900, unitCode: 'g' }],
      [pantryItem({ quantity: 500 })],
    )
    expect(lines[0]!.proposedDiscount).toBe(0.5)
  })

  it('propone una resta parcial para productos contados por unidades', () => {
    const lines = buildCookLines(
      [{ name: 'tomate', quantity: 2, unitCode: 'unit' }],
      [
        pantryItem({
          trackingMode: 'units',
          quantity: 10,
          unitCode: 'unit',
        }),
      ],
    )
    expect(lines[0]!.proposedDiscount).toBe(2)
  })

  it('convierte medidas a unidades canónicas aunque cambie el tipo de medida', () => {
    const lines = buildCookLines(
      [{ name: 'tomate', quantity: 2, unitCode: 'unit' }],
      [pantryItem({ quantity: 500, unitCode: 'g' })],
    )
    expect(lines[0]!.proposedDiscount).toBe(0.5)
  })

  it('un producto aproximado propone bajar un nivel', () => {
    const lines = buildCookLines(
      [{ name: 'sal', quantity: null, unitCode: null }],
      [
        pantryItem({
          name: 'Sal',
          trackingMode: 'approximate',
          approximateState: 'some',
          quantity: null,
          unitCode: null,
        }),
      ],
    )
    expect(lines[0]!.proposedState).toBe('low')
    expect(lines[0]!.proposedDiscount).toBeNull()
  })

  it('un producto sin ingrediente que empareje no aparece: no hay nada que descontar', () => {
    const lines = buildCookLines(
      [{ name: 'cebolla', quantity: 1, unitCode: 'unit' }],
      [pantryItem({ name: 'Tomate' })],
    )
    expect(lines).toHaveLength(0)
  })
})

describe('buildConsumptions', () => {
  const edit = (overrides: Partial<CookEdit> = {}): CookEdit => ({
    included: true,
    discount: 200,
    state: 'low',
    ...overrides,
  })

  it('resta el descuento corregido y no baja de cero', () => {
    const [consumption] = buildConsumptions([line({ quantity: 500 })], {
      'item-1': edit({ discount: 800 }),
    })
    expect(consumption).toMatchObject({
      quantity: 0,
      tracking_mode: 'measure',
      unit_code: 'g',
    })
  })

  it('una fila desmarcada no genera descuento', () => {
    expect(
      buildConsumptions([line()], { 'item-1': edit({ included: false }) }),
    ).toEqual([])
  })

  it('conserva las unidades restantes tras un descuento parcial', () => {
    const [consumption] = buildConsumptions(
      [
        line({
          trackingMode: 'units',
          quantity: 10,
          unitCode: 'unit',
          proposedDiscount: 2,
        }),
      ],
      { 'item-1': edit({ discount: 2 }) },
    )
    expect(consumption).toMatchObject({
      tracking_mode: 'units',
      quantity: 8,
      unit_code: 'unit',
    })
  })

  it('un descuento de cero no genera movimiento', () => {
    expect(
      buildConsumptions([line()], { 'item-1': edit({ discount: 0 }) }),
    ).toEqual([])
  })

  it('un aproximado que cambia de nivel genera el nuevo estado', () => {
    const approx = line({
      trackingMode: 'approximate',
      quantity: null,
      unitCode: null,
      approximateState: 'some',
      proposedState: 'low',
    })
    const [consumption] = buildConsumptions([approx], {
      'item-1': edit({ state: 'low' }),
    })
    expect(consumption).toMatchObject({
      tracking_mode: 'approximate',
      approximate_state: 'low',
      quantity: null,
    })
  })

  it('un aproximado que no cambia de nivel no genera movimiento', () => {
    const approx = line({
      trackingMode: 'approximate',
      quantity: null,
      unitCode: null,
      approximateState: 'some',
    })
    expect(
      buildConsumptions([approx], { 'item-1': edit({ state: 'some' }) }),
    ).toEqual([])
  })
})

describe('cookReviewSummary', () => {
  it('explica cuántos productos se revisarán antes de cocinar', () => {
    expect(
      cookReviewSummary([line(), line({ itemId: 'item-2', name: 'Aceite' })]),
    ).toEqual({
      eyebrow: 'Antes de cocinar',
      message: 'Revisarás 2 productos de tu despensa.',
    })
  })

  it('da tranquilidad cuando no hay nada que descontar', () => {
    expect(cookReviewSummary([])).toEqual({
      eyebrow: 'Todo listo',
      message: 'No hay productos que descontar de tu despensa.',
    })
  })
})

describe('selectedCookLineCount', () => {
  it('no cuenta como seleccionado un producto que la persona ha desmarcado', () => {
    expect(
      selectedCookLineCount(
        [line(), line({ itemId: 'item-2', name: 'Cebolla' })],
        {
          'item-1': { included: true, discount: 200, state: 'low' },
          'item-2': { included: false, discount: 200, state: 'low' },
        },
      ),
    ).toBe(1)
  })
})
