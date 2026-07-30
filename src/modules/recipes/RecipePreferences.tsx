'use client'

import { useState } from 'react'

import { setPreference } from './actions'
import type { RecipePreference } from './types'

export function RecipePreferences({
  recipeId,
  initial,
}: {
  recipeId: string
  initial: RecipePreference
}) {
  const [preference, setPreferenceState] = useState(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function persist(next: RecipePreference) {
    const previous = preference
    setPreferenceState(next)
    setPending(true)
    setError('')
    try {
      await setPreference({
        recipeId,
        isFavorite: next.isFavorite,
        rating: next.rating,
      })
    } catch {
      // Antes solo revertía en silencio: la estrella volvía a su sitio y no
      // había manera de saber que el guardado había fallado.
      setPreferenceState(previous)
      setError('No hemos podido guardar tu valoración. Inténtalo de nuevo.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="recipe-preferences">
      <button
        type="button"
        className={`recipe-favorite${preference.isFavorite ? ' is-active' : ''}`}
        aria-pressed={preference.isFavorite}
        disabled={pending}
        onClick={() =>
          persist({ ...preference, isFavorite: !preference.isFavorite })
        }
      >
        <span aria-hidden="true">{preference.isFavorite ? '★' : '☆'} </span>
        {preference.isFavorite ? 'Favorita' : 'Marcar favorita'}
      </button>
      <div className="recipe-rating" role="group" aria-label="Tu puntuación">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            className={`recipe-star${preference.rating && value <= preference.rating ? ' is-active' : ''}`}
            aria-label={`Puntuar con ${value} de 5`}
            aria-pressed={preference.rating === value}
            onClick={() =>
              persist({
                ...preference,
                rating: preference.rating === value ? null : value,
              })
            }
          >
            <span aria-hidden="true">★</span>
          </button>
        ))}
      </div>
      {error ? (
        <p className="recipe-editor__status" role="status">
          {error}
        </p>
      ) : null}
    </div>
  )
}
