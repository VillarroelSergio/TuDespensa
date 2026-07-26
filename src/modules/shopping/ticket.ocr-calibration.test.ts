import { describe, expect, it } from 'vitest'

import { parseTicketLines } from './ticket'

describe('parseTicketLines · OCR calibration', () => {
  it('recovers quantity from a damaged multiplication line and removes OCR price columns', () => {
    expect(
      parseTicketLines(
        '6 × 0,% €\nLECHE ENTERA MILSANI, 576 €\n6 × 0,82 €\nLECHE DESNATADA, 1L 4,97 € 7 e',
      ),
    ).toEqual([
      { name: 'LECHE ENTERA MILSANI', quantity: 6, unitCode: 'unit' },
      { name: 'LECHE DESNATADA, 1L', quantity: 6, unitCode: 'unit' },
    ])
  })

  it('removes a price when OCR turns the euro sign into a trailing letter', () => {
    expect(
      parseTicketLines(
        'COCA-COLA ZERO RACK 2X 3,95 es\nMOZZARELLA, 1256 185€',
      ),
    ).toEqual([
      { name: 'COCA-COLA ZERO RACK 2X', quantity: null, unitCode: null },
      { name: 'MOZZARELLA, 1256', quantity: null, unitCode: null },
    ])
  })

  it('accepts a damaged currency marker in a weighted quantity line', () => {
    expect(
      parseTicketLines('1,270 kg x 2,89 e/kg\nBONIATO GRANEL 3,67 e 2'),
    ).toEqual([
      { name: 'BONIATO GRANEL', quantity: 1.27, unitCode: 'kg' },
    ])
  })
})
