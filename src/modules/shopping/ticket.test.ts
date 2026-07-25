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

  it('descarta el importe y grupo de IVA de la columna derecha del ticket', () => {
    expect(parseTicketLines('LECHE ENTERA MILSANI 5,76 € 2')).toEqual([
      { name: 'LECHE ENTERA MILSANI', quantity: null, unitCode: null },
    ])
  })

  it('asocia el peso o las unidades de una línea previa al siguiente producto', () => {
    expect(
      parseTicketLines(
        '6 x 0,96 €\nLECHE ENTERA MILSANI 5,76 € 2\n1,270 kg x 2,89 €/kg\nBONIATO GRANEL 3,67 € 2',
      ),
    ).toEqual([
      { name: 'LECHE ENTERA MILSANI', quantity: 6, unitCode: 'unit' },
      { name: 'BONIATO GRANEL', quantity: 1.27, unitCode: 'kg' },
    ])
  })

  it('no ofrece descuentos ni totales como productos', () => {
    expect(parseTicketLines('Desc.\n-2,25 €\nA PAGAR 99,53 €')).toEqual([])
  })

  it('extrae productos y unidades de una fila de ticket PDF sin símbolo de euro', () => {
    expect(
      parseTicketLines('LECHE ENTERA 2 1,25 2,50\nARTICULOS\nTOTAL 2,50'),
    ).toEqual([{ name: 'LECHE ENTERA', quantity: 2, unitCode: 'unit' }])
  })

  it('una línea que es solo un número no se separa en nombre vacío', () => {
    // Sin nombre no hay producto: la línea se descarta.
    expect(parseTicketLines('  42  ')).toEqual([])
  })

  it('procesa un ticket de supermercado real completo', () => {
    const realTicket = `
6 x 0,96 €
LECHE ENTERA MILSANI 5,76 € 2
6 x 0,82 €
LECHE DESNATADA, 1L 4,92 € 2
COCA-COLA ZERO PACK 2X 3,95 € 4
QUESO BURGOS 0% 4X62,5 1,09 € 2
MOZZARELLA, 125G 0,85 € 2
YOGUR BIFIDUS NATURAL 1,45 € 2
SPRAY SOLAR BIFASICO 5 6,99 € 4
PECHUGA PAVO BIPACK 3,79 € 3
BURRATA O RICOTTA 1,67 € 2
PIMIENTOS EN TIRAS 2,59 € 3
BUR.MEAT MIX.PICADA 1K 7,75 € 3
CALDO DE POLLO 0,69 € 3
CALDO DE VERDURAS 1 L 0,89 € 3
MAHOU CLASICA 12 X 33 9,24 € 4
Desc. -2,25 €
1,270 kg x 2,89 €/kg
BONIATO GRANEL 3,67 € 2
LIMON MALLA 2,25 € 2
5,764 kg x 0,95 €/kg
SANDIA RAYADA 5,48 € 2
Desc. -1,50 €
ESPINACAS 1,49 € 2
CEBOLLA ROJA 500G 1,39 € 2
ENSALADA ICEBERG 0,99 € 2
QUESO SEMI CUNA 2,89 € 2
2 x 0,99 €
TOMATE CHERRY 250G 1,98 € 2
CAFE EN GRANO INTENSO 9,99 € 3
MAIZ 150GX3 1,49 € 3
0,854 kg x 2,85 €/kg
PLATANO DE CANARIAS 2,43 € 2
FUET TARRADELLAS, 180G 2,45 € 3
REMOLACHA COCIDA 0,99 € 3
SHIIMEJI 150G 1,19 € 2
3 x 1,25 €
AGUACATE PIEZA 3,75 € 2
0,856 kg x 1,69 €/kg
PEPINO GRANEL 1,45 € 2
Desc. -0,46 €
0,470 kg x 2,49 €/kg
PIMIENTO DULCE ITALIAN 1,17 € 2
CHAMPINON ENTERO 1,29 € 2
QUESO TIERNO CUNA 2,59 € 2
DIGESTIVE AVENA PEP.CH 2,19 € 3
SURT. PAN CRUJIENTE 0,99 € 2
A PAGAR 99,53 €
`
    const lines = parseTicketLines(realTicket)

    // Se leen todos los productos de un ticket real de ~40 líneas, sin colar
    // descuentos ni el total.
    expect(lines.some((line) => line.name === 'A PAGAR')).toBe(false)
    expect(lines.some((line) => line.name.startsWith('Desc'))).toBe(false)
    expect(lines).toContainEqual({
      name: 'ESPINACAS',
      quantity: null,
      unitCode: null,
    })
    expect(lines).toContainEqual({
      name: 'CEBOLLA ROJA',
      quantity: 500,
      unitCode: 'g',
    })
    // El peso a granel de la línea anterior ("1,270 kg x 2,89 €/kg") se asocia
    // al producto sin peso propio en la etiqueta.
    expect(lines).toContainEqual({
      name: 'BONIATO GRANEL',
      quantity: 1.27,
      unitCode: 'kg',
    })
    expect(lines).toContainEqual({
      name: 'SANDIA RAYADA',
      quantity: 5.764,
      unitCode: 'kg',
    })
    // "AGUACATE PIEZA" se vende por unidades (3 x 1,25 €), el peso a granel de
    // la línea siguiente pertenece al producto de después (PEPINO GRANEL).
    expect(lines).toContainEqual({
      name: 'AGUACATE PIEZA',
      quantity: 3,
      unitCode: 'unit',
    })
    expect(lines).toContainEqual({
      name: 'PEPINO GRANEL',
      quantity: 0.856,
      unitCode: 'kg',
    })
    expect(lines.length).toBeGreaterThan(30)
  })
})
