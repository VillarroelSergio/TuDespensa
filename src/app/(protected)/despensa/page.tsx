import { PantryList } from '@/modules/pantry/PantryList'
import { getPantryListItems } from '@/modules/pantry/actions'

export default async function PantryPage() {
  const items = await getPantryListItems()
  return <PantryList initialItems={items} />
}
