'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { useRealtimeRefresh } from '@/lib/supabase/useRealtimeRefresh'

import { addShoppingItem, toggleShoppingItem } from './actions'
import { ShoppingList } from './ShoppingList'
import type { ShoppingItem } from './types'

export function ShoppingWorkspace({
  initialItems,
  notice,
  isVisualFixture = false,
}: {
  initialItems: ShoppingItem[]
  notice?: string | null
  isVisualFixture?: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [adding, setAdding] = useState(false)
  const [, startTransition] = useTransition()
  // Pinta el tick al instante; revalidatePath en la action reconcilia con el
  // servidor sin recarga global. Si algo falla, refrescamos para resincronizar.
  const [items, applyToggle] = useOptimistic(
    initialItems,
    (current: ShoppingItem[], id: string) =>
      current.map((item) =>
        item.id === id ? { ...item, isPurchased: !item.isPurchased } : item,
      ),
  )

  useRealtimeRefresh('shopping-refresh', ['shopping_items'], {
    enabled: !isVisualFixture,
  })

  async function handleAdd(name: string) {
    if (adding) return
    setAdding(true)
    setStatus('')
    try {
      await addShoppingItem({ foodName: name })
      setStatus(`${name}: añadido a la compra.`)
    } catch {
      setStatus('No hemos podido añadir el producto. Puedes reintentarlo.')
    } finally {
      setAdding(false)
    }
  }

  function handleToggle(item: ShoppingItem) {
    setStatus('')
    startTransition(async () => {
      applyToggle(item.id)
      try {
        await toggleShoppingItem(item.id, item.version, !item.isPurchased)
        setStatus(
          `${item.name}: ${item.isPurchased ? 'pendiente de nuevo.' : 'marcado como comprado.'}`,
        )
      } catch {
        setStatus(
          'No hemos podido guardar el cambio. Hemos actualizado la lista.',
        )
        router.refresh()
      }
    })
  }

  return (
    <ShoppingList
      initialItems={items}
      pending={adding}
      status={status}
      notice={notice}
      onAdd={handleAdd}
      onToggle={handleToggle}
    />
  )
}
