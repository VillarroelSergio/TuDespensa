import { AppShell } from '@/components/ui/AppShell'
import { getHouseholdManagement } from '@/modules/household/actions'
import { HouseholdManager } from '@/modules/household/HouseholdManager'

export default async function HouseholdPage() {
  const data = await getHouseholdManagement()
  return (
    <AppShell current="hogar" contentClassName="household-page">
      {data ? (
        <HouseholdManager data={data} />
      ) : (
        <section className="household-manager">
          <h1>Hogar</h1>
          <p>No hemos podido cargar tu hogar. Inténtalo de nuevo.</p>
        </section>
      )}
    </AppShell>
  )
}
