'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AppShell } from '@/components/ui/AppShell'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  PANTRY_ZONE_META,
  PANTRY_ZONE_ORDER,
} from '@/modules/pantry/presentation'
import type { PantryZone } from '@/modules/pantry/types'

import { confirmPurchase } from './actions'
import { checkoutActionLabel } from './presentation'
import type { CheckoutLine } from './types'

export function CheckoutReview({
  initialLines,
}: {
  initialLines: CheckoutLine[]
}) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const [zoneChoices, setZoneChoices] = useState<Record<string, PantryZone>>({})
  const refresh = useCallback(() => router.refresh(), [router])

  // Solo los altas sin coincidencia de catálogo necesitan que la persona
  // elija la zona a mano; el resto ya sabe dónde va o ya existía.
  const linesNeedingZone = initialLines.filter(
    (line) => line.action === 'add' && line.suggestedZone === null,
  )
  const canConfirm = linesNeedingZone.every((line) => zoneChoices[line.itemId])

  // Un cambio remoto en la lista (otro integrante) recarga la revisión en vivo,
  // sin ocultar lo que ya se ve.
  useEffect(() => {
    const client = createSupabaseBrowserClient()
    const channel = client
      .channel('checkout-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items' },
        refresh,
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [refresh])

  async function handleConfirm() {
    if (pending || !initialLines.length || !canConfirm) return
    setPending(true)
    setStatus('')
    try {
      const { confirmed } = await confirmPurchase(
        initialLines.map((line) => ({
          itemId: line.itemId,
          version: line.version,
          zone: zoneChoices[line.itemId],
        })),
      )
      router.push(`/compra?confirmado=${confirmed}`)
    } catch {
      // Conflicto o fallo: recargamos la revisión sin aplicar nada a medias.
      setStatus(
        'La lista ha cambiado. Hemos actualizado la revisión; compruébala y vuelve a confirmar.',
      )
      setPending(false)
      refresh()
    }
  }

  return (
    <AppShell current="compra" contentClassName="checkout-content">
      <section
        aria-labelledby="checkout-title"
      >
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
            <p className="shopping-review-lead">
              Estos cambios se aplicarán a tu despensa:
            </p>
            <section
              className="shopping-list"
              aria-label="Cambios en la despensa"
            >
              {initialLines.map((line) => {
                const needsZone =
                  line.action === 'add' && line.suggestedZone === null
                return (
                  <div key={line.itemId} className="shopping-row">
                    <span aria-hidden="true" className="shopping-review-icon" />
                    <span>{line.name}</span>
                    <small>{checkoutActionLabel(line)}</small>
                    {needsZone ? (
                      <div
                        className="pantry-detail__chips"
                        aria-label={`¿Dónde guardas ${line.name}?`}
                      >
                        {PANTRY_ZONE_ORDER.map((zone) => (
                          <button
                            className={
                              zoneChoices[line.itemId] === zone
                                ? 'is-selected'
                                : undefined
                            }
                            key={zone}
                            onClick={() =>
                              setZoneChoices((current) => ({
                                ...current,
                                [line.itemId]: zone,
                              }))
                            }
                            type="button"
                          >
                            {PANTRY_ZONE_META[zone].label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </section>
            <button
              className="shopping-confirm"
              disabled={pending || !canConfirm}
              onClick={handleConfirm}
              type="button"
            >
              Confirmar en despensa
            </button>
          </>
        ) : (
          <p className="shopping-empty">
            No hay productos marcados para confirmar.{' '}
            <a href="/compra">Volver a la lista</a>.
          </p>
        )}
      </section>
    </AppShell>
  )
}
