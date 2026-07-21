'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

import { addShoppingItem, toggleShoppingItem } from './actions'
import { ShoppingList } from './ShoppingList'
import type { ShoppingItem } from './types'

export function ShoppingWorkspace({ initialItems }: { initialItems: ShoppingItem[] }) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const refresh = useCallback(() => router.refresh(), [router])

  useEffect(() => {
    const client = createSupabaseBrowserClient()
    const channel = client.channel('shopping-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, refresh)
      .subscribe((state) => { if (state === 'SUBSCRIBED') refresh() })
    return () => { void client.removeChannel(channel) }
  }, [refresh])

  async function handleAdd(name: string) {
    if (pending) return
    setPending(true); setStatus('')
    try { await addShoppingItem({ foodName: name }); setStatus(`${name}: añadido a la compra.`); refresh() }
    catch { setStatus('No hemos podido añadir el producto. Puedes reintentarlo.') }
    finally { setPending(false) }
  }

  async function handleToggle(item: ShoppingItem) {
    if (pending) return
    setPending(true); setStatus('')
    try { await toggleShoppingItem(item.id, item.version, !item.isPurchased); setStatus(`${item.name}: ${item.isPurchased ? 'pendiente de nuevo.' : 'marcado como comprado.'}`); refresh() }
    catch { setStatus('No hemos podido guardar el cambio. Hemos actualizado la lista.') ; refresh() }
    finally { setPending(false) }
  }

  return <ShoppingList initialItems={initialItems} pending={pending} status={status} onAdd={handleAdd} onToggle={handleToggle} />
}
