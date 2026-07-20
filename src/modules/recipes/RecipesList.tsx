'use client'

import { FormEvent, useMemo, useState } from 'react'

import { DISH_TYPE_OPTIONS, dishTypeLabel, filterRecipes, timeLabel } from './presentation'
import type { Recipe, RecipeDishType } from './types'

export type NewRecipe = { title: string; dishType: RecipeDishType | null; totalMinutes: number | null }

function Navigation({ className }: { className: string }) {
  return <nav className={className} aria-label="Navegación principal"><a href="/plan">Plan</a><a aria-current="page" href="/recetas">Recetas</a><a href="/compra">Compra</a><a href="/despensa">Despensa</a></nav>
}

export function RecipesList({ initialRecipes, pending, status, onAdd }: { initialRecipes: Recipe[]; pending: boolean; status: string; onAdd: (recipe: NewRecipe) => void }) {
  const [term, setTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [dishType, setDishType] = useState<'' | RecipeDishType>('')
  const [minutes, setMinutes] = useState('')
  const recipes = useMemo(() => filterRecipes(initialRecipes, term), [initialRecipes, term])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = title.trim()
    if (!value || pending) return
    const parsedMinutes = minutes.trim() ? Number.parseInt(minutes, 10) : null
    onAdd({ title: value, dishType: dishType || null, totalMinutes: Number.isNaN(parsedMinutes) ? null : parsedMinutes })
    setTitle(''); setDishType(''); setMinutes(''); setAdding(false)
  }

  return <main className="shopping-page">
    <aside className="shopping-sidebar"><a className="pantry-brand" href="/plan"><span aria-hidden="true" /> MiDespensa</a><Navigation className="shopping-sidebar__nav" /></aside>
    <section className="shopping-content" aria-labelledby="recipes-title">
      <header className="shopping-header"><h1 id="recipes-title">Recetas</h1><button className="recipes-add-cta" type="button" onClick={() => setAdding((open) => !open)} aria-expanded={adding}>Añadir receta</button></header>
      <label className="sr-only" htmlFor="recipes-search">Busca una receta o ingrediente</label>
      <input className="recipes-search" id="recipes-search" value={term} onChange={(event) => setTerm(event.target.value)} maxLength={160} placeholder="Busca una receta o ingrediente" type="search" />
      {adding ? <form className="recipes-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="recipe-title">Nombre de la receta</label>
        <input id="recipe-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Nombre de la receta" autoFocus />
        <div className="recipes-form__row">
          <label className="sr-only" htmlFor="recipe-dish">Tipo de plato</label>
          <select id="recipe-dish" value={dishType} onChange={(event) => setDishType(event.target.value as '' | RecipeDishType)}>
            <option value="">Tipo de plato</option>
            {DISH_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="recipe-minutes">Tiempo en minutos</label>
          <input id="recipe-minutes" value={minutes} onChange={(event) => setMinutes(event.target.value)} inputMode="numeric" min={0} max={1440} placeholder="Minutos" type="number" />
          <button disabled={pending || !title.trim()} type="submit">Guardar</button>
        </div>
      </form> : null}
      {status ? <p className="pantry-sync-status" aria-live="polite">{status}</p> : null}
      <section className="recipes-list" aria-label="Biblioteca de recetas">
        {/* ponytail: tarjeta no navegable en 4A; el detalle R3 y su enlace llegan en 4B. */}
        {recipes.map((recipe) => <article className="recipe-card" key={recipe.id}>
          <span className="recipe-card__title">{recipe.title}</span>
          {(recipe.dishType || recipe.totalMinutes) ? <span className="recipe-card__meta">{[dishTypeLabel(recipe.dishType), timeLabel(recipe.totalMinutes)].filter(Boolean).join(' · ')}</span> : null}
        </article>)}
      </section>
      {!recipes.length ? <p className="recipes-empty">{term.trim() ? `No hay recetas para «${term.trim()}».` : 'Guarda recetas para decidir más rápido.'}</p> : null}
    </section>
    <Navigation className="shopping-bottom-nav" />
  </main>
}
