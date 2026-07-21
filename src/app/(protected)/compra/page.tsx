import { getShoppingItems } from '@/modules/shopping/actions'
import { confirmNotice } from '@/modules/shopping/presentation'
import { ShoppingWorkspace } from '@/modules/shopping/ShoppingWorkspace'

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmado?: string }>
}) {
  const { confirmado } = await searchParams
  const items = await getShoppingItems()
  return <ShoppingWorkspace initialItems={items} notice={confirmNotice(confirmado)} />
}
