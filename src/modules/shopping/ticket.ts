// Fase 10: convierte el texto pegado de un ticket en líneas revisables. Es una
// heurística deliberadamente simple —una línea por producto— porque la persona
// corrige el resultado antes de confirmar; no intenta entender formatos de
// supermercado ni precios.

export type TicketLine = {
  name: string
  quantity: number | null
  unitCode: 'unit' | 'g' | 'kg' | 'ml' | 'l' | null
}

const UNIT_ALIASES: Record<string, TicketLine['unitCode']> = {
  g: 'g',
  gr: 'g',
  grs: 'g',
  gramo: 'g',
  gramos: 'g',
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  ml: 'ml',
  l: 'l',
  lt: 'l',
  litro: 'l',
  litros: 'l',
  ud: 'unit',
  uds: 'unit',
  u: 'unit',
  unidad: 'unit',
  unidades: 'unit',
}

// ponytail: quita ruido común del ticket (precio final, códigos de barras).
// Ceiling: solo cubre € y códigos largos; formatos raros los limpia la persona.
function stripNoise(line: string): string {
  return (
    line
      // El importe puede ser negativo (línea de descuento: "Desc. -2,25 €").
      .replace(/\s*-?\d+(?:[.,]\d{2})\s*(?:€|eur)\s*\d*\s*$/i, '')
      // Ticket digital: "Producto 2 1,25 2,50". Quitamos los importes para
      // que extractQuantity conserve el 2 como unidades del producto.
      .replace(
        /\s+\d+(?:[.,]\d{2})(?:\s*(?:€|eur))?(?:\s+\d+(?:[.,]\d{2})(?:\s*(?:€|eur))?){0,2}\s*$/i,
        '',
      )
      .replace(/^\s*\d{6,}\s+/, '') // código de artículo al inicio
      .replace(/\s+/g, ' ')
      .trim()
  )
}

const IGNORABLE_LINES =
  /^(?:desc\.?|a\s+pagar|total|subtotal|iva|cambio|efectivo|tarjeta|art[ií]culos?|descripci[oó]n|producto|cantidad|precio|importe|fecha|tienda|nif|ticket)$/i

type DetectedAmount = Pick<TicketLine, 'quantity' | 'unitCode'>

function detectLeadingAmount(line: string): DetectedAmount | null {
  const weight = line.match(
    /^(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:€|eur)(?:\s*\/\s*(?:kg|g|l|ml))?\s*$/i,
  )
  if (weight) {
    const unitCode = UNIT_ALIASES[weight[2]?.toLowerCase() ?? '']
    return unitCode
      ? { quantity: Number(weight[1]?.replace(',', '.')), unitCode }
      : null
  }

  const units = line.match(
    /^(\d+(?:[.,]\d+)?)\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:€|eur)\s*$/i,
  )
  return units
    ? { quantity: Number(units[1]?.replace(',', '.')), unitCode: 'unit' }
    : null
}

// Extrae una cantidad+unidad al final de la línea ("Tomate 500 g" → 500 g).
// Un número suelto al final se interpreta como unidades ("Manzanas 3" → 3 uds).
function extractQuantity(line: string): {
  name: string
  quantity: number | null
  unitCode: TicketLine['unitCode']
} {
  const match = line.match(
    /^(.*?)[\s·xX*]*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?\.?\s*$/,
  )
  if (!match) return { name: line, quantity: null, unitCode: null }
  const rawName = match[1] ?? ''
  const rawNumber = match[2] ?? ''
  const rawUnit = match[3]
  const name = rawName.trim()
  if (!name) return { name: '', quantity: null, unitCode: null } // solo cantidad, sin producto: se descarta
  const quantity = Number(rawNumber.replace(',', '.'))
  const unitCode = rawUnit
    ? (UNIT_ALIASES[rawUnit.toLowerCase()] ?? null)
    : 'unit'
  // Unidad no reconocida (p. ej. "Tomate frito") → era parte del nombre, no cantidad.
  if (rawUnit && !unitCode)
    return { name: line, quantity: null, unitCode: null }
  if (!Number.isFinite(quantity) || quantity <= 0)
    return { name, quantity: null, unitCode: null }
  return { name, quantity, unitCode }
}

export function parseTicketLines(text: string): TicketLine[] {
  const lines: TicketLine[] = []
  let pendingAmount: DetectedAmount | null = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim()
    if (!line || line.length > 120) continue

    const amount = detectLeadingAmount(line)
    if (amount) {
      pendingAmount = amount
      continue
    }

    const product = stripNoise(line)
    if (
      !product ||
      IGNORABLE_LINES.test(product) ||
      !/[a-záéíóúüñ]/i.test(product)
    ) {
      continue
    }

    const parsed = extractQuantity(product)
    const withPending =
      parsed.quantity === null && pendingAmount
        ? { ...parsed, ...pendingAmount }
        : parsed
    lines.push({
      name: withPending.name.slice(0, 120),
      quantity: withPending.quantity,
      unitCode: withPending.unitCode,
    })
    pendingAmount = null
  }

  return lines
}
