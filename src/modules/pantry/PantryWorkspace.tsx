'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

import { correctPantryItem, markPantryLow, recordPantryEntry } from './actions'
import { PantryDetail } from './PantryDetail'
import { PantryEntryForm } from './PantryEntryForm'
import { PantryList } from './PantryList'
import type { PantryListItem, PresentedPantryItem } from './presentation'
import type { PantryMutationInput } from './types'

type Props = {
  initialItems: PantryListItem[]
}

export function PantryWorkspace({ initialItems }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<PresentedPantryItem | null>(null)
  const [isAdding, setIsAdding] = useState(false)
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
      setStatus('No hemos podido guardar el cambio. Hemos actualizado la lista.')
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
      setStatus('No hemos podido guardar el cambio. Conservamos el detalle para que puedas reintentarlo.')
    } finally {
      setPendingId(null)
    }
  }

  async function handleCreate(input: {
    zone: 'pantry'
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
      setStatus('No hemos podido añadir el producto. Conservamos el formulario para que puedas reintentarlo.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <>
      <PantryList
        initialItems={initialItems}
        onMarkLow={pendingId ? undefined : handleMarkLow}
        onAdd={() => {
          setSelectedItem(null)
          setIsAdding(true)
        }}
        onOpen={(item) => {
          setIsAdding(false)
          setSelectedItem(item)
        }}
        selectedId={selectedItem?.id}
        detail={isAdding ? <PantryEntryForm onClose={() => setIsAdding(false)} onSave={handleCreate} /> : selectedItem ? <PantryDetail item={selectedItem} onClose={() => setSelectedItem(null)} onSave={handleSave} /> : null}
        status={status}
      />
    </>
  )
}
