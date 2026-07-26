import { describe, expect, it } from 'vitest'

import { buildConsumptions, buildCookLines } from './cooking'

describe('cooking · canonical unit display', () => {
  it('converts 400 g of acelgas into 0.4 units', () => {
    const [line] = buildCookLines(
      [{ name: 'acelgas', quantity: 400, unitCode: 'g' }],
      [
        {
          itemId: 'acelgas-1',
          name: 'Acelgas',
          version: 1,
          trackingMode: 'units',
          approximateState: null,
          quantity: 1,
          unitCode: 'unit',
        },
      ],
    )

    expect(line).toMatchObject({
      quantity: 1,
      unitCode: 'unit',
      proposedDiscount: 0.4,
    })
  })

  it('converts 200 g of chickpeas into 0.2 units', () => {
    const [line] = buildCookLines(
      [{ name: 'garbanzos', quantity: 200, unitCode: 'g' }],
      [
        {
          itemId: 'chickpeas-1',
          name: 'Garbanzos cocidos',
          version: 1,
          trackingMode: 'units',
          approximateState: null,
          quantity: 1,
          unitCode: 'unit',
        },
      ],
    )

    expect(line?.proposedDiscount).toBe(0.2)
  })

  it('shows measured pantry items as units but writes the remaining storage unit', () => {
    const [line] = buildCookLines(
      [{ name: 'leche', quantity: 0.5, unitCode: 'l' }],
      [
        {
          itemId: 'milk-1',
          name: 'Leche',
          version: 1,
          trackingMode: 'measure',
          approximateState: null,
          quantity: 1,
          unitCode: 'l',
        },
      ],
    )

    expect(line).toMatchObject({
      quantity: 1,
      unitCode: 'unit',
      proposedDiscount: 0.5,
    })
    expect(
      buildConsumptions([line!], {
        'milk-1': { included: true, discount: 0.5, state: 'some' },
      }),
    ).toContainEqual(
      expect.objectContaining({
        quantity: 0.5,
        unit_code: 'l',
        tracking_mode: 'measure',
      }),
    )
  })
})
