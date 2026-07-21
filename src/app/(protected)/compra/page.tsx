import { getShoppingItems } from '@/modules/shopping/actions'
import { ShoppingWorkspace } from '@/modules/shopping/ShoppingWorkspace'

export default async function ShoppingPage() {
  const items = await getShoppingItems()
  return <ShoppingWorkspace initialItems={items} />
}
