'use client'

import { useMemo, useState } from 'react'

import {
  prioritizePantryItems,
  type PantryListItem,
  type PresentedPantryItem,
} from './presentation'

type Props = { initialItems: PantryListItem[] }

const statusCopy = {
  out: 'Se terminó',
  low: 'Queda poco',
  available: 'Hay',
} as const

function PantryRow({ item }: { item: PresentedPantryItem }) {
  return (
    <button
      className={`pantry-row pantry-row--${item.status}`}
      type="button"
      aria-label={`Abrir ${item.name}. ${statusCopy[item.status]}`}
    >
      <span className="pantry-row__dot" aria-hidden="true" />
      <span className="pantry-row__name">{item.name}</span>
      {item.quantityLabel ? <span className="pantry-row__quantity">{item.quantityLabel}</span> : null}
      <span className="pantry-row__status">{statusCopy[item.status]}</span>
    </button>
  )
}

function Navigation({ className }: { className: string }) {
  return <nav className={className} aria-label="Navegación principal">
    <a href="/plan">Plan</a><a href="/recetas">Recetas</a><a href="/compra">Compra</a>
    <a aria-current="page" href="/despensa">Despensa</a>
  </nav>
}

export function PantryList({ initialItems }: Props) {
  const [query, setQuery] = useState('')
  const rows = useMemo(() => prioritizePantryItems(initialItems).filter((item) => item.name.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))), [initialItems, query])
  const urgent = rows.filter((item) => item.status !== 'available')
  const regular = rows.filter((item) => item.status === 'available')

  return <main className="pantry-page">
    <aside className="pantry-sidebar"><a className="pantry-brand" href="/plan"><span aria-hidden="true" /> MiDespensa</a><Navigation className="pantry-sidebar__nav" /></aside>
    <section className="pantry-content" aria-labelledby="pantry-title">
      <header className="pantry-header"><h1 id="pantry-title">Despensa</h1><button className="pantry-add" type="button">+ Añadir producto</button></header>
      <label className="sr-only" htmlFor="pantry-search">Buscar en despensa</label>
      <input id="pantry-search" className="pantry-search" type="search" role="searchbox" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en despensa…" />
      <section className="pantry-list" aria-label="Inventario de despensa">
        {urgent.length ? <div className="pantry-list__priority"><h2>Requieren atención</h2>{urgent.map((item) => <PantryRow item={item} key={item.id} />)}</div> : null}
        {regular.length ? <div className={urgent.length ? 'pantry-list__regular' : undefined}>{regular.map((item) => <PantryRow item={item} key={item.id} />)}</div> : null}
        {!rows.length ? <p className="pantry-empty">{query ? `No encontramos «${query}».` : 'Añade lo que tienes o termina una compra.'}</p> : null}
      </section>
      {rows.length ? <p className="pantry-hint">Toca una fila para ver el detalle del producto.</p> : null}
    </section>
    <Navigation className="pantry-bottom-nav" />
  </main>
}
