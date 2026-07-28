'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { BrandLockup } from '@/components/ui/BrandLockup'
import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { SearchAddCombobox } from '@/components/ui/SearchAddCombobox'
import { SignOutButton } from '@/components/ui/SignOutButton'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  addPantryFood,
  confirmBaseline,
  createHousehold,
  getOnboardingSnapshot,
  removePantryFood,
  setReturnTarget,
  setZoneState,
} from '@/modules/onboarding/actions'
import { addFood, stepForProgress } from '@/modules/onboarding/machine'
import type { OnboardingZone } from '@/modules/onboarding/types'

const zones = [
  {
    id: 'fridge' as const,
    title: 'Frigorífico',
    next: 'Seguir con el congelador',
    suggestions: ['Leche', 'Yogur', 'Huevos', 'Tomate', 'Queso', 'Jamón'],
  },
  {
    id: 'freezer' as const,
    title: 'Congelador',
    next: 'Seguir con la despensa',
    suggestions: ['Verduras', 'Pescado', 'Pollo', 'Pan', 'Caldo', 'Fruta'],
  },
  {
    id: 'pantry' as const,
    title: 'Despensa',
    next: 'Revisar lo que tengo',
    suggestions: [
      'Arroz',
      'Pasta',
      'Lentejas',
      'Aceite',
      'Conservas',
      'Harina',
    ],
  },
]
type Food = { name: string; itemId?: string; version?: number }
const emptyItems: Record<OnboardingZone, Food[]> = {
  fridge: [],
  freezer: [],
  pantry: [],
}

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isVisualFixture =
    process.env.NODE_ENV === 'development' &&
    searchParams.get('fixture') === 'empty'
  const [step, setStep] = useState(1)
  const [name, setName] = useState('Mi hogar')
  const [people, setPeople] = useState<string[]>([])
  const [person, setPerson] = useState('')
  const [items, setItems] = useState(emptyItems)
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const [editing, setEditing] = useState(false)
  const h1 = useRef<HTMLHeadingElement>(null)
  const activeZone = zones[Math.min(Math.max(step - 2, 0), 2)]!

  const refresh = useCallback(async () => {
    try {
      const snapshot = await getOnboardingSnapshot()
      if (!snapshot.household || !snapshot.progress) return
      setName(snapshot.household.name)
      setItems(snapshot.items)
      const nextPendingZone = snapshot.progress.returnTarget
        ? snapshot.progress.activeZone
        : (zones.find((zone) => !snapshot.zones[zone.id].startsWith('reviewed'))
            ?.id ?? snapshot.progress.activeZone)
      setStep(
        stepForProgress(
          nextPendingZone,
          snapshot.progress.globalState,
          snapshot.progress.returnTarget,
        ),
      )
      setEditing(snapshot.progress.returnTarget === 'review')
      setStatus('Guardado')
    } catch {
      setStatus(
        'Guardado en este dispositivo. Pendiente de sincronizar · Reintentar',
      )
    }
  }, [])

  useEffect(() => {
    h1.current?.focus()
    if (isVisualFixture) return
    const initialLoad = setTimeout(() => void refresh(), 0)
    const client = createSupabaseBrowserClient()
    const channel = client
      .channel('onboarding-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pantry_items' },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'onboarding_progress' },
        () => void refresh(),
      )
      // Resync on every (re)join: events emitted while disconnected are not replayed.
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') void refresh()
      })
    return () => {
      clearTimeout(initialLoad)
      void client.removeChannel(channel)
    }
  }, [isVisualFixture, refresh])

  useEffect(() => {
    localStorage.setItem(
      'midespensa-onboarding-draft',
      JSON.stringify({ step, name, people }),
    )
  }, [step, name, people])

  async function begin() {
    setPending(true)
    try {
      await createHousehold({ name, people })
      await refresh()
    } catch {
      setStatus('No hemos podido crear el hogar. Tus datos siguen aquí.')
    } finally {
      setPending(false)
    }
  }
  async function add(zone: OnboardingZone, food: string) {
    if (
      addFood(
        items[zone].map((item) => item.name),
        food,
      ).duplicate
    ) {
      setStatus(`${food} ya estaba añadido`)
      return
    }
    try {
      const result = (await addPantryFood(zone, food)) as {
        duplicate?: boolean
        item_id?: string
        version?: number
      }
      if (result.duplicate) setStatus(`${food} ya estaba añadido`)
      else
        setItems((current) => ({
          ...current,
          [zone]: [
            ...current[zone],
            { name: food, itemId: result.item_id, version: result.version },
          ],
        }))
    } catch {
      setStatus('No hemos podido guardar el alimento. Tus datos siguen aquí.')
    }
  }
  async function remove(zone: OnboardingZone, food: Food) {
    if (!food.itemId || food.version === undefined) {
      await refresh()
      setStatus(
        'El alimento ha cambiado en otro dispositivo. Hemos actualizado la lista.',
      )
      return
    }
    setPending(true)
    try {
      await removePantryFood(food.itemId, food.version)
      setItems((current) => ({
        ...current,
        [zone]: current[zone].filter((item) => item.itemId !== food.itemId),
      }))
      setStatus(`${food.name} eliminado.`)
    } catch {
      await refresh()
      setStatus(
        'El alimento ha cambiado en otro dispositivo. Hemos actualizado la lista.',
      )
    } finally {
      setPending(false)
    }
  }
  async function advance(empty = false) {
    if (!empty && items[activeZone.id].length === 0) return
    setPending(true)
    try {
      // A zone without foods never goes through `onboarding_add_pantry_item`,
      // which normally moves it to `in_progress`. Make that transition here
      // before marking it reviewed so the database state machine remains valid.
      if (empty) await setZoneState(activeZone.id, 'in_progress')
      await setZoneState(
        activeZone.id,
        empty ? 'reviewed_empty' : 'reviewed_nonempty',
      )
      if (editing) {
        await setReturnTarget(null)
        setEditing(false)
        setStep(5)
      } else setStep(step === 4 ? 5 : step + 1)
    } catch {
      setStatus('No hemos podido guardar el cambio. Tus datos siguen aquí.')
    } finally {
      setPending(false)
    }
  }
  async function finish() {
    setPending(true)
    try {
      await confirmBaseline()
      localStorage.removeItem('midespensa-onboarding-draft')
      router.replace('/despensa')
      router.refresh()
    } catch {
      setStatus('No se puede confirmar hasta sincronizar los cambios.')
    } finally {
      setPending(false)
    }
  }
  async function edit(index: number) {
    await setReturnTarget('review')
    setEditing(true)
    setStep(index + 2)
  }

  if (step === 1)
    return (
      <main className="onboarding">
        <section className="onboarding-card">
          <BrandLockup className="brand brand--welcome" href="/" />
          <h1 ref={h1} tabIndex={-1}>
            Organiza la comida de casa
          </h1>
          <p>Ten a mano lo que tienes, tus recetas y el plan de la semana.</p>
          <label>
            Nombre del hogar
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p className="label">Personas del hogar</p>
          <div className="member">Tú</div>
          {people.map((value, index) => (
            <div className="member" key={value}>
              {value}
              <button
                onClick={() => setPeople(people.filter((_, i) => i !== index))}
              >
                Quitar a {value} del hogar
              </button>
            </div>
          ))}
          <input
            aria-label="Nombre o apodo"
            value={person}
            onChange={(event) => setPerson(event.target.value)}
            placeholder="Nombre o apodo"
          />
          <button
            className="secondary-button"
            onClick={() => {
              if (person.trim()) {
                setPeople([...people, person.trim()])
                setPerson('')
              }
            }}
          >
            Añadir otra persona
          </button>
          <footer>
            <PrimaryButton onClick={begin} disabled={pending}>
              Preparar mi despensa
            </PrimaryButton>
          </footer>
          <p aria-live="polite">{status}</p>
        </section>
      </main>
    )
  if (step >= 2 && step <= 4)
    return (
      <main className="onboarding">
        <section className="onboarding-card">
          <button
            className="text-action"
            onClick={() => setStep(editing ? 5 : step - 1)}
          >
            Volver
          </button>
          <p className="eyebrow">Inventario: {step - 1} de 3</p>
          <div className="progress">
            <i style={{ width: `${((step - 1) / 3) * 100}%` }} />
          </div>
          <p aria-live="polite" className="save-status">
            {status}
          </p>
          <h1 ref={h1} tabIndex={-1}>
            {activeZone.title}
          </h1>
          <p>
            Indica qué tienes. No necesitas añadir cantidades ni caducidades.
          </p>
          <SearchAddCombobox
            zoneLabel={activeZone.title.toLowerCase()}
            suggestions={activeZone.suggestions}
            onAdd={(food) => add(activeZone.id, food)}
          />
          <h2>Añadidos ({items[activeZone.id].length})</h2>
          {items[activeZone.id].map((food) => (
            <div className="inventory-row" key={food.itemId ?? food.name}>
              • {food.name}
              <button onClick={() => void remove(activeZone.id, food)}>
                Quitar {food.name} del {activeZone.title.toLowerCase()}
              </button>
            </div>
          ))}
          <footer>
            {items[activeZone.id].length === 0 ? (
              <button
                className="text-action"
                onClick={() => void advance(true)}
              >
                Mi {activeZone.title.toLowerCase()} está vacío
              </button>
            ) : null}
            <PrimaryButton
              disabledReason={
                items[activeZone.id].length
                  ? undefined
                  : `Añade al menos un alimento o marca el ${activeZone.title.toLowerCase()} como vacío.`
              }
              onClick={() => void advance()}
              disabled={pending}
            >
              {editing ? 'Volver a la revisión' : activeZone.next}
            </PrimaryButton>
          </footer>
        </section>
      </main>
    )
  if (step === 5)
    return (
      <main className="onboarding">
        <section className="onboarding-card">
          <p className="eyebrow">Revisión</p>
          <h1 ref={h1} tabIndex={-1}>
            Revisa tu despensa
          </h1>
          <p>Puedes corregir cualquier zona antes de terminar.</p>
          {zones.map((zone, index) => (
            <div className="summary" key={zone.id}>
              <strong>
                {zone.title} ·{' '}
                {items[zone.id].length
                  ? `${items[zone.id].length} alim.`
                  : 'Vacía'}
              </strong>
              <span>
                {items[zone.id]
                  .slice(0, 3)
                  .map((food) => food.name)
                  .join(', ')}
              </span>
              <button className="text-action" onClick={() => void edit(index)}>
                Editar {zone.title.toLowerCase()}
              </button>
            </div>
          ))}
          <p className="center">Podrás cambiar estos alimentos después.</p>
          <footer>
            <PrimaryButton onClick={finish} disabled={pending}>
              Confirmar despensa
            </PrimaryButton>
          </footer>
          <p aria-live="polite">{status}</p>
        </section>
      </main>
    )
  const count = Object.values(items).flat().length
  return (
    <main className="onboarding">
      <section className="onboarding-card success">
        <div className="check">✓</div>
        <h1 ref={h1} tabIndex={-1}>
          Tu despensa está lista
        </h1>
        <p>
          {count
            ? `Hemos guardado ${count} alimentos.`
            : 'Hemos guardado tu línea base vacía.'}
        </p>
        <footer>
          <Link className="primary-button" href="/recetas">
            Añadir mi primera receta
          </Link>
          <Link className="secondary-button" href="/plan">
            Ir al plan
          </Link>
        </footer>
      </section>
    </main>
  )
}

export default function OnboardingPage() {
  return (
    <>
      <SignOutButton className="onboarding-sign-out" />
      <Suspense fallback={null}>
        <OnboardingContent />
      </Suspense>
    </>
  )
}
