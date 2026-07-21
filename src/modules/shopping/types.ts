export type ShoppingItem = {
  id: string
  name: string
  source: 'manual' | 'pantry' | 'plan'
  isPurchased: boolean
  version: number
  quantity: number | null
  unitCode: string | null
}
