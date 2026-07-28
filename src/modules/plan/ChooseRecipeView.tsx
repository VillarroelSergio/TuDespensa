'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { AppShell } from '@/components/ui/AppShell'
import {
  QUICK_MAIN_INGREDIENT_FILTERS,
  filterRecipes,
  timeLabel,
} from '@/modules/recipes/presentation'
import type { Recipe } from '@/modules/recipes/types'

import { ChooseRecipeAction } from './ChooseRecipeAction'
import { slotLabel, weekStart } from './presentation'
import { availabilityLabel } from './suggestions'
import type { Suggestion } from './suggestions'
import type { MealType } from './types'

type RecipeChoiceProps = {
  className: string
  mealDate: string
  mealType: MealType
  suggestion: Suggestion
}

function SuggestionItem({
  className,
  mealDate,
  mealType,
  suggestion,
}: RecipeChoiceProps) {
  return (
    <ChooseRecipeAction
      className={className}
      mealDate={mealDate}
      mealType={mealType}
      recipeId={suggestion.recipeId}
      servings={suggestion.servings}
      title={suggestion.title}
    >
      <span className="choose-suggestion__title">{suggestion.title}</span>
      <span className="choose-suggestion__reason">{suggestion.reason}</span>
      <span className="choose-suggestion__availability">
        {availabilityLabel(suggestion.missing)}
      </span>
    </ChooseRecipeAction>
  )
}

export function ChooseRecipeView({
  mealDate,
  mealType,
  query,
  category,
  recipes,
  suggestions,
  recommended,
}: {
  mealDate: string
  mealType: MealType
  query: string
  category: string
  recipes: Recipe[]
  suggestions: Suggestion[]
  recommended: Suggestion[]
}) {
  const backHref = `/plan?semana=${weekStart(mealDate)}`
  const [term, setTerm] = useState(query)
  const results = useMemo(
    () => filterRecipes(recipes, term, { category: category || undefined }),
    [category, recipes, term],
  )
  const chooseHref = (nextCategory = category) => {
    const params = new URLSearchParams({ fecha: mealDate, servicio: mealType })
    if (term) params.set('q', term)
    if (nextCategory) params.set('categoria', nextCategory)
    return `/plan/elegir?${params.toString()}`
  }

  return (
    <AppShell current="plan" contentClassName="choose-page">
      <section aria-labelledby="choose-title">
        <a className="choose-back" href={backHref}>
          {'\u2190 A\u00f1adir a \u00b7 '}{slotLabel(mealDate, mealType)}
        </a>
        <header className="choose-header">
          <p className="choose-kicker">Decide una comida</p>
          <h1 className="choose-title" id="choose-title">
            {'\u00bfQu\u00e9 quieres comer?'}
          </h1>
          <p>Elige una sugerencia o busca en tus recetas guardadas.</p>
        </header>

        {!term && !category && suggestions.length > 0 ? (
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
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Nombre de la receta"
            type="search"
            value={term}
          />
        </div>

        {recipes.length ? (
          <nav className="choose-filters" aria-label="Filtrar por ingrediente principal">
            {QUICK_MAIN_INGREDIENT_FILTERS.map((filter) => {
              const active =
                category.localeCompare(filter.value, 'es', { sensitivity: 'base' }) === 0
              return (
                <a
                  aria-current={active ? 'page' : undefined}
                  className={`choose-filter${active ? ' is-active' : ''}`}
                  href={chooseHref(active ? '' : filter.value)}
                  key={filter.value}
                >
                  {filter.label}
                </a>
              )
            })}
          </nav>
        ) : null}

        {!term && !category && recommended.length > 0 ? (
          <>
            <p className="choose-kicker">{'Tambi\u00e9n te puede interesar'}</p>
            <ul className="choose-suggestions choose-suggestions--secondary" aria-label="Recomendadas">
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

        {term || category ? (
          <p className="choose-results" role="status">
            {results.length}{' '}
            {results.length === 1 ? 'receta disponible' : 'recetas disponibles'}
            {category ? ` \u00b7 ${category}` : ''}
          </p>
        ) : null}

        {recipes.length === 0 ? (
          <p className="choose-empty">
            {'Todav\u00eda no tienes recetas guardadas. '}
            <Link href="/recetas">{'A\u00f1adir receta'}</Link>
          </p>
        ) : term || category ? (
          results.length === 0 ? (
            <p className="choose-empty">
              Ninguna receta coincide. <a href={chooseHref('')}>Ver todas las recetas</a>
            </p>
          ) : (
            <ul className="choose-list">
              {results.map((recipe) => (
                <li key={recipe.id}>
                  <ChooseRecipeAction
                    className="choose-recipe"
                    mealDate={mealDate}
                    mealType={mealType}
                    recipeId={recipe.id}
                    servings={recipe.servings}
                    title={recipe.title}
                  >
                    <span className="choose-recipe__title">{recipe.title}</span>
                    <span className="choose-recipe__meta">{timeLabel(recipe.totalMinutes)}</span>
                    <span className="choose-recipe__action" aria-hidden="true">
                      {'Elegir \u2192'}
                    </span>
                  </ChooseRecipeAction>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="choose-empty">
            Escribe el nombre de una receta para buscar entre tus {recipes.length} recetas.
          </p>
        )}
      </section>
    </AppShell>
  )
}
