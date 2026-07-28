export type HouseholdBackup = {
  format: 'midespensa-backup'
  version: 1
  generatedAt: string
  household: { name: string }
  counts: { recipes: number; shoppingItems: number; pantryItems: number }
  data: Record<string, unknown>
}

export function backupFileName(householdName: string, generatedAt: string): string {
  const date = generatedAt.slice(0, 10)
  const safeName = householdName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  return `midespensa-${safeName || 'hogar'}-${date}.json`
}

export function downloadBackup(backup: HouseholdBackup): void {
  const file = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = backupFileName(backup.household.name, backup.generatedAt)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function parseBackup(value: unknown): HouseholdBackup | null {
  if (!value || typeof value !== 'object') return null
  const backup = value as Partial<HouseholdBackup>
  if (
    backup.format !== 'midespensa-backup' ||
    backup.version !== 1 ||
    !backup.generatedAt ||
    !backup.household ||
    typeof backup.household.name !== 'string' ||
    !backup.counts ||
    !backup.data ||
    typeof backup.data !== 'object'
  ) {
    return null
  }
  return backup as HouseholdBackup
}
