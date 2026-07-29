'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import { AppShell } from '@/components/ui/AppShell'
import { formatQuantity, shoppingProgress } from './presentation'
import type { ShoppingItem } from './types'

function SelectAllRow({
  total,
  purchased,
  pending,
  onToggleAll,
}: {
  total: number
  purchased: number
  pending: boolean
  onToggleAll: (purchased: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const allChecked = total > 0 && purchased === total
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = purchased > 0 && !allChecked
  }, [purchased, allChecked])
  return (
    <label className="shopping-select-all">
      <input
        ref={ref}
        checked={allChecked}
        disabled={pending}
        onChange={() => onToggleAll(!allChecked)}
        type="checkbox"
      />
      <span>Seleccionar todo</span>
    </label>
  )
}

function Row({
  item,
  pending,
  onToggle,
  onDelete,
}: {
  item: ShoppingItem
  pending: boolean
  onToggle: (item: ShoppingItem) => void
  onDelete: (item: ShoppingItem) => void
}) {
  const quantity = formatQuantity(item.quantity, item.unitCode)
  return (
    <div
      className={`shopping-row${item.isPurchased ? ' shopping-row--purchased' : ''}`}
    >
      <label className="shopping-row__label">
        <input
          checked={item.isPurchased}
          disabled={pending}
          onChange={() => onToggle(item)}
          type="checkbox"
        />
        <span>{item.name}</span>
        {quantity || item.source === 'pantry' ? (
          <span className="shopping-row__meta">
            {quantity ? (
              <small className="shopping-qty">{quantity}</small>
            ) : null}
            {item.source === 'pantry' ? <small>Desde despensa</small> : null}
          </span>
        ) : null}
      </label>
      <button
        aria-label={`Eliminar ${item.name}`}
        className="shopping-row__delete"
        disabled={pending}
        onClick={() => onDelete(item)}
        type="button"
      >
        ×
      </button>
    </div>
  )
}

export function ShoppingList({
  initialItems,
  pending,
  status,
  notice,
  onAdd,
  onToggle,
  onToggleAll,
  onDelete,
}: {
  initialItems: ShoppingItem[]
  pending: boolean
  status: string
  notice?: string | null
  onAdd: (name: string) => void
  onToggle: (item: ShoppingItem) => void
  onToggleAll: (purchased: boolean) => void
  onDelete: (item: ShoppingItem) => void
}) {
  const [name, setName] = useState('')
  const items = useMemo(
    () =>
      [...initialItems].sort(
        (a, b) =>
          Number(a.isPurchased) - Number(b.isPurchased) ||
          a.name.localeCompare(b.name, 'es'),
      ),
    [initialItems],
  )
  const purchased = items.filter((item) => item.isPurchased).length
  const progress = shoppingProgress(items.length, purchased)
  // «Para el plan» agrupa lo que llega de recetas planificadas; el resto es la
  // lista propia (manual o enviado desde Despensa).
  const planItems = items.filter((item) => item.source === 'plan')
  const otherItems = items.filter((item) => item.source !== 'plan')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = name.trim()
    if (!value || pending) return
    onAdd(value)
    setName('')
  }
  return (
    <AppShell current="compra">
      <div aria-labelledby="shopping-title">
        <header className="shopping-header">
          <div>
            <p className="shopping-kicker">Lista de esta semana</p>
            <h1 id="shopping-title">Compra</h1>
          </div>
          <div
            className="shopping-progress"
            aria-label={`${purchased} de ${items.length} productos comprados`}
          >
            <strong>{progress.label}</strong>
            <span>
              {purchased} / {items.length}
            </span>
          </div>
        </header>
        {notice ? <p className="plan-notice">{notice}</p> : null}
        <form className="shopping-add" onSubmit={submit}>
          <label className="sr-only" htmlFor="shopping-name">
            Añadir a la compra
          </label>
          <input
            id="shopping-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            placeholder="Añadir a la compra"
          />
          <button disabled={pending || !name.trim()} type="submit">
            Añadir
          </button>
        </form>
        <div className="shopping-progress-bar" aria-hidden="true">
          <span style={{ width: `${progress.ratio * 100}%` }} />
        </div>
        <a className="shopping-back shopping-ticket-link" href="/compra/ticket">
          Importar de un ticket
        </a>
        {status ? (
          <p className="pantry-sync-status" aria-live="polite">
            {status}
          </p>
        ) : null}
        {items.length ? (
          <SelectAllRow
            total={items.length}
            purchased={purchased}
            pending={pending}
            onToggleAll={onToggleAll}
          />
        ) : null}
        {planItems.length ? (
          <section className="shopping-list" aria-label="Para el plan">
            <h2 className="shopping-group">Para el plan</h2>
            {planItems.map((item) => (
              <Row
                key={item.id}
                item={item}
                pending={pending}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            ))}
          </section>
        ) : null}
        <section className="shopping-list" aria-label="Lista de compra">
          {otherItems.length ? (
            <h2 className="shopping-group">Tu lista</h2>
          ) : null}
          {otherItems.map((item) => (
            <Row
              key={item.id}
              item={item}
              pending={pending}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
          {!items.length ? (
            <p className="shopping-empty">
              Añade productos que necesites comprar. Desde Despensa también
              puedes enviarlos aquí.
            </p>
          ) : null}
        </section>
        {purchased ? (
          <a className="shopping-confirm" href="/compra/revisar">
            Confirmar compra · {purchased}
          </a>
        ) : (
          <button className="shopping-confirm" disabled type="button">
            Confirmar compra
          </button>
        )}
      </div>
    </AppShell>
  )
}
