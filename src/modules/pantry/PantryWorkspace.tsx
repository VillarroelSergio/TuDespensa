'use client'

import {
  useCallback,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'

import { useRealtimeRefresh } from '@/lib/supabase/useRealtimeRefresh'

import {
  adjustPantryItem,
  correctPantryItem,
  deletePantryItem,
  recordPantryEntry,
  updatePantryItem,
} from './actions'
import { addShoppingItem } from '@/modules/shopping/actions'
import { PantryEntryForm } from './PantryEntryForm'
import { PantryList } from './PantryList'
import { PANTRY_ZONE_META } from './presentation'
import type { PantryListItem, PresentedPantryItem } from './presentation'
import type { PantryMutationInput, PantryZone } from './types'

type Props = {
  initialItems: PantryListItem[]
  isVisualFixture?: boolean
}

export function PantryWorkspace({
  initialItems,
  isVisualFixture = false,
}: Props) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [editingItem, setEditingItem] = useState<PresentedPantryItem | null>(
    null,
  )
  const [undo, setUndo] = useState<PresentedPantryItem | null>(null)
  // `pendingId` se actualiza en el siguiente render. Este guard síncrono
  // cubre los clics consecutivos que llegan antes de que React lo deshabilite.
  const pendingIdsRef = useRef<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const refresh = useCallback(() => router.refresh(), [router])
  // Cada acción pinta su cambio al instante; revalidatePath reconcilia con el
  // servidor sin recarga global. Si algo falla, refrescamos para resincronizar.
  type PantryOptimisticAction =
    | { type: 'markOut'; id: string }
    | { type: 'adjust'; id: string; quantity: number }
    | { type: 'remove'; id: string }
  const [items, applyOptimistic] = useOptimistic(
    initialItems,
    (current: PantryListItem[], action: PantryOptimisticAction) => {
      switch (action.type) {
        case 'markOut':
          return current.map((item) =>
            item.id === action.id
              ? {
                  ...item,
                  approximateState:
                    item.trackingMode === 'approximate'
                      ? 'out'
                      : item.approximateState,
                  quantity:
                    item.trackingMode === 'approximate' ? item.quantity : 0,
                }
              : item,
          )
        case 'adjust':
          return current.map((item) =>
            item.id === action.id
              ? { ...item, quantity: action.quantity }
              : item,
          )
        case 'remove':
          return current.filter((item) => item.id !== action.id)
      }
    },
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
    if (pendingIdsRef.current.has(item.id)) return
    pendingIdsRef.current.add(item.id)
    setStatus('')
    startTransition(async () => {
      applyOptimistic({ type: 'markOut', id: item.id })
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
      } finally {
        pendingIdsRef.current.delete(item.id)
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

  async function handleAdjust(item: PresentedPantryItem, delta: number) {
    if (pendingId) return
    const quantity = Math.max(0, (item.quantity ?? 0) + delta)
    setPendingId(item.id)
    setStatus('')
    startTransition(async () => {
      applyOptimistic({ type: 'adjust', id: item.id, quantity })
      try {
        await adjustPantryItem({
          itemId: item.id,
          version: item.version,
          trackingMode: item.trackingMode,
          approximateState: null,
          quantity,
          unitCode: item.unitCode,
        })
        setStatus(`${item.name}: cantidad actualizada.`)
      } catch {
        setStatus(
          'No hemos podido actualizar la cantidad. Hemos actualizado la lista.',
        )
        refresh()
      } finally {
        setPendingId(null)
      }
    })
  }

  async function handleRemove(item: PresentedPantryItem) {
    if (pendingId) return
    setPendingId(item.id)
    setStatus('')
    startTransition(async () => {
      applyOptimistic({ type: 'remove', id: item.id })
      try {
        await deletePantryItem(item.id, item.version)
        setStatus(`${item.name}: eliminado de la despensa.`)
      } catch {
        setStatus('No hemos podido eliminarlo. Hemos actualizado la lista.')
        refresh()
      } finally {
        setPendingId(null)
      }
    })
  }

  async function handleUpdate(
    item: PresentedPantryItem,
    input: {
      zone: PantryZone
      foodName: string
      trackingMode: PantryMutationInput['trackingMode']
      approximateState: PantryMutationInput['approximateState']
      quantity: PantryMutationInput['quantity']
      unitCode: PantryMutationInput['unitCode']
    },
  ) {
    const currentZone = item.zone ?? 'pantry'
    if (input.zone !== currentZone) {
      const conflict = items.find(
        (candidate) =>
          candidate.id !== item.id &&
          candidate.foodId === item.foodId &&
          (candidate.zone ?? 'pantry') === input.zone,
      )
      if (conflict) {
        const zoneLabel = PANTRY_ZONE_META[input.zone].label
        const confirmed = window.confirm(
          `Ya tienes «${item.name}» en ${zoneLabel}. Se fusionarán en un único producto. ¿Continuar?`,
        )
        if (!confirmed) return
      }
    }
    setPendingId(item.id)
    setStatus('')
    try {
      await updatePantryItem({
        itemId: item.id,
        foodId: item.foodId,
        version: item.version,
        name: input.foodName,
        currentName: item.name,
        zone: input.zone,
        currentZone,
        trackingMode: input.trackingMode,
        approximateState: input.approximateState,
        quantity: input.quantity,
        currentQuantity: item.quantity,
        unitCode: input.unitCode,
      })
      setStatus(`${input.foodName}: cambios guardados.`)
      setEditingItem(null)
      refresh()
    } catch {
      setStatus(
        'No hemos podido guardar los cambios. Conservamos el formulario para que puedas reintentarlo.',
      )
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
        onAdjust={pendingId ? undefined : handleAdjust}
        onRemove={pendingId ? undefined : handleRemove}
        onUndo={undo ? handleUndo : undefined}
        onAddToShopping={pendingId ? undefined : handleAddToShopping}
        onSelect={
          pendingId
            ? undefined
            : (item) => {
                setIsAdding(false)
                setEditingItem(item)
              }
        }
        undoItemName={undo?.name}
        onAdd={() => {
          setEditingItem(null)
          setIsAdding(true)
        }}
        detail={
          isAdding ? (
            <PantryEntryForm
              onClose={() => setIsAdding(false)}
              onSave={handleCreate}
            />
          ) : editingItem ? (
            <PantryEntryForm
              item={editingItem}
              onClose={() => setEditingItem(null)}
              onSave={(input) => handleUpdate(editingItem, input)}
            />
          ) : null
        }
        status={status}
      />
    </>
  )
}
