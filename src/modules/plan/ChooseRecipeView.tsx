import Link from 'next/link'
import type { ReactNode } from 'react'

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
    // Elegir confirma el hueco directamente; las raciones se ajustan después
    // desde el menú contextual (UX Plan P2).
    <form action={assignMealAction}>
      <input type="hidden" name="fecha" value={mealDate} />
      <input type="hidden" name="servicio" value={mealType} />
      <input type="hidden" name="receta" value={recipeId} />
      {/* Elegir desde P2 es lo único que consolida faltantes en Compra; ajustar
          raciones o deshacer un borrado no deben tocar la lista. */}
      <input type="hidden" name="consolidar" value="1" />
      <button className={className} type="submit">
        {children}
      </button>
    </form>
  )
}

export function ChooseRecipeView({
  mealDate,
  mealType,
  query,
  recipes,
  suggestions,
}: {
  mealDate: string
  mealType: MealType
  query: string
  recipes: Recipe[]
  suggestions: Suggestion[]
}) {
  const backHref = `/plan?semana=${weekStart(mealDate)}`
  // Sin búsqueda no se listan todas las recetas (con 164 es un muro y un coste
  // de render alto): solo salen las sugerencias y el buscador. La lista aparece
  // al escribir.
  const results = query
    ? recipes.filter((recipe) =>
        recipe.title.toLowerCase().includes(query.toLowerCase()),
      )
    : []

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
        {!query && suggestions.length > 0 ? (
          <ul className="choose-suggestions" aria-label="Sugerencias">
            {suggestions.map((suggestion) => (
              <li key={suggestion.recipeId}>
                <ChooseForm
                  className="choose-suggestion"
                  mealDate={mealDate}
                  mealType={mealType}
                  recipeId={suggestion.recipeId}
                >
                  <span className="choose-suggestion__title">
                    {suggestion.title}
                  </span>
                  <span className="choose-suggestion__reason">
                    {suggestion.reason}
                  </span>
                  <span className="choose-suggestion__availability">
                    {availabilityLabel(suggestion.missing)}
                  </span>
                </ChooseForm>
              </li>
            ))}
          </ul>
        ) : null}

        <form className="choose-search" role="search" action="/plan/elegir">
          <input type="hidden" name="fecha" value={mealDate} />
          <input type="hidden" name="servicio" value={mealType} />
          <label className="choose-search__label" htmlFor="choose-q">
            Buscar una receta
          </label>
          <input
            id="choose-q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Nombre de la receta"
          />
          <button type="submit">Buscar</button>
        </form>

        {recipes.length === 0 ? (
          <p className="choose-empty">
            Todavía no tienes recetas guardadas.{' '}
            <Link href="/recetas">Añadir receta</Link>
          </p>
        ) : !query ? (
          <p className="choose-empty">
            Escribe el nombre de una receta para buscar entre tus{' '}
            {recipes.length} recetas.
          </p>
        ) : results.length === 0 ? (
          <p className="choose-empty">Ninguna receta coincide con «{query}».</p>
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
