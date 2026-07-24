/**
 * Normaliza un ingrediente de receta. El catálogo guarda la cantidad incrustada
 * en el nombre («1/4 cebolla», «* 800 g tomate maduro») con `quantity`/`unitCode`
 * a null. Este parser separa cantidad + unidad del nombre limpio para que la
 * despensa, la Compra y el «cocinar» emparejen y descuenten bien. Sin IA: es un
 * reconocimiento determinista de la cabecera del texto.
 */

export type ParsedIngredient = {
  name: string
  quantity: number | null
  unitCode: string | null
}

// Sinónimos de unidad → código canónico (mismo enum que la BD: unit,g,kg,ml,l).
const UNIT_ALIASES: Record<string, string> = {
  g: 'g',
  gr: 'g',
  gramo: 'g',
  gramos: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogramo: 'kg',
  kilogramos: 'kg',
  ml: 'ml',
  cl: 'ml', // se convierte a ml más abajo (1 cl = 10 ml)
  l: 'l',
  litro: 'l',
  litros: 'l',
  ud: 'unit',
  uds: 'unit',
  unidad: 'unit',
  unidades: 'unit',
}

/** «1/2» → 0.5, «0,5» → 0.5, «2» → 2. Devuelve null si no es un número al inicio. */
function parseLeadingNumber(token: string): number | null {
  const fraction = token.match(/^(\d+)\/(\d+)$/)
  if (fraction) {
    const denominator = Number(fraction[2])
    return denominator ? Number(fraction[1]) / denominator : null
  }
  const decimal = token.replace(',', '.')
  return /^\d+(\.\d+)?$/.test(decimal) ? Number(decimal) : null
}

export function parseIngredient(
  rawName: string,
  quantity: number | null = null,
  unitCode: string | null = null,
): ParsedIngredient {
  // Quita viñeta inicial de las fichas del catálogo y espacios sobrantes.
  const cleaned = rawName.replace(/^[*•\-\s]+/, '').trim()
  const tokens = cleaned.split(/\s+/)

  let parsedQuantity: number | null = null
  let parsedUnit: string | null = null
  let consumed = 0

  const amount = parseLeadingNumber(tokens[0] ?? '')
  if (amount !== null) {
    parsedQuantity = amount
    consumed = 1
    const unitAlias = UNIT_ALIASES[(tokens[1] ?? '').toLocaleLowerCase('es')]
    if (unitAlias) {
      parsedUnit = unitAlias
      consumed = 2
      if ((tokens[1] ?? '').toLocaleLowerCase('es') === 'cl') {
        parsedQuantity = parsedQuantity * 10
      }
    } else {
      // «1/4 cebolla»: número sin unidad → son unidades contables.
      parsedUnit = 'unit'
    }
  }

  const name = tokens.slice(consumed).join(' ').trim() || cleaned

  // Los campos explícitos de la fila mandan sobre lo deducido del texto.
  return {
    name,
    quantity: quantity ?? parsedQuantity,
    unitCode: unitCode ?? parsedUnit,
  }
}
