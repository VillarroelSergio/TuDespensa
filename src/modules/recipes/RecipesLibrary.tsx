'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

import { createRecipe } from './actions'
import { RecipesList, type NewRecipe } from './RecipesList'
import type { Recipe } from './types'

export function RecipesLibrary({ initialRecipes }: { initialRecipes: Recipe[] }) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const refresh = useCallback(() => router.refresh(), [router])

  useEffect(() => {
    const client = createSupabaseBrowserClient()
    const channel = client.channel('recipes-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, refresh)
      .subscribe((state) => { if (state === 'SUBSCRIBED') refresh() })
    return () => { void client.removeChannel(channel) }
  }, [refresh])

  async function handleAdd(recipe: NewRecipe) {
    if (pending) return
    setPending(true); setStatus('')
    try { await createRecipe(recipe); setStatus(`${recipe.title}: guardada en tu biblioteca.`); refresh() }
    catch { setStatus('No hemos podido guardar la receta. Puedes reintentarlo.') }
    finally { setPending(false) }
  }

  return <RecipesList initialRecipes={initialRecipes} pending={pending} status={status} onAdd={handleAdd} />
}
