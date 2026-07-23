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
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml',
  l: 'l', lt: 'l', litro: 'l', litros: 'l',
  ud: 'unit', uds: 'unit', u: 'unit', unidad: 'unit', unidades: 'unit',
}

// ponytail: quita ruido común del ticket (precio final, códigos de barras).
// Ceiling: solo cubre € y códigos largos; formatos raros los limpia la persona.
function stripNoise(line: string): string {
  return line
    .replace(/\s*\d+[.,]\d{2}\s*(€|eur)?\s*$/i, '') // precio final "2,45 €"
    .replace(/^\s*\d{6,}\s+/, '') // código de artículo al inicio
    .trim()
}

// Extrae una cantidad+unidad al final de la línea ("Tomate 500 g" → 500 g).
// Un número suelto al final se interpreta como unidades ("Manzanas 3" → 3 uds).
function extractQuantity(line: string): { name: string; quantity: number | null; unitCode: TicketLine['unitCode'] } {
  const match = line.match(/^(.*?)[\s·xX*]*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?\.?\s*$/)
  if (!match) return { name: line, quantity: null, unitCode: null }
  const rawName = match[1] ?? ''
  const rawNumber = match[2] ?? ''
  const rawUnit = match[3]
  const name = rawName.trim()
  if (!name) return { name: '', quantity: null, unitCode: null } // solo cantidad, sin producto: se descarta
  const quantity = Number(rawNumber.replace(',', '.'))
  const unitCode = rawUnit ? UNIT_ALIASES[rawUnit.toLowerCase()] ?? null : 'unit'
  // Unidad no reconocida (p. ej. "Tomate frito") → era parte del nombre, no cantidad.
  if (rawUnit && !unitCode) return { name: line, quantity: null, unitCode: null }
  if (!Number.isFinite(quantity) || quantity <= 0) return { name, quantity: null, unitCode: null }
  return { name, quantity, unitCode }
}

export function parseTicketLines(text: string): TicketLine[] {
  return text
    .split('\n')
    .map(stripNoise)
    .filter((line) => line.length > 0 && line.length <= 120)
    .map(extractQuantity)
    .filter((line) => line.name.length > 0)
    .map((line) => ({ name: line.name.slice(0, 120), quantity: line.quantity, unitCode: line.unitCode }))
}
