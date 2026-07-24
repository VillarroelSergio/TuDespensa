import { describe, expect, it } from 'vitest'

import { parseTicketLines } from './ticket'

describe('parseTicketLines', () => {
  it('una línea por producto, ignorando líneas vacías', () => {
    expect(parseTicketLines('Tomate\n\n  Leche  \n')).toEqual([
      { name: 'Tomate', quantity: null, unitCode: null },
      { name: 'Leche', quantity: null, unitCode: null },
    ])
  })

  it('extrae cantidad y unidad al final', () => {
    expect(parseTicketLines('Tomate 500 g')).toEqual([
      { name: 'Tomate', quantity: 500, unitCode: 'g' },
    ])
    expect(parseTicketLines('Leche 1,5 l')).toEqual([
      { name: 'Leche', quantity: 1.5, unitCode: 'l' },
    ])
  })

  it('normaliza alias de unidad y decimales con coma', () => {
    expect(parseTicketLines('Harina 1 kilo')).toEqual([
      { name: 'Harina', quantity: 1, unitCode: 'kg' },
    ])
  })

  it('un número suelto al final cuenta como unidades', () => {
    expect(parseTicketLines('Manzanas 3')).toEqual([
      { name: 'Manzanas', quantity: 3, unitCode: 'unit' },
    ])
  })

  it('una palabra final que no es unidad se queda en el nombre', () => {
    // "frito" no es unidad: "Tomate frito" es el producto, sin cantidad.
    expect(parseTicketLines('Tomate frito')).toEqual([
      { name: 'Tomate frito', quantity: null, unitCode: null },
    ])
  })

  it('quita el precio final y el código de artículo', () => {
    expect(parseTicketLines('284710 Aceite de oliva 4,95 €')).toEqual([
      { name: 'Aceite de oliva', quantity: null, unitCode: null },
    ])
  })

  it('una línea que es solo un número no se separa en nombre vacío', () => {
    // Sin nombre no hay producto: la línea se descarta.
    expect(parseTicketLines('  42  ')).toEqual([])
  })
})
