'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'

import { timeLabel } from '@/modules/recipes/presentation'
import type { Recipe } from '@/modules/recipes/types'
import { AppShell } from '@/components/ui/AppShell'

import { assignMealAction } from './actions'
import { slotLabel, weekStart } from './presentation'
import { availabilityLabel } from './suggestions'
import type { Suggestion } from './suggestions'
import type { MealType } from './types'

/** Botón de elegir receta: el mismo formulario para sugerencia y para búsqueda. */
function ChooseForm({
  mealDate,
  mealType,
  recipeId,
  className,
  children,
}: {
  mealDate: string
  mealType: MealType
  recipeId: string
  className: string
  children: ReactNode
}) {
  return (
    // Elegir confirma el hueco directamente (UX Plan P2).
    <form action={assignMealAction}>
      <input type="hidden" name="fecha" value={mealDate} />
      <input type="hidden" name="servicio" value={mealType} />
      <input type="hidden" name="receta" value={recipeId} />
      {/* Toda receta añadida al plan es siempre para 2 raciones; no es editable. */}
      <input type="hidden" name="raciones" value="2" />
      {/* Elegir desde P2 es lo único que consolida faltantes en Compra; ajustar
          raciones o deshacer un borrado no deben tocar la lista. */}
      <input type="hidden" name="consolidar" value="1" />
      <button className={className} type="submit">
        {children}
      </button>
    </form>
  )
}

function SuggestionItem({
  suggestion,
  mealDate,
  mealType,
  className,
}: {
  suggestion: Suggestion
  mealDate: string
  mealType: MealType
  className: string
}) {
  return (
    <ChooseForm
      className={className}
      mealDate={mealDate}
      mealType={mealType}
      recipeId={suggestion.recipeId}
    >
      <span className="choose-suggestion__title">{suggestion.title}</span>
      <span className="choose-suggestion__reason">{suggestion.reason}</span>
      <span className="choose-suggestion__availability">
        {availabilityLabel(suggestion.missing)}
      </span>
    </ChooseForm>
  )
}

export function ChooseRecipeView({
  mealDate,
  mealType,
  query,
  recipes,
  suggestions,
  recommended,
}: {
  mealDate: string
  mealType: MealType
  query: string
  recipes: Recipe[]
  suggestions: Suggestion[]
  recommended: Suggestion[]
}) {
  const backHref = `/plan?semana=${weekStart(mealDate)}`
  // Búsqueda en el propio cliente: como las recetas ya están en memoria, filtra
  // al teclear sin ida y vuelta al servidor (antes recargaba la página por cada
  // búsqueda). Sin escribir no se listan las 164 (coste de render alto): solo
  // sugerencias + recomendadas.
  const [term, setTerm] = useState(query)
  const results = useMemo(() => {
    const needle = term.trim().toLocaleLowerCase('es')
    if (!needle) return []
    return recipes.filter((recipe) =>
      recipe.title.toLocaleLowerCase('es').includes(needle),
    )
  }, [recipes, term])

  return (
    <AppShell current="plan" contentClassName="choose-page">
      <section aria-labelledby="choose-title">
        <a className="choose-back" href={backHref}>
          ← Añadir a · {slotLabel(mealDate, mealType)}
        </a>
        <header className="choose-header">
          <p className="choose-kicker">Decide una comida</p>
          <h1 className="choose-title" id="choose-title">
            ¿Qué quieres comer?
          </h1>
          <p>Elige una sugerencia o busca en tus recetas guardadas.</p>
        </header>

        {/* Las sugerencias solo aparecen sin búsqueda activa: al buscar, la
          intención ya es explícita y mandan los resultados. */}
        {!term && suggestions.length > 0 ? (
          <ul className="choose-suggestions" aria-label="Sugerencias">
            {suggestions.map((suggestion) => (
              <li key={suggestion.recipeId}>
                <SuggestionItem
                  className="choose-suggestion"
                  mealDate={mealDate}
                  mealType={mealType}
                  suggestion={suggestion}
                />
              </li>
            ))}
          </ul>
        ) : null}

        <div className="choose-search" role="search">
          <label className="choose-search__label" htmlFor="choose-q">
            Buscar una receta
          </label>
          <input
            id="choose-q"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Nombre de la receta"
          />
        </div>

        {/* Recomendadas: complementan las 3 sugerencias con 10 recetas más que
          encajan bien (comida o cena), visibles solo antes de buscar. */}
        {!term && recommended.length > 0 ? (
          <>
            <p className="choose-kicker">También te puede interesar</p>
            <ul
              className="choose-suggestions choose-suggestions--secondary"
              aria-label="Recomendadas"
            >
              {recommended.map((suggestion) => (
                <li key={suggestion.recipeId}>
                  <SuggestionItem
                    className="choose-suggestion choose-suggestion--secondary"
                    mealDate={mealDate}
                    mealType={mealType}
                    suggestion={suggestion}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {recipes.length === 0 ? (
          <p className="choose-empty">
            Todavía no tienes recetas guardadas.{' '}
            <Link href="/recetas">Añadir receta</Link>
          </p>
        ) : !term ? (
          <p className="choose-empty">
            Escribe el nombre de una receta para buscar entre tus{' '}
            {recipes.length} recetas.
          </p>
        ) : results.length === 0 ? (
          <p className="choose-empty">Ninguna receta coincide con «{term}».</p>
        ) : (
          <ul className="choose-list">
            {results.map((recipe) => (
              <li key={recipe.id}>
                <ChooseForm
                  className="choose-recipe"
                  mealDate={mealDate}
                  mealType={mealType}
                  recipeId={recipe.id}
                >
                  <span className="choose-recipe__title">{recipe.title}</span>
                  <span className="choose-recipe__meta">
                    {timeLabel(recipe.totalMinutes)}
                  </span>
                </ChooseForm>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  )
}
