export type ShoppingItem = {
  id: string
  name: string
  source: 'manual' | 'pantry' | 'plan'
  isPurchased: boolean
  version: number
  quantity: number | null
  unitCode: string | null
}

// Una línea de la revisión C2: qué le pasará a la despensa al confirmar la compra.
export type CheckoutLine = {
  itemId: string
  version: number
  name: string
  action: 'add' | 'update'
  fromQuantity: number | null
  fromUnit: string | null
  toQuantity: number | null
  toUnit: string | null
}
