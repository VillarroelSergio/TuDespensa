import { PANTRY_ZONE_META } from '@/modules/pantry/presentation'

import type { CheckoutLine } from './types'

const UNIT_LABELS: Record<string, string> = {
  unit: 'uds.',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
}

// «500 g», «2 uds.»; sin unidad no mostramos nada, no inventamos «uds.».
export function formatQuantity(
  quantity: number | null,
  unitCode: string | null,
): string | null {
  if (quantity == null) return null
  const unit = unitCode ? (UNIT_LABELS[unitCode] ?? '') : ''
  return unit ? `${quantity} ${unit}` : String(quantity)
}

// Qué le pasará a la despensa al confirmar este producto: alta (con la zona
// que detectó el catálogo, si la detectó) o solo refrescar presencia (ya
// estaba, aunque estuviera "se terminó").
export function checkoutActionLabel(line: CheckoutLine): string {
  if (line.action !== 'add') return 'Ya estaba en tu despensa'
  if (!line.suggestedZone) return 'Añadir a despensa — elige dónde'
  return `Añadir a ${PANTRY_ZONE_META[line.suggestedZone].label}`
}

// Aviso tras confirmar: ?confirmado=n → «Hemos actualizado tu despensa con n…».
// Un valor no numérico o < 1 no muestra aviso.
export function confirmNotice(value: string | undefined): string | null {
  if (!value) return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) return null
  return `Hemos actualizado tu despensa con ${n} ${n === 1 ? 'producto' : 'productos'}.`
}

// Aviso tras importar un ticket: ?ticket=n → «Hemos añadido n… del ticket».
// Un valor no numérico o < 1 no muestra aviso (0 productos nuevos no es error:
// el ticket pudo repetir lo que ya estaba en la lista).
export function ticketNotice(value: string | undefined): string | null {
  if (!value) return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) return null
  return `Hemos añadido ${n} ${n === 1 ? 'producto' : 'productos'} del ticket a Compra, ya marcados como comprados.`
}
