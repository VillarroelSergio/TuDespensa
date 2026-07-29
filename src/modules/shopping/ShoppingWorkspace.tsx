'use client'

import { useOptimistic, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { useRealtimeRefresh } from '@/lib/supabase/useRealtimeRefresh'

import {
  addShoppingItem,
  deleteShoppingItem,
  toggleShoppingItem,
} from './actions'
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
  const [isPending, startTransition] = useTransition()
  // Ítems con una mutación en curso, comprobado de forma síncrona: evita que
  // un doble clic dispare una segunda RPC para el mismo ítem antes de que
  // React repinte con isPending en true.
  const pendingIdsRef = useRef<Set<string>>(new Set())
  const busy = adding || isPending
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
    // Mientras esta sesión tiene una mutación propia en curso, revalidatePath
    // en la action ya reconcilia su vista; el aviso Realtime del mismo cambio
    // solo duplicaría el refresco.
    shouldRefresh: () => pendingIdsRef.current.size === 0,
  })

  async function handleAdd(name: string) {
    if (busy) return
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
    if (pendingIdsRef.current.has(item.id)) return
    setStatus('')
    pendingIdsRef.current.add(item.id)
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
      } finally {
        pendingIdsRef.current.delete(item.id)
      }
    })
  }

  function handleDelete(item: ShoppingItem) {
    if (pendingIdsRef.current.has(item.id)) return
    setStatus('')
    pendingIdsRef.current.add(item.id)
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
      } finally {
        pendingIdsRef.current.delete(item.id)
      }
    })
  }

  function handleToggleAll(purchased: boolean) {
    const targets = visibleItems.filter(
      (item) =>
        item.isPurchased !== purchased && !pendingIdsRef.current.has(item.id),
    )
    if (!targets.length) return
    setStatus('')
    targets.forEach((item) => pendingIdsRef.current.add(item.id))
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
      } finally {
        targets.forEach((item) => pendingIdsRef.current.delete(item.id))
      }
    })
  }

  return (
    <ShoppingList
      initialItems={visibleItems}
      pending={busy}
      status={status}
      notice={notice}
      onAdd={handleAdd}
      onToggle={handleToggle}
      onToggleAll={handleToggleAll}
      onDelete={handleDelete}
    />
  )
}
