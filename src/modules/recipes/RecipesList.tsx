'use client'

import Link from 'next/link'
import { FormEvent, useMemo, useState } from 'react'

import { AppShell } from '@/components/ui/AppShell'
import {
  QUICK_MAIN_INGREDIENT_CATEGORIES,
  dishTypeLabel,
  filterRecipes,
  timeLabel,
} from './presentation'
import type { Recipe } from './types'

/** Recetas por tanda: evita renderizar las 164 de golpe (Fase rendimiento). */
const PAGE_SIZE = 24

type Props = {
  initialRecipes: Recipe[]
  pending: boolean
  status: string
  onCreateManual: (title: string) => void
  onCaptureLink: (url: string) => void
  onLoadSeed: () => void
}

export function RecipesList({
  initialRecipes,
  pending,
  status,
  onCreateManual,
  onCaptureLink,
  onLoadSeed,
}: Props) {
  const [term, setTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [category, setCategory] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const recipes = useMemo(
    () =>
      filterRecipes(initialRecipes, term, {
        favoritesOnly,
        category: category || undefined,
      }),
    [initialRecipes, term, favoritesOnly, category],
  )
  // Vuelve a la primera tanda cuando cambia el filtro: si no, un filtro estrecho
  // podría dejar fuera resultados por el corte de la tanda anterior. Se ajusta
  // durante el render (no en un efecto) para evitar un repintado en cascada.
  const [appliedFilters, setAppliedFilters] = useState([
    term,
    favoritesOnly,
    category,
  ])
  if (
    appliedFilters[0] !== term ||
    appliedFilters[1] !== favoritesOnly ||
    appliedFilters[2] !== category
  ) {
    setAppliedFilters([term, favoritesOnly, category])
    setVisibleCount(PAGE_SIZE)
  }
  const visibleRecipes = recipes.slice(0, visibleCount)

  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || pending) return
    onCreateManual(title.trim())
    setTitle('')
  }
  function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!link.trim() || pending) return
    onCaptureLink(link.trim())
    setLink('')
  }

  return (
    <AppShell current="recetas">
      <div>
        <header className="shopping-header">
          <h1 id="recipes-title">Recetas</h1>
          <button
            className="recipes-add-cta"
            type="button"
            onClick={() => setAdding((open) => !open)}
            aria-expanded={adding}
          >
            Añadir receta
          </button>
        </header>
        <label className="sr-only" htmlFor="recipes-search">
          Busca una receta o ingrediente
        </label>
        <input
          className="recipes-search"
          id="recipes-search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          maxLength={160}
          placeholder="Busca una receta o ingrediente"
          type="search"
        />
        <div className="recipes-filters">
          <button
            type="button"
            className={`recipes-filter${favoritesOnly ? ' is-active' : ''}`}
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((only) => !only)}
          >
            {/* La estrella es decorativa: sin aria-hidden el lector leía
                «estrella negra Favoritas». */}
            <span aria-hidden="true">★ </span>Favoritas
          </button>
          <div
            className="recipes-quick-categories"
            role="group"
            aria-label="Filtrar por ingrediente principal"
          >
            {QUICK_MAIN_INGREDIENT_CATEGORIES.map((name) => {
              const active = category === name
              return (
                <button
                  key={name}
                  type="button"
                  className={`recipes-filter${active ? ' is-active' : ''}`}
                  // aria-pressed, no aria-current: es un filtro que se activa y
                  // desactiva, no la página en la que estás.
                  aria-pressed={active}
                  onClick={() => setCategory(active ? '' : name)}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>
        {adding ? (
          <div className="recipes-add">
            <form className="recipes-form" onSubmit={submitManual}>
              <label className="sr-only" htmlFor="recipe-title">
                Nombre de la receta
              </label>
              <input
                id="recipe-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                placeholder="Crear manualmente: nombre de la receta"
                autoFocus
              />
              <button disabled={pending || !title.trim()} type="submit">
                Crear
              </button>
            </form>
            <form className="recipes-form" onSubmit={submitLink}>
              <label className="sr-only" htmlFor="recipe-link">
                Enlace de la receta
              </label>
              <input
                id="recipe-link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                maxLength={2048}
                placeholder="Pegar enlace (https://…)"
                type="url"
              />
              <button disabled={pending || !link.trim()} type="submit">
                Guardar enlace
              </button>
            </form>
          </div>
        ) : null}
        {status ? (
          <p className="pantry-sync-status" aria-live="polite">
            {status}
          </p>
        ) : null}
        <section className="recipes-list" aria-label="Biblioteca de recetas">
          {visibleRecipes.map((recipe) => (
            <Link
              className="recipe-card"
              key={recipe.id}
              href={`/recetas/${recipe.id}`}
            >
              <span
                aria-hidden="true"
                className={`recipe-card__thumb recipe-card__thumb--${recipe.dishType ?? 'other'}`}
              />
              <span className="recipe-card__title">
                {recipe.isFavorite ? (
                  <>
                    <span aria-hidden="true">★ </span>
                    <span className="sr-only">Favorita: </span>
                  </>
                ) : null}
                {recipe.title}
              </span>
              {recipe.status === 'pending' ? (
                <span className="recipe-card__tag">Por revisar</span>
              ) : null}
              {recipe.dishType || recipe.totalMinutes ? (
                <span className="recipe-card__meta">
                  {[
                    dishTypeLabel(recipe.dishType),
                    timeLabel(recipe.totalMinutes),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              ) : null}
            </Link>
          ))}
        </section>
        {recipes.length > visibleCount ? (
          <button
            type="button"
            className="recipes-show-more"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Mostrar más ({recipes.length - visibleCount} restantes)
          </button>
        ) : null}
        {!recipes.length ? (
          <div className="recipes-empty">
            <p>
              {term.trim() || favoritesOnly || category
                ? 'No hay recetas que coincidan con el filtro.'
                : 'Guarda recetas para decidir más rápido.'}
            </p>
            {!initialRecipes.length ? (
              <button
                type="button"
                className="recipes-seed"
                disabled={pending}
                onClick={onLoadSeed}
              >
                Cargar recetas base
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  )
}
