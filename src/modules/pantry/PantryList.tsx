'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'

import { BrandLockup } from '@/components/ui/BrandLockup'

import {
  groupPantryItemsByZone,
  prioritizePantryItems,
  PANTRY_ZONE_META,
  type PantryListItem,
  type PresentedPantryItem,
} from './presentation'

type Props = {
  initialItems: PantryListItem[]
  onAdd?: () => void
  onMarkLow?: (item: PresentedPantryItem) => void
  onAdjust?: (item: PresentedPantryItem, delta: number) => void
  onSetPresence?: (
    item: PresentedPantryItem,
    state: 'available' | 'low' | 'out',
  ) => void
  onRemove?: (item: PresentedPantryItem) => void
  onUndo?: () => void
  onAddToShopping?: (item: PresentedPantryItem) => void
  undoItemName?: string
  detail?: ReactNode
  status?: string
}

function PantryRow({
  item,
  onMarkLow,
  onAdjust,
  onSetPresence,
  onRemove,
  showLegacyPresenceControls = false,
}: {
  item: PresentedPantryItem
  onMarkLow?: (item: PresentedPantryItem) => void
  onAdjust?: (item: PresentedPantryItem, delta: number) => void
  onSetPresence?: (
    item: PresentedPantryItem,
    state: 'available' | 'low' | 'out',
  ) => void
  onRemove?: (item: PresentedPantryItem) => void
  showLegacyPresenceControls?: boolean
}) {
  return (
    <div
      className={`pantry-row pantry-row--${item.status}`}
      style={{ backgroundColor: '#fff' }}
    >
      <div className="pantry-row__detail">
        <span className="pantry-row__dot" aria-hidden="true" />
        <span className="pantry-row__name">{item.name}</span>
        {item.quantityLabel ? (
          <span className="pantry-row__quantity">{item.quantityLabel}</span>
        ) : null}
      </div>
      {item.trackingMode === 'units' && item.quantity !== null && onAdjust ? (
        <div className="pantry-stepper" aria-label={`Ajustar ${item.name}`}>
          <button
            disabled={item.quantity <= 0}
            onClick={() => onAdjust(item, -1)}
            type="button"
          >
            −1
          </button>
          <strong>{item.quantity}</strong>
          <button onClick={() => onAdjust(item, 1)} type="button">
            +1
          </button>
        </div>
      ) : null}
      {item.trackingMode === 'measure' && item.quantity !== null && onAdjust ? (
        <div className="pantry-stepper" aria-label={`Ajustar ${item.name}`}>
          <button
            onClick={() => onAdjust(item, -measureStep(item.unitCode))}
            type="button"
          >
            −{measureStepLabel(item.unitCode)}
          </button>
          <strong>{item.quantityLabel}</strong>
          <button
            onClick={() => onAdjust(item, measureStep(item.unitCode))}
            type="button"
          >
            +{measureStepLabel(item.unitCode)}
          </button>
        </div>
      ) : null}
      {showLegacyPresenceControls &&
      item.trackingMode === 'approximate' &&
      onSetPresence ? (
        <div
          className="pantry-presence"
          aria-label={`Estado de ${item.name}`}
          hidden
        >
          <button
            className={item.status === 'available' ? 'is-available' : undefined}
            onClick={() => onSetPresence(item, 'available')}
            type="button"
          >
            Hay
          </button>
          <button
            className={item.status === 'low' ? 'is-low' : undefined}
            onClick={() => onSetPresence(item, 'low')}
            type="button"
          >
            Queda poco
          </button>
          <button
            className={item.status === 'out' ? 'is-out' : undefined}
            onClick={() => onSetPresence(item, 'out')}
            type="button"
          >
            Se terminó
          </button>
        </div>
      ) : null}
      {onSetPresence && item.status !== 'out' ? (
        <button
          className="pantry-quick-action pantry-quick-action--out"
          onClick={() => onSetPresence(item, 'out')}
          type="button"
          aria-label={`Marcar ${item.name} como terminado`}
        >
          Se terminó
        </button>
      ) : null}
      {onRemove && item.status === 'out' ? (
        <button
          className="pantry-quick-action"
          onClick={() => onRemove(item)}
          type="button"
        >
          Quitar de despensa
        </button>
      ) : null}
      {onMarkLow &&
      item.status === 'available' &&
      item.trackingMode !== 'approximate' ? (
        <button
          className="pantry-quick-action"
          type="button"
          onClick={() => onMarkLow(item)}
          aria-label={`Marcar ${item.name} como queda poco`}
        >
          Queda poco
        </button>
      ) : null}
    </div>
  )
}

function measureStep(unitCode: PresentedPantryItem['unitCode']): number {
  return unitCode === 'kg' ? 0.25 : unitCode === 'l' ? 0.5 : 250
}

