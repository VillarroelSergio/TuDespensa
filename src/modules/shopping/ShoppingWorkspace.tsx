'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { useRealtimeRefresh } from '@/lib/supabase/useRealtimeRefresh'

import { addShoppingItem, deleteShoppingItem, toggleShoppingItem } from './actions'
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
  const [visibleItems, applyDelete] = useOptimistic(
    items,
    (current: ShoppingItem[], id: string) =>
      current.filter((item) => item.id !== id),
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

  function handleDelete(item: ShoppingItem) {
    setStatus('')
    startTransition(async () => {
      applyDelete(item.id)
      try {
        await deleteShoppingItem(item.id, item.version)
        setStatus(`${item.name}: eliminado de la compra.`)
      } catch {
        setStatus(
          'No hemos podido eliminar el producto. Hemos actualizado la lista.',
        )
        router.refresh()
      }
    })
  }

  function handleToggleAll(purchased: boolean) {
    const targets = visibleItems.filter((item) => item.isPurchased !== purchased)
    if (!targets.length) return
    setStatus('')
    startTransition(async () => {
      targets.forEach((item) => applyToggle(item.id))
      try {
        await Promise.all(
          targets.map((item) =>
            toggleShoppingItem(item.id, item.version, purchased),
          ),
        )
        setStatus(
          purchased ? 'Todo marcado como comprado.' : 'Todo desmarcado.',
        )
      } catch {
        setStatus(
          'No hemos podido guardar los cambios. Hemos actualizado la lista.',
        )
        router.refresh()
      }
    })
  }

  return (
    <ShoppingList
      initialItems={visibleItems}
      pending={adding}
      status={status}
      notice={notice}
      onAdd={handleAdd}
      onToggle={handleToggle}
      onToggleAll={handleToggleAll}
      onDelete={handleDelete}
    />
  )
}
