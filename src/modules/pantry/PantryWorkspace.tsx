'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

import {
  adjustPantryItem,
  clearPantryAttention,
  correctPantryItem,
  markPantryLow,
  recordPantryEntry,
} from './actions'
import { addShoppingItem } from '@/modules/shopping/actions'
import { PantryDetail } from './PantryDetail'
import { PantryEntryForm } from './PantryEntryForm'
import { PantryList } from './PantryList'
import type { PantryListItem, PresentedPantryItem } from './presentation'
import type { PantryMutationInput, PantryZone } from './types'

type Props = {
  initialItems: PantryListItem[]
}

export function PantryWorkspace({ initialItems }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<PresentedPantryItem | null>(
    null,
  )
  const [isAdding, setIsAdding] = useState(false)
  const [undo, setUndo] = useState<PresentedPantryItem | null>(null)
  const refresh = useCallback(() => router.refresh(), [router])

  useEffect(() => {
    const client = createSupabaseBrowserClient()
    const channel = client
      .channel('pantry-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pantry_items' },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pantry_movements' },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'household_foods' },
        refresh,
      )
      // Resync after reconnecting: realtime does not replay missed events.
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') refresh()
      })

    return () => {
      void client.removeChannel(channel)
    }
  }, [refresh])

  async function handleMarkLow(item: PresentedPantryItem) {
    if (pendingId) return
    setPendingId(item.id)
    setStatus('')
    try {
      await markPantryLow(item.id, item.version)
      setStatus(`${item.name}: queda poco.`)
      refresh()
    } catch {
      setStatus(
        'No hemos podido guardar el cambio. Hemos actualizado la lista.',
      )
      refresh()
    } finally {
      setPendingId(null)
    }
  }

  async function handleSave(input: PantryMutationInput) {
    setPendingId(input.itemId)
    setStatus('')
    try {
      await correctPantryItem(input)
      setStatus('Cambios guardados.')
      setSelectedItem(null)
      refresh()
    } catch {
      setStatus(
        'No hemos podido guardar el cambio. Conservamos el detalle para que puedas reintentarlo.',
      )
    } finally {
      setPendingId(null)
    }
  }

  async function handleAdjust(item: PresentedPantryItem, delta: number) {
    if (pendingId || item.quantity === null) return
    const quantity = Math.max(0, item.quantity + delta)
    setPendingId(item.id)
    setStatus('')
    try {
      const result = await adjustPantryItem({
        itemId: item.id,
        version: item.version,
        trackingMode: item.trackingMode,
        approximateState: null,
        quantity,
        unitCode: item.unitCode,
      })
      setStatus(
        `${item.name}: ${quantity === 0 ? 'se terminó.' : 'cantidad actualizada.'}`,
      )
      setUndo(quantity === 0 ? { ...item, version: result.version } : null)
      refresh()
    } catch {
      setStatus(
        'No hemos podido ajustar la cantidad. Hemos actualizado la lista.',
      )
      refresh()
    } finally {
      setPendingId(null)
    }
  }

  async function handlePresence(
    item: PresentedPantryItem,
    state: 'available' | 'low' | 'out',
  ) {
    if (pendingId) return
    setPendingId(item.id)
    setStatus('')
    try {
      if (state === 'low') {
        await markPantryLow(item.id, item.version)
        setStatus(`${item.name}: queda poco.`)
      } else if (state === 'available' && item.trackingMode !== 'approximate') {
        await clearPantryAttention(item.id, item.version)
        setStatus(`${item.name}: hay.`)
      } else if (item.trackingMode === 'approximate') {
        const result = await correctPantryItem({
          itemId: item.id,
          version: item.version,
          trackingMode: 'approximate',
          approximateState: state === 'available' ? 'plenty' : 'out',
          quantity: null,
          unitCode: null,
        })
        setStatus(`${item.name}: ${state === 'out' ? 'se terminó.' : 'hay.'}`)
        setUndo(state === 'out' ? { ...item, version: result.version } : null)
      } else {
        const result = await adjustPantryItem({
          itemId: item.id,
          version: item.version,
          trackingMode: item.trackingMode,
          approximateState: null,
          quantity: 0,
          unitCode: item.unitCode,
        })
        setStatus(`${item.name}: se terminó.`)
        setUndo({ ...item, version: result.version })
      }
      refresh()
    } catch {
      setStatus(
        'No hemos podido guardar el cambio. Hemos actualizado la lista.',
      )
      refresh()
    } finally {
      setPendingId(null)
    }
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
    } catch {
      setStatus('No hemos podido añadirlo a Compra. Puedes reintentarlo.')
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
        initialItems={initialItems}
        onMarkLow={pendingId ? undefined : handleMarkLow}
        onAdjust={pendingId ? undefined : handleAdjust}
        onSetPresence={pendingId ? undefined : handlePresence}
        onUndo={undo ? handleUndo : undefined}
        onAddToShopping={pendingId ? undefined : handleAddToShopping}
        undoItemName={undo?.name}
        onAdd={() => {
          setSelectedItem(null)
          setIsAdding(true)
        }}
        onOpen={(item) => {
          setIsAdding(false)
          setSelectedItem(item)
        }}
        selectedId={selectedItem?.id}
        detail={
          isAdding ? (
            <PantryEntryForm
              onClose={() => setIsAdding(false)}
              onSave={handleCreate}
            />
          ) : selectedItem ? (
            <PantryDetail
              key={selectedItem.id}
              item={selectedItem}
              onClose={() => setSelectedItem(null)}
              onSave={handleSave}
            />
          ) : null
        }
        status={status}
      />
    </>
  )
}
