export type ShoppingItem = {
  id: string
  name: string
  source: 'manual' | 'pantry' | 'plan'
  isPurchased: boolean
  version: number
  quantity: number | null
  unitCode: string | null
}

// Una línea de la revisión C2: qué le pasará a la despensa al confirmar la
// compra. La despensa solo guarda presencia, así que no hay cantidades que
// mostrar aquí: 'add' es un producto nuevo, 'restore' uno que ya existía.
import type { PantryZone } from '@/modules/pantry/types'

export type CheckoutLine = {
  itemId: string
  version: number
  name: string
  action: 'add' | 'restore'
  // Zona sugerida por el catálogo para un alta; null si el producto no tiene
  // coincidencia de catálogo y hay que elegir la zona a mano. Irrelevante en
  // 'restore' (el producto ya tiene zona en la despensa).
  suggestedZone: PantryZone | null
}
