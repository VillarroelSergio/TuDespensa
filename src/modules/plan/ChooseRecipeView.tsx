import { timeLabel } from '@/modules/recipes/presentation'
import type { Recipe } from '@/modules/recipes/types'

import { assignMealAction } from './actions'
import { slotLabel, weekStart } from './presentation'
import type { MealType } from './types'

// ponytail: la biblioteca guardada se lista entera con búsqueda. Las tres
// sugerencias explicables (motivo y disponibilidad) son Fase 5C.
export function ChooseRecipeView({
  mealDate,
  mealType,
  query,
  recipes,
}: {
  mealDate: string
  mealType: MealType
  query: string
  recipes: Recipe[]
}) {
  const backHref = `/plan?semana=${weekStart(mealDate)}`
  const results = query
    ? recipes.filter((recipe) =>
        recipe.title.toLowerCase().includes(query.toLowerCase()),
      )
    : recipes

  return (
    <main className="choose-page">
      <a className="choose-back" href={backHref}>
        ← Añadir a · {slotLabel(mealDate, mealType)}
      </a>
      <h1 className="choose-title">¿Qué quieres comer?</h1>

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
          <a href="/recetas">Añadir receta</a>
        </p>
      ) : results.length === 0 ? (
        <p className="choose-empty">
          Ninguna receta coincide con «{query}».{' '}
          <a href={`/plan/elegir?fecha=${mealDate}&servicio=${mealType}`}>
            Ver todas las recetas
          </a>
        </p>
      ) : (
        <ul className="choose-list">
          {results.map((recipe) => (
            <li key={recipe.id}>
              {/* Elegir confirma el hueco directamente; las raciones se ajustan
                  después desde el menú contextual (UX Plan P2). */}
              <form action={assignMealAction}>
                <input type="hidden" name="fecha" value={mealDate} />
                <input type="hidden" name="servicio" value={mealType} />
                <input type="hidden" name="receta" value={recipe.id} />
                <button className="choose-recipe" type="submit">
                  <span className="choose-recipe__title">{recipe.title}</span>
                  <span className="choose-recipe__meta">
                    {timeLabel(recipe.totalMinutes)}
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
