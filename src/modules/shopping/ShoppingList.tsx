'use client'

import { FormEvent, useMemo, useState } from 'react'

import type { ShoppingItem } from './types'

function Navigation({ className }: { className: string }) {
  return <nav className={className} aria-label="Navegación principal"><a href="/plan">Plan</a><a href="/recetas">Recetas</a><a aria-current="page" href="/compra">Compra</a><a href="/despensa">Despensa</a></nav>
}

export function ShoppingList({ initialItems, pending, status, onAdd, onToggle }: { initialItems: ShoppingItem[]; pending: boolean; status: string; onAdd: (name: string) => void; onToggle: (item: ShoppingItem) => void }) {
  const [name, setName] = useState('')
  const items = useMemo(() => [...initialItems].sort((a, b) => Number(a.isPurchased) - Number(b.isPurchased) || a.name.localeCompare(b.name, 'es')), [initialItems])
  const purchased = items.filter((item) => item.isPurchased).length
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const value = name.trim(); if (!value || pending) return; onAdd(value); setName('') }
  return <main className="shopping-page">
    <aside className="shopping-sidebar"><a className="pantry-brand" href="/plan"><span aria-hidden="true" /> MiDespensa</a><Navigation className="shopping-sidebar__nav" /></aside>
    <section className="shopping-content" aria-labelledby="shopping-title">
      <header className="shopping-header"><h1 id="shopping-title">Compra</h1><p>{purchased} de {items.length}</p></header>
      <form className="shopping-add" onSubmit={submit}><label className="sr-only" htmlFor="shopping-name">Añadir a la compra</label><input id="shopping-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Añadir a la compra" /><button disabled={pending || !name.trim()} type="submit">Añadir</button></form>
      {status ? <p className="pantry-sync-status" aria-live="polite">{status}</p> : null}
      <section className="shopping-list" aria-label="Lista de compra">
        {items.map((item) => <label className={`shopping-row${item.isPurchased ? ' shopping-row--purchased' : ''}`} key={item.id}><input checked={item.isPurchased} disabled={pending} onChange={() => onToggle(item)} type="checkbox" /><span>{item.name}</span>{item.source === 'pantry' ? <small>Desde despensa</small> : null}</label>)}
        {!items.length ? <p className="shopping-empty">Añade productos que necesites comprar. Desde Despensa también puedes enviarlos aquí.</p> : null}
      </section>
      {purchased ? <p className="shopping-next">La revisión final y el paso a Despensa llegarán en la siguiente fase de Compra.</p> : null}
    </section>
    <Navigation className="shopping-bottom-nav" />
  </main>
}
