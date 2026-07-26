import { describe, expect, it } from 'vitest'

import { parseTicketLines } from './ticket'

describe('parseTicketLines · PDF de ticket', () => {
  it('descarta cabeceras, datos fiscales y códigos del documento', () => {
    expect(
      parseTicketLines(
        [
          'Compra en AV IRLANDA S/N',
          '26/06/2026 13:08 N° de Tienda',
          '10018',
          'Factura simplificada N° 1001804-',
          '92604',
          'N° de caja: 4. N° de empleado',
          '120970',
          '1D: ES-10018-04-00092604-20260626-',
          'LECHE ENTERA 2 1,25 2,50',
          'TOTAL 2,50',
        ].join(String.fromCharCode(10)),
      ),
    ).toEqual([{ name: 'LECHE ENTERA', quantity: 2, unitCode: 'unit' }])
  })
})
