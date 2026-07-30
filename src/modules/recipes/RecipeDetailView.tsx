import Link from 'next/link'

import { AppShell } from '@/components/ui/AppShell'
import type { CatalogEntry } from '@/modules/plan/suggestions'

import {
  dishTypeLabel,
  formatIngredient,
  ingredientAvailability,
  timeLabel,
  type PantryAvailabilityItem,
} from './presentation'
import { RecipePreferences } from './RecipePreferences'
import type { RecipeDetail } from './types'

const AVAILABILITY_LABEL = {
  owned: 'Ya tienes esto',
  low: 'Queda poco',
  missing: 'Te falta',
} as const

export function RecipeDetailView({
  recipe,
  pantryAvailability,
  catalog = [],
}: {
  recipe: RecipeDetail
  pantryAvailability: PantryAvailabilityItem[]
  catalog?: CatalogEntry[]
}) {
  const meta = [
    recipe.servings ? `${recipe.servings} raciones` : null,
    timeLabel(recipe.totalMinutes),
    dishTypeLabel(recipe.dishType),
  ].filter(Boolean)

  return (
    // Antes esta pantalla era un <main> suelto, sin el armazón de la app: en
    // móvil desaparecía la barra inferior y la única salida era «← Recetas».
    <AppShell contentClassName="recipe-detail" current="recetas">
      <Link className="recipe-back" href="/recetas">
        <span aria-hidden="true">←</span> Recetas
      </Link>
      <header className="recipe-detail__header">
        <h1>{recipe.title}</h1>
        {recipe.status === 'pending' ? (
          <p className="recipe-pending">
            Receta por revisar. Completa los datos antes de planificar con ella.
          </p>
        ) : null}
        {meta.length ? (
          <p className="recipe-detail__meta">{meta.join(' · ')}</p>
        ) : null}
        {recipe.sourceUrl ? (
          <p className="recipe-source">
            Origen:{' '}
            <a href={recipe.sourceUrl} rel="noreferrer" target="_blank">
              {recipe.sourceUrl}
              {/* Avisar de que se abre fuera: abrir una pestaña nueva sin
                  anunciarlo desorienta, sobre todo con lector de pantalla. */}
              <span className="sr-only"> (se abre en una ventana nueva)</span>
            </a>
          </p>
        ) : null}
        {recipe.recipeCategories.length ? (
          <p className="recipe-detail__categories">
            {recipe.recipeCategories.map((category) => (
              <span
                className="recipe-chip"
                key={`${category.dimension}-${category.name}`}
              >
                {category.name}
              </span>
            ))}
          </p>
        ) : null}
      </header>

      <RecipePreferences recipeId={recipe.id} initial={recipe.preference} />

      <section aria-labelledby="detail-ingredients">
        <h2 id="detail-ingredients">Ingredientes</h2>
        {recipe.ingredients.length ? (
          <ul className="recipe-detail__ingredients">
            {recipe.ingredients.map((ingredient) => {
              const availability = ingredientAvailability(
                ingredient.name,
                pantryAvailability,
                catalog,
              )
              return (
                <li className="recipe-detail__ingredient" key={ingredient.position}>
                  <span
                    aria-hidden="true"
                    className={`recipe-ingredient-dot recipe-ingredient-dot--${availability}`}
                  />
                  <span className="recipe-detail__ingredient-text">
                    {formatIngredient(ingredient)}
                  </span>
                  <span className="recipe-ingredient-owned">
                    {AVAILABILITY_LABEL[availability]}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="recipes-empty">Aún no hay ingredientes.</p>
        )}
      </section>

      <section aria-labelledby="detail-steps">
        <h2 id="detail-steps">Pasos</h2>
        {recipe.steps.length ? (
          <ol className="recipe-detail__steps">
            {recipe.steps.map((step) => (
              <li key={step.position}>{step.instruction}</li>
            ))}
          </ol>
        ) : (
          <p className="recipes-empty">Aún no hay pasos.</p>
        )}
      </section>

      {/* ponytail: «Añadir al plan» es la integración con Plan (Fase 5); aquí solo editar. */}
      <Link
        className="recipe-detail__edit"
        href={`/recetas/${recipe.id}/editar`}
      >
        {recipe.status === 'pending' ? 'Revisar receta' : 'Editar'}
      </Link>
    </AppShell>
  )
}
