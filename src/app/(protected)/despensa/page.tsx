import { getPantryListItems } from '@/modules/pantry/actions'
import { PantryWorkspace } from '@/modules/pantry/PantryWorkspace'

export default async function PantryPage() {
  const items = await getPantryListItems()
  return <PantryWorkspace initialItems={items} />
}
