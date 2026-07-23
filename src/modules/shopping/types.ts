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
export type CheckoutLine = {
  itemId: string
  version: number
  name: string
  action: 'add' | 'restore'
}
