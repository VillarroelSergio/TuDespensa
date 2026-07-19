'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

import { markPantryLow } from './actions'
import { PantryList } from './PantryList'
import type { PantryListItem, PresentedPantryItem } from './presentation'

type Props = {
  initialItems: PantryListItem[]
}

export function PantryWorkspace({ initialItems }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
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

  return (
    <>
      <PantryList
        initialItems={initialItems}
        onMarkLow={pendingId ? undefined : handleMarkLow}
      />
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </>
  )
}
