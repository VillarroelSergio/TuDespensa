import { getCookPreview } from '@/modules/plan/actions'
import { CookReview } from '@/modules/plan/CookReview'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function CookPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; servicio?: string }>
}) {
  const { fecha, servicio } = await searchParams
  const valid =
    fecha && ISO_DATE.test(fecha) && (servicio === 'lunch' || servicio === 'dinner')
  const preview = valid ? await getCookPreview(fecha, servicio) : null

  if (!preview) {
    return (
      <main className="shopping-page">
        <section className="shopping-content">
          <a className="shopping-back" href="/plan">
            ← Volver al plan
          </a>
          <p className="shopping-empty">
            No hay ninguna comida que cocinar aquí. <a href="/plan">Volver al plan</a>.
          </p>
        </section>
      </main>
    )
  }

  return <CookReview preview={preview} />
}
