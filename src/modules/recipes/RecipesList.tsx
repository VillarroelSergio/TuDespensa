'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'

import { AppShell } from '@/components/ui/AppShell'
import {
  DISH_TYPE_OPTIONS,
  availableCategories,
  dishTypeLabel,
  filterRecipes,
  timeLabel,
} from './presentation'
import type { Recipe, RecipeDishType } from './types'

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
  const [dishType, setDishType] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const categories = useMemo(
    () => availableCategories(initialRecipes),
    [initialRecipes],
  )
  const recipes = useMemo(
    () =>
      filterRecipes(initialRecipes, term, {
        favoritesOnly,
        category: category || undefined,
        dishType: (dishType || undefined) as RecipeDishType | undefined,
      }),
    [initialRecipes, term, favoritesOnly, category, dishType],
  )
  // Vuelve a la primera tanda cuando cambia el filtro: si no, un filtro estrecho
  // podría dejar fuera resultados por el corte de la tanda anterior.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [term, favoritesOnly, category, dishType])
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
      <div aria-labelledby="recipes-title">
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
            ★ Favoritas
          </button>
          <label className="sr-only" htmlFor="recipes-dish-type">
            Tipo de plato
          </label>
          <select
            id="recipes-dish-type"
            className="recipes-filter-select"
            value={dishType}
            onChange={(event) => setDishType(event.target.value)}
          >
            <option value="">Todos los tipos</option>
            {DISH_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {categories.length ? (
            <>
              <label className="sr-only" htmlFor="recipes-category">
                Categoría
              </label>
              <select
                id="recipes-category"
                className="recipes-filter-select"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">Todas las categorías</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
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
            <a
              className="recipe-card"
              key={recipe.id}
              href={`/recetas/${recipe.id}`}
            >
              <span className="recipe-card__title">
                {recipe.isFavorite ? '★ ' : ''}
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
            </a>
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
              {term.trim() || favoritesOnly || category || dishType
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
