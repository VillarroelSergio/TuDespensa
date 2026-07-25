import { describe, expect, it } from 'vitest'

import { classifyFoodGroup, foodGroupLabel } from './foodGroups'

describe('classifyFoodGroup', () => {
  it('reconoce legumbres ignorando tildes y mayúsculas', () => {
    expect(classifyFoodGroup(['Lentejas', 'zanahoria'])).toBe('legumbre')
  })

  it('prioriza legumbre sobre carne cuando ambas aparecen', () => {
    expect(classifyFoodGroup(['lentejas', 'chorizo'])).toBe('legumbre')
  })

  it('no clasifica una receta sin proteína reconocida', () => {
    expect(
      classifyFoodGroup(['tomate', 'pepino', 'aceite de oliva']),
    ).toBeNull()
  })

  it('etiqueta cada grupo en español', () => {
    expect(foodGroupLabel('pescado')).toBe('pescado')
    expect(foodGroupLabel('carne_roja')).toBe('carne roja')
  })
})
