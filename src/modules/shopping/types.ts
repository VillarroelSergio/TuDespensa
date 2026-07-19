export type ShoppingItem = {
  id: string
  name: string
  source: 'manual' | 'pantry'
  isPurchased: boolean
  version: number
}
