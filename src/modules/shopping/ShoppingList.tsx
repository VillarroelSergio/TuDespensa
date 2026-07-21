'use client'

import { FormEvent, useMemo, useState } from 'react'

import type { ShoppingItem } from './types'

const UNIT_LABELS: Record<string, string> = { unit: 'uds.', g: 'g', kg: 'kg', ml: 'ml', l: 'l' }

// «500 g», «2 uds.»; sin unidad no mostramos nada, no inventamos «uds.».
function quantityLabel(item: ShoppingItem): string | null {
  if (item.quantity == null) return null
  const unit = item.unitCode ? UNIT_LABELS[item.unitCode] ?? '' : ''
  return unit ? `${item.quantity} ${unit}` : String(item.quantity)
}

function Navigation({ className }: { className: string }) {
  return <nav className={className} aria-label="Navegación principal"><a href="/plan">Plan</a><a href="/recetas">Recetas</a><a aria-current="page" href="/compra">Compra</a><a href="/despensa">Despensa</a></nav>
}

function Row({ item, pending, onToggle }: { item: ShoppingItem; pending: boolean; onToggle: (item: ShoppingItem) => void }) {
  const quantity = quantityLabel(item)
  return <label className={`shopping-row${item.isPurchased ? ' shopping-row--purchased' : ''}`}><input checked={item.isPurchased} disabled={pending} onChange={() => onToggle(item)} type="checkbox" /><span>{item.name}</span>{quantity ? <small className="shopping-qty">{quantity}</small> : null}{item.source === 'pantry' ? <small>Desde despensa</small> : null}</label>
}

export function ShoppingList({ initialItems, pending, status, onAdd, onToggle }: { initialItems: ShoppingItem[]; pending: boolean; status: string; onAdd: (name: string) => void; onToggle: (item: ShoppingItem) => void }) {
  const [name, setName] = useState('')
  const items = useMemo(() => [...initialItems].sort((a, b) => Number(a.isPurchased) - Number(b.isPurchased) || a.name.localeCompare(b.name, 'es')), [initialItems])
  const purchased = items.filter((item) => item.isPurchased).length
  // «Para el plan» agrupa lo que llega de recetas planificadas; el resto es la
  // lista propia (manual o enviado desde Despensa).
  const planItems = items.filter((item) => item.source === 'plan')
  const otherItems = items.filter((item) => item.source !== 'plan')
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const value = name.trim(); if (!value || pending) return; onAdd(value); setName('') }
  return <main className="shopping-page">
    <aside className="shopping-sidebar"><a className="pantry-brand" href="/plan"><span aria-hidden="true" /> MiDespensa</a><Navigation className="shopping-sidebar__nav" /></aside>
    <section className="shopping-content" aria-labelledby="shopping-title">
      <header className="shopping-header"><h1 id="shopping-title">Compra</h1><p>{purchased} de {items.length}</p></header>
      <form className="shopping-add" onSubmit={submit}><label className="sr-only" htmlFor="shopping-name">Añadir a la compra</label><input id="shopping-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Añadir a la compra" /><button disabled={pending || !name.trim()} type="submit">Añadir</button></form>
      {status ? <p className="pantry-sync-status" aria-live="polite">{status}</p> : null}
      {planItems.length ? <section className="shopping-list" aria-label="Para el plan">
        <h2 className="shopping-group">Para el plan</h2>
        {planItems.map((item) => <Row key={item.id} item={item} pending={pending} onToggle={onToggle} />)}
      </section> : null}
      <section className="shopping-list" aria-label="Lista de compra">
        {otherItems.length ? <h2 className="shopping-group">Tu lista</h2> : null}
        {otherItems.map((item) => <Row key={item.id} item={item} pending={pending} onToggle={onToggle} />)}
        {!items.length ? <p className="shopping-empty">Añade productos que necesites comprar. Desde Despensa también puedes enviarlos aquí.</p> : null}
      </section>
      {purchased ? <p className="shopping-next">La revisión final y el paso a Despensa llegarán en la siguiente fase de Compra.</p> : null}
    </section>
    <Navigation className="shopping-bottom-nav" />
  </main>
}
