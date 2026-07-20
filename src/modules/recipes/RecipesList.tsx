'use client'

import { FormEvent, useMemo, useState } from 'react'

import { dishTypeLabel, filterRecipes, timeLabel } from './presentation'
import type { Recipe } from './types'

function Navigation({ className }: { className: string }) {
  return <nav className={className} aria-label="Navegación principal"><a href="/plan">Plan</a><a aria-current="page" href="/recetas">Recetas</a><a href="/compra">Compra</a><a href="/despensa">Despensa</a></nav>
}

type Props = {
  initialRecipes: Recipe[]
  pending: boolean
  status: string
  onCreateManual: (title: string) => void
  onCaptureLink: (url: string) => void
}

export function RecipesList({ initialRecipes, pending, status, onCreateManual, onCaptureLink }: Props) {
  const [term, setTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const recipes = useMemo(() => filterRecipes(initialRecipes, term), [initialRecipes, term])

  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || pending) return
    onCreateManual(title.trim()); setTitle('')
  }
  function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!link.trim() || pending) return
    onCaptureLink(link.trim()); setLink('')
  }

  return <main className="shopping-page">
    <aside className="shopping-sidebar"><a className="pantry-brand" href="/plan"><span aria-hidden="true" /> MiDespensa</a><Navigation className="shopping-sidebar__nav" /></aside>
    <section className="shopping-content" aria-labelledby="recipes-title">
      <header className="shopping-header"><h1 id="recipes-title">Recetas</h1><button className="recipes-add-cta" type="button" onClick={() => setAdding((open) => !open)} aria-expanded={adding}>Añadir receta</button></header>
      <label className="sr-only" htmlFor="recipes-search">Busca una receta o ingrediente</label>
      <input className="recipes-search" id="recipes-search" value={term} onChange={(event) => setTerm(event.target.value)} maxLength={160} placeholder="Busca una receta o ingrediente" type="search" />
      {adding ? <div className="recipes-add">
        <form className="recipes-form" onSubmit={submitManual}>
          <label className="sr-only" htmlFor="recipe-title">Nombre de la receta</label>
          <input id="recipe-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Crear manualmente: nombre de la receta" autoFocus />
          <button disabled={pending || !title.trim()} type="submit">Crear</button>
        </form>
        <form className="recipes-form" onSubmit={submitLink}>
          <label className="sr-only" htmlFor="recipe-link">Enlace de la receta</label>
          <input id="recipe-link" value={link} onChange={(event) => setLink(event.target.value)} maxLength={2048} placeholder="Pegar enlace (https://…)" type="url" />
          <button disabled={pending || !link.trim()} type="submit">Guardar enlace</button>
        </form>
      </div> : null}
      {status ? <p className="pantry-sync-status" aria-live="polite">{status}</p> : null}
      <section className="recipes-list" aria-label="Biblioteca de recetas">
        {recipes.map((recipe) => <a className="recipe-card" key={recipe.id} href={`/recetas/${recipe.id}`}>
          <span className="recipe-card__title">{recipe.title}</span>
          {recipe.status === 'pending' ? <span className="recipe-card__tag">Por revisar</span> : null}
          {(recipe.dishType || recipe.totalMinutes) ? <span className="recipe-card__meta">{[dishTypeLabel(recipe.dishType), timeLabel(recipe.totalMinutes)].filter(Boolean).join(' · ')}</span> : null}
        </a>)}
      </section>
      {!recipes.length ? <p className="recipes-empty">{term.trim() ? `No hay recetas para «${term.trim()}».` : 'Guarda recetas para decidir más rápido.'}</p> : null}
    </section>
    <Navigation className="shopping-bottom-nav" />
  </main>
}
