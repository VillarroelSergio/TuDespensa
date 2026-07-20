'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

import { captureLink, createRecipe, loadSeed } from './actions'
import { RecipesList } from './RecipesList'
import type { Recipe } from './types'

export function RecipesLibrary({
  initialRecipes,
}: {
  initialRecipes: Recipe[]
}) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const refresh = useCallback(() => router.refresh(), [router])

  useEffect(() => {
    const client = createSupabaseBrowserClient()
    const channel = client
      .channel('recipes-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recipes' },
        refresh,
      )
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') refresh()
      })
    return () => {
      void client.removeChannel(channel)
    }
  }, [refresh])

  // Crear/capturar lleva directo al editor R2 para seguir completando la receta.
  async function run(
    action: () => Promise<{ recipe_id: string }>,
    failure: string,
  ) {
    if (pending) return
    setPending(true)
    setStatus('')
    try {
      const result = await action()
      router.push(`/recetas/${result.recipe_id}/editar`)
    } catch {
      setStatus(failure)
      setPending(false)
    }
  }

  async function handleLoadSeed() {
    if (pending) return
    setPending(true)
    setStatus('')
    try {
      const result = await loadSeed()
      setStatus(
        result.loaded > 0
          ? `Añadimos ${result.loaded} recetas base.`
          : 'Ya tenías las recetas base.',
      )
      refresh()
    } catch {
      setStatus('No hemos podido cargar las recetas base.')
    } finally {
      setPending(false)
    }
  }

  return (
    <RecipesList
      initialRecipes={initialRecipes}
      pending={pending}
      status={status}
      onCreateManual={(title) =>
        run(
          () => createRecipe({ title }),
          'No hemos podido crear la receta. Puedes reintentarlo.',
        )
      }
      onCaptureLink={(url) =>
        run(
          () => captureLink(url),
          'No hemos podido guardar el enlace. Revisa que sea válido.',
        )
      }
      onLoadSeed={handleLoadSeed}
    />
  )
}
