'use client'

import { useCallback, useOptimistic, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { useRealtimeRefresh } from '@/lib/supabase/useRealtimeRefresh'

import {
  adjustPantryItem,
  correctPantryItem,
  recordPantryEntry,
  removeFinishedPantryItem,
} from './actions'
import { addShoppingItem } from '@/modules/shopping/actions'
import { PantryEntryForm } from './PantryEntryForm'
import { PantryList } from './PantryList'
import type { PantryListItem, PresentedPantryItem } from './presentation'
import type { PantryMutationInput, PantryZone } from './types'

type Props = {
  initialItems: PantryListItem[]
  isVisualFixture?: boolean
}

export function PantryWorkspace({ initialItems, isVisualFixture = false }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [undo, setUndo] = useState<PresentedPantryItem | null>(null)
  const [, startTransition] = useTransition()
  const refresh = useCallback(() => router.refresh(), [router])
  // «Se terminó» pinta el estado al instante; revalidatePath reconcilia con el
  // servidor sin recarga global. Si algo falla, refrescamos para resincronizar.
  const [items, markOut] = useOptimistic(
    initialItems,
    (current: PantryListItem[], id: string) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              approximateState:
                item.trackingMode === 'approximate'
                  ? 'out'
                  : item.approximateState,
              quantity: item.trackingMode === 'approximate' ? item.quantity : 0,
            }
          : item,
      ),
  )

  useRealtimeRefresh(
    'pantry-refresh',
    ['pantry_items', 'pantry_movements', 'household_foods'],
    { enabled: !isVisualFixture },
  )

  function handlePresence(
    item: PresentedPantryItem,
    state: 'available' | 'low' | 'out',
  ) {
    // La única acción de presencia viva es marcar «se terminó».
    if (state !== 'out') return
    setStatus('')
    startTransition(async () => {
      markOut(item.id)
      try {
        const result =
          item.trackingMode === 'approximate'
            ? await correctPantryItem({
                itemId: item.id,
                version: item.version,
                trackingMode: 'approximate',
                approximateState: 'out',
                quantity: null,
                unitCode: null,
              })
            : await adjustPantryItem({
                itemId: item.id,
                version: item.version,
                trackingMode: item.trackingMode,
                approximateState: null,
                quantity: 0,
                unitCode: item.unitCode,
              })
        setStatus(`${item.name}: se terminó.`)
        setUndo({ ...item, version: result.version })
      } catch {
        setStatus(
          'No hemos podido guardar el cambio. Hemos actualizado la lista.',
        )
        refresh()
      }
    })
  }

  async function handleUndo() {
    if (!undo || pendingId) return
    setPendingId(undo.id)
    try {
      await correctPantryItem({
        itemId: undo.id,
        version: undo.version,
        trackingMode: undo.trackingMode,
        approximateState: undo.approximateState,
        quantity: undo.quantity,
        unitCode: undo.unitCode,
      })
      setStatus(`${undo.name}: cambio deshecho.`)
      setUndo(null)
      refresh()
    } catch {
      setStatus(
        'No hemos podido deshacer el cambio. Hemos actualizado la lista.',
      )
      refresh()
    } finally {
      setPendingId(null)
    }
  }

  async function handleAddToShopping(item: PresentedPantryItem) {
    if (pendingId) return
    setPendingId(item.id)
    setStatus('')
    try {
      await addShoppingItem({ foodName: item.name, source: 'pantry' })
      setStatus(`${item.name}: añadido a Compra.`)
      setUndo(null)
    } catch {
      setStatus('No hemos podido añadirlo a Compra. Puedes reintentarlo.')
    } finally {
      setPendingId(null)
    }
  }

  async function handleRemove(item: PresentedPantryItem) {
    if (pendingId) return
    setPendingId(item.id)
    setStatus('')
    try {
      await removeFinishedPantryItem(item.id, item.version)
      setStatus(`${item.name}: eliminado de la despensa.`)
      refresh()
    } catch {
      setStatus('No hemos podido eliminarlo. Hemos actualizado la lista.')
      refresh()
    } finally {
      setPendingId(null)
    }
  }

  async function handleCreate(input: {
    zone: PantryZone
    foodName: string
    trackingMode: PantryMutationInput['trackingMode']
    approximateState: PantryMutationInput['approximateState']
    quantity: PantryMutationInput['quantity']
    unitCode: PantryMutationInput['unitCode']
  }) {
    setPendingId('new-pantry-item')
    setStatus('')
    try {
      await recordPantryEntry(input)
      setStatus(`${input.foodName}: añadido a la despensa.`)
      setIsAdding(false)
      refresh()
    } catch {
      setStatus(
        'No hemos podido añadir el producto. Conservamos el formulario para que puedas reintentarlo.',
      )
    } finally {
      setPendingId(null)
    }
  }

  return (
    <>
      <PantryList
        initialItems={items}
        onSetPresence={pendingId ? undefined : handlePresence}
        onRemove={pendingId ? undefined : handleRemove}
        onUndo={undo ? handleUndo : undefined}
        onAddToShopping={pendingId ? undefined : handleAddToShopping}
        undoItemName={undo?.name}
        onAdd={() => {
          setIsAdding(true)
        }}
        detail={
          isAdding ? (
            <PantryEntryForm
              onClose={() => setIsAdding(false)}
              onSave={handleCreate}
            />
          ) : null
        }
        status={status}
      />
    </>
  )
}
