'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'

import { BrandLockup } from '@/components/ui/BrandLockup'

import {
  prioritizePantryItems,
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
  onUndo?: () => void
  onAddToShopping?: (item: PresentedPantryItem) => void
  undoItemName?: string
  onOpen?: (item: PresentedPantryItem) => void
  selectedId?: string | null
  detail?: ReactNode
  status?: string
}

const statusCopy = {
  out: 'Se terminó',
  low: 'Queda poco',
  available: 'Hay',
} as const

function PantryRow({
  item,
  onMarkLow,
  onAdjust,
  onSetPresence,
  onOpen,
  selected,
}: {
  item: PresentedPantryItem
  onMarkLow?: (item: PresentedPantryItem) => void
  onAdjust?: (item: PresentedPantryItem, delta: number) => void
  onSetPresence?: (
    item: PresentedPantryItem,
    state: 'available' | 'low' | 'out',
  ) => void
  onOpen?: (item: PresentedPantryItem) => void
  selected?: boolean
}) {
  return (
    <div
      className={`pantry-row pantry-row--${item.status}${selected ? ' pantry-row--selected' : ''}`}
    >
      <button
        className="pantry-row__detail"
        type="button"
        aria-label={`Abrir ${item.name}. ${statusCopy[item.status]}`}
        onClick={() => onOpen?.(item)}
      >
        <span className="pantry-row__dot" aria-hidden="true" />
        <span className="pantry-row__name">{item.name}</span>
        {item.quantityLabel ? (
          <span className="pantry-row__quantity">{item.quantityLabel}</span>
        ) : null}
        <span className="pantry-row__status">{statusCopy[item.status]}</span>
      </button>
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
      {item.trackingMode === 'approximate' && onSetPresence ? (
        <div className="pantry-presence" aria-label={`Estado de ${item.name}`}>
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
      {onSetPresence && item.trackingMode !== 'approximate' ? (
        <button
          className="pantry-quick-action pantry-quick-action--out"
          onClick={() => onSetPresence(item, 'out')}
          type="button"
        >
          Se terminó
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
  onOpen,
  selectedId,
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
  const urgent = rows.filter((item) => item.status !== 'available')
  const regular = rows.filter((item) => item.status === 'available')

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
            <section
              className="pantry-list"
              aria-label="Inventario de despensa"
            >
              {urgent.length ? (
                <div className="pantry-list__priority">
                  <h2>Requieren atención</h2>
                  {urgent.map((item) => (
                    <PantryRow
                      item={item}
                      key={item.id}
                      onAdjust={onAdjust}
                      onMarkLow={onMarkLow}
                      onOpen={onOpen}
                      onSetPresence={onSetPresence}
                      selected={item.id === selectedId}
                    />
                  ))}
                </div>
              ) : null}
              {regular.length ? (
                <div
                  className={urgent.length ? 'pantry-list__regular' : undefined}
                >
                  {regular.map((item) => (
                    <PantryRow
                      item={item}
                      key={item.id}
                      onAdjust={onAdjust}
                      onMarkLow={onMarkLow}
                      onOpen={onOpen}
                      onSetPresence={onSetPresence}
                      selected={item.id === selectedId}
                    />
                  ))}
                </div>
              ) : null}
              {!rows.length ? (
                <p className="pantry-empty">
                  {query
                    ? `No encontramos «${query}».`
                    : 'Añade lo que tienes o termina una compra.'}
                </p>
              ) : null}
            </section>
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
