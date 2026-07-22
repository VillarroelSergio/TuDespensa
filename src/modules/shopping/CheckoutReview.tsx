'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { BrandLockup } from '@/components/ui/BrandLockup'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

import { confirmPurchase } from './actions'
import { checkoutActionLabel } from './presentation'
import { Navigation } from './ShoppingList'
import type { CheckoutLine } from './types'

export function CheckoutReview({ initialLines }: { initialLines: CheckoutLine[] }) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const refresh = useCallback(() => router.refresh(), [router])

  // Un cambio remoto en la lista (otro integrante) recarga la revisión en vivo,
  // sin ocultar lo que ya se ve.
  useEffect(() => {
    const client = createSupabaseBrowserClient()
    const channel = client
      .channel('checkout-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, refresh)
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [refresh])

  async function handleConfirm() {
    if (pending || !initialLines.length) return
    setPending(true)
    setStatus('')
    try {
      const { confirmed } = await confirmPurchase(
        initialLines.map((line) => ({ itemId: line.itemId, version: line.version })),
      )
      router.push(`/compra?confirmado=${confirmed}`)
    } catch {
      // Conflicto o fallo: recargamos la revisión sin aplicar nada a medias.
      setStatus('La lista ha cambiado. Hemos actualizado la revisión; compruébala y vuelve a confirmar.')
      setPending(false)
      refresh()
    }
  }

  return (
    <main className="shopping-page">
      <aside className="shopping-sidebar">
        <BrandLockup className="pantry-brand" />
        <Navigation className="shopping-sidebar__nav" />
      </aside>
      <section className="shopping-content" aria-labelledby="checkout-title">
        <a className="shopping-back" href="/compra">
          ← Volver a la lista
        </a>
        <header className="shopping-header">
          <h1 id="checkout-title">Revisa tu compra</h1>
        </header>
        {status ? (
          <p className="pantry-sync-status" aria-live="polite">
            {status}
          </p>
        ) : null}
        {initialLines.length ? (
          <>
            <p className="shopping-review-lead">Estos cambios se aplicarán a tu despensa:</p>
            <section className="shopping-list" aria-label="Cambios en la despensa">
              {initialLines.map((line) => (
                <div key={line.itemId} className="shopping-row">
                  <span aria-hidden="true" className="shopping-review-icon" />
                  <span>{line.name}</span>
                  <small>{checkoutActionLabel(line)}</small>
                </div>
              ))}
            </section>
            <button className="shopping-confirm" disabled={pending} onClick={handleConfirm} type="button">
              Confirmar en despensa
            </button>
          </>
        ) : (
          <p className="shopping-empty">
            No hay productos marcados para confirmar. <a href="/compra">Volver a la lista</a>.
          </p>
        )}
      </section>
      <Navigation className="shopping-bottom-nav" />
    </main>
  )
}