function measureStepLabel(unitCode: PresentedPantryItem['unitCode']): string {
  return unitCode === 'kg'
    ? '0,25 kg'
    : unitCode === 'l'
      ? '0,5 l'
      : `250 ${unitCode ?? 'g'}`
}

function Navigation({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Navegación principal">
      <Link href="/plan">Plan</Link>
      <Link href="/recetas">Recetas</Link>
      <Link href="/compra">Compra</Link>
      <a aria-current="page" href="/despensa">
        Despensa
      </a>
    </nav>
  )
}

export function PantryList({
  initialItems,
  onAdd,
  onMarkLow,
  onAdjust,
  onSetPresence,
  onRemove,
  detail,
  status,
  onUndo,
  onAddToShopping,
  undoItemName,
}: Props) {
  const [query, setQuery] = useState('')
  const rows = useMemo(
    () =>
      prioritizePantryItems(initialItems).filter((item) =>
        item.name
          .toLocaleLowerCase('es')
          .includes(query.toLocaleLowerCase('es')),
      ),
    [initialItems, query],
  )
  const zoneGroups = useMemo(() => groupPantryItemsByZone(rows), [rows])

  return (
    <main className="pantry-page">
      <aside className="pantry-sidebar">
        <BrandLockup className="pantry-brand" />
        <Navigation className="pantry-sidebar__nav" />
      </aside>
      <section className="pantry-content" aria-labelledby="pantry-title">
        <header className="pantry-header">
          <h1 id="pantry-title">Despensa</h1>
          <button className="pantry-add" onClick={onAdd} type="button">
            + Añadir producto
          </button>
        </header>
        <label className="sr-only" htmlFor="pantry-search">
          Buscar en despensa
        </label>
        <input
          id="pantry-search"
          className="pantry-search"
          type="search"
          role="searchbox"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar en despensa…"
        />
        {status ? (
          <p className="pantry-sync-status" aria-live="polite">
            {status}
          </p>
        ) : null}
        <div
          className={`pantry-workspace${detail ? ' pantry-workspace--detail' : ''}`}
        >
          <div className="pantry-list-column">
            {zoneGroups.map(({ zone, items }) => {
              const urgent = items.filter((item) => item.status === 'low')
              const finished = items.filter((item) => item.status === 'out')
              const regular = items.filter(
                (item) => item.status === 'available',
              )
              return (
                <section
                  className="pantry-list"
                  aria-label={`Inventario: ${PANTRY_ZONE_META[zone].label}`}
                  key={zone}
                >
                  <h2 className="pantry-zone__title">
                    <span
                      aria-hidden="true"
                      className={`pantry-zone-icon pantry-zone-icon--${zone}`}
                    />
                    {PANTRY_ZONE_META[zone].label}
                    <span className="pantry-zone__count">{items.length}</span>
                  </h2>
                  {urgent.length ? (
                    <div className="pantry-list__priority">
                      <h3>Requieren atención</h3>
                      {urgent.map((item) => (
                        <PantryRow
                          item={item}
                          key={item.id}
                          onAdjust={onAdjust}
                          onMarkLow={onMarkLow}
                          onSetPresence={onSetPresence}
                          onRemove={onRemove}
                        />
                      ))}
                    </div>
                  ) : null}
                  {regular.length ? (
                    <div
                      className={
                        urgent.length ? 'pantry-list__regular' : undefined
                      }
                    >
                      {regular.map((item) => (
                        <PantryRow
                          item={item}
                          key={item.id}
                          onAdjust={onAdjust}
                          onMarkLow={onMarkLow}
                          onSetPresence={onSetPresence}
                          onRemove={onRemove}
                        />
                      ))}
                    </div>
                  ) : null}
                  {finished.length ? (
                    <div className="pantry-list__regular pantry-list__finished">
                      <h3>Terminados</h3>
                      {finished.map((item) => (
                        <PantryRow
                          item={item}
                          key={item.id}
                          onSetPresence={onSetPresence}
                          onRemove={onRemove}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              )
            })}
            {!rows.length ? (
              <p className="pantry-empty">
                {query
                  ? `No encontramos «${query}».`
                  : 'Añade lo que tienes o termina una compra.'}
              </p>
            ) : null}
            {rows.length ? (
              <p className="pantry-hint">
                Toca una fila para ver el detalle del producto.
              </p>
            ) : null}
          </div>
          {detail}
        </div>
        {onUndo && undoItemName ? (
          <div className="pantry-toast" role="status">
            <span>{undoItemName} → Se terminó</span>
            {onAddToShopping ? (
              <button
                onClick={() => {
                  const item = prioritizePantryItems(initialItems).find(
                    (candidate) => candidate.name === undoItemName,
                  )
                  if (item) onAddToShopping(item)
                }}
                type="button"
              >
                Añadir a compra
              </button>
            ) : null}
            <button onClick={onUndo} type="button">
              Deshacer
            </button>
          </div>
        ) : null}
      </section>
      <Navigation className="pantry-bottom-nav" />
    </main>
  )
}
