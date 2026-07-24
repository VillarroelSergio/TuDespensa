import Link from 'next/link'

import {
  dishTypeLabel,
  formatIngredient,
  isIngredientInPantry,
  timeLabel,
} from './presentation'
import { RecipePreferences } from './RecipePreferences'
import type { RecipeDetail } from './types'

export function RecipeDetailView({
  recipe,
  pantryItemNames,
}: {
  recipe: RecipeDetail
  pantryItemNames: string[]
}) {
  const meta = [
    recipe.servings ? `${recipe.servings} raciones` : null,
    timeLabel(recipe.totalMinutes),
    dishTypeLabel(recipe.dishType),
  ].filter(Boolean)

  return (
    <main className="recipe-detail">
      <Link className="recipe-back" href="/recetas">
        ← Recetas
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
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient.position}>
                {formatIngredient(ingredient)}
                {isIngredientInPantry(ingredient.name, pantryItemNames) ? (
                  <span className="recipe-ingredient-owned">
                    Ya tienes esto
                  </span>
                ) : null}
              </li>
            ))}
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
    </main>
  )
}
