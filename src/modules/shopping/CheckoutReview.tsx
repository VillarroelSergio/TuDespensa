'use client'

import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AppShell } from '@/components/ui/AppShell'
import { useRealtimeRefresh } from '@/lib/supabase/useRealtimeRefresh'
import {
  PANTRY_ZONE_META,
  PANTRY_ZONE_ORDER,
} from '@/modules/pantry/presentation'
import type { PantryZone } from '@/modules/pantry/types'

import { confirmPurchase, setPurchaseQuantities } from './actions'
import { checkoutActionLabel } from './presentation'
import type { CheckoutLine } from './types'

export function CheckoutReview({
  initialLines,
  isVisualFixture = false,
}: {
  initialLines: CheckoutLine[]
  isVisualFixture?: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const [zoneChoices, setZoneChoices] = useState<Record<string, PantryZone>>({})
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      initialLines.map((line) => [line.itemId, line.quantity ?? 1]),
    ),
  )
  // Evita que el eco realtime de nuestra propia confirmación dispare un
  // refresh mientras ya estamos navegando fuera de esta página.
  const confirming = useRef(false)
  const refresh = useCallback(() => {
    if (confirming.current) return
    router.refresh()
  }, [router])

  // Solo los altas sin coincidencia de catálogo necesitan que la persona
  // elija la zona a mano; el resto ya sabe dónde va o ya existía.
  const linesNeedingZone = initialLines.filter(
    (line) => line.action === 'add' && line.suggestedZone === null,
  )
  const canConfirm =
    linesNeedingZone.every((line) => zoneChoices[line.itemId]) &&
    initialLines.every((line) => {
      const quantity = quantities[line.itemId] ?? 0
      return Number.isFinite(quantity) && quantity > 0
    })

  // Un cambio remoto en la lista (otro integrante) recarga la revisión en vivo,
  // sin ocultar lo que ya se ve.
  useRealtimeRefresh('checkout-refresh', ['shopping_items'], {
    enabled: !isVisualFixture,
    shouldRefresh: () => !confirming.current,
  })

  async function handleConfirm() {
    if (pending || !initialLines.length || !canConfirm) return
    setPending(true)
    setStatus('')
    confirming.current = true
    try {
      const updated = await setPurchaseQuantities(
        initialLines.map((line) => ({
          itemId: line.itemId,
          version: line.version,
          quantity: quantities[line.itemId]!,
        })),
      )
      const { confirmed } = await confirmPurchase(
        initialLines.map((line) => ({
          itemId: line.itemId,
          version:
            updated.items.find((item) => item.item_id === line.itemId)
              ?.version ?? line.version,
          zone: zoneChoices[line.itemId],
        })),
      )
      router.push(`/compra?confirmado=${confirmed}`)
    } catch {
      // Conflicto o fallo: recargamos la revisión sin aplicar nada a medias.
      confirming.current = false
      setStatus(
        'La lista ha cambiado. Hemos actualizado la revisión; compruébala y vuelve a confirmar.',
      )
      setPending(false)
      refresh()
    }
  }

  return (
    <AppShell current="compra" contentClassName="checkout-content">
      <section aria-labelledby="checkout-title">
        <Link className="shopping-back" href="/compra">
          <span aria-hidden="true">←</span> Volver a la lista
        </Link>
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
                    <label className="shopping-checkout-quantity">
                      <span>Unidades</span>
                      <input
                        aria-label={`Unidades compradas de ${line.name}`}
                        min="0.01"
                        step="0.01"
                        type="number"
                        value={quantities[line.itemId] ?? 1}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [line.itemId]: Number(event.target.value),
                          }))
                        }
                      />
                      <span aria-hidden="true">uds.</span>
                    </label>
                    {needsZone ? (
                      // role="group" + aria-pressed: sin ellos el aria-label se
                      // ignoraba y la zona elegida solo se veía por el color.
                      <div
                        aria-label={`¿Dónde guardas ${line.name}?`}
                        className="pantry-detail__chips"
                        role="group"
                      >
                        {PANTRY_ZONE_ORDER.map((zone) => (
                          <button
                            aria-pressed={zoneChoices[line.itemId] === zone}
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
            {/* El botón se apagaba sin decir qué faltaba por rellenar. */}
            {!pending && !canConfirm ? (
              <p className="shopping-next" id="checkout-blocked">
                Elige dónde guardar cada producto nuevo e indica unidades
                mayores que cero para poder confirmar.
              </p>
            ) : null}
            <button
              aria-describedby={
                !pending && !canConfirm ? 'checkout-blocked' : undefined
              }
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
            <Link href="/compra">Volver a la lista</Link>.
          </p>
        )}
      </section>
    </AppShell>
  )
}
