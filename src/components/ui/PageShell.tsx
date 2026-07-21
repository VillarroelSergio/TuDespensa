export function PageShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main>
      <section className="page-card" aria-labelledby="page-title">
        {children}
      </section>
    </main>
  )
}
