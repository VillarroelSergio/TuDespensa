import { describe, expect, it } from 'vitest'

import { parseIngredient } from './ingredient-normalize'

describe('parseIngredient', () => {
  it('separa fracción sin unidad como unidades contables', () => {
    expect(parseIngredient('1/4 cebolla')).toEqual({
      name: 'cebolla',
      quantity: 0.25,
      unitCode: 'unit',
    })
    expect(parseIngredient('1/2 pepino')).toEqual({
      name: 'pepino',
      quantity: 0.5,
      unitCode: 'unit',
    })
  })

  it('quita la viñeta y extrae cantidad + unidad del nombre', () => {
    expect(parseIngredient('* 800 g tomate maduro')).toEqual({
      name: 'tomate maduro',
      quantity: 800,
      unitCode: 'g',
    })
  })

  it('deja el nombre intacto cuando no hay cantidad al inicio', () => {
    expect(parseIngredient('aceite de oliva')).toEqual({
      name: 'aceite de oliva',
      quantity: null,
      unitCode: null,
    })
  })

  it('respeta los campos explícitos de la fila sobre el texto', () => {
    expect(parseIngredient('aceite de oliva', 40, 'ml')).toEqual({
      name: 'aceite de oliva',
      quantity: 40,
      unitCode: 'ml',
    })
  })

  it('convierte cl a ml', () => {
    expect(parseIngredient('5 cl vino blanco')).toEqual({
      name: 'vino blanco',
      quantity: 50,
      unitCode: 'ml',
    })
  })

  it('conserva la unidad declarada (kg) sin pasar a base', () => {
    expect(parseIngredient('0,5 kg patata')).toEqual({
      name: 'patata',
      quantity: 0.5,
      unitCode: 'kg',
    })
  })

  it('repara el UTF-8 doblemente codificado del catálogo', () => {
    // «í» (UTF-8: C3 AD) reinterpretado como Latin-1 y recodificado a UTF-8
    // queda como U+00C3 U+00AD: «Ã» + guion suave invisible.
    const mojibakeI = String.fromCharCode(0xc3, 0xad)
    expect(parseIngredient(`* 1 calabac${mojibakeI}n grande`)).toEqual({
      name: 'calabacín grande',
      quantity: 1,
      unitCode: 'unit',
    })
    expect(parseIngredient(`jud${mojibakeI}as verdes`)).toEqual({
      name: 'judías verdes',
      quantity: null,
      unitCode: null,
    })
  })
})
