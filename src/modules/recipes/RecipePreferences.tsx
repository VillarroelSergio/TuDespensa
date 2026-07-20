'use client'

import { useState } from 'react'

import { setPreference } from './actions'
import type { RecipePreference } from './types'

export function RecipePreferences({ recipeId, initial }: { recipeId: string; initial: RecipePreference }) {
  const [preference, setPreferenceState] = useState(initial)
  const [pending, setPending] = useState(false)

  async function persist(next: RecipePreference) {
    const previous = preference
    setPreferenceState(next); setPending(true)
    try { await setPreference({ recipeId, isFavorite: next.isFavorite, rating: next.rating }) }
    catch { setPreferenceState(previous) }
    finally { setPending(false) }
  }

  return <div className="recipe-preferences">
    <button type="button" className={`recipe-favorite${preference.isFavorite ? ' is-active' : ''}`} aria-pressed={preference.isFavorite} disabled={pending}
      onClick={() => persist({ ...preference, isFavorite: !preference.isFavorite })}>
      {preference.isFavorite ? '★ Favorita' : '☆ Marcar favorita'}
    </button>
    <div className="recipe-rating" role="group" aria-label="Tu puntuación">
      {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" disabled={pending}
        className={`recipe-star${preference.rating && value <= preference.rating ? ' is-active' : ''}`}
        aria-label={`${value} de 5`} aria-pressed={preference.rating === value}
        onClick={() => persist({ ...preference, rating: preference.rating === value ? null : value })}>★</button>)}
    </div>
  </div>
}
