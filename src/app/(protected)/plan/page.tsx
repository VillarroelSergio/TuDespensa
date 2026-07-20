import { getWeekMeals } from '@/modules/plan/actions'
import { weekStart } from '@/modules/plan/presentation'
import { WeekView } from '@/modules/plan/WeekView'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>
}) {
  const { semana } = await searchParams
  // ponytail: «hoy» en UTC. Solo diverge del día local en la franja nocturna que
  // cruza medianoche; leer la zona del navegador exigiría render en cliente.
  const currentWeekIso = weekStart(new Date().toISOString().slice(0, 10))
  // La semana actual se abre por defecto; `?semana=` navega a otra. Un valor
  // inválido no rompe la vista: vuelve a la semana actual.
  const startIso =
    semana && ISO_DATE.test(semana) ? weekStart(semana) : currentWeekIso
  const meals = await getWeekMeals(startIso)

  return (
    <WeekView
      startIso={startIso}
      currentWeekIso={currentWeekIso}
      meals={meals}
    />
  )
}
