# Tarea Fase B — Vertical slice de Onboarding: auth + UI O1–O6 + Realtime

Eres el implementador. Fable 5 planifica y revisará. La Fase A (scaffold + esquema, commit `de15ed1`) ya está entregada: apóyate en ella, no la rehagas.

## Contexto obligatorio (leer antes de escribir código)

- `AGENTS.md`
- `.agents/handoff/FIGMA-ONBOARDING-CONTEXT.md` — dossier de diseño extraído de Figma (nodos, tokens, composición). Es la fuente visual; NO inventes otra estética.
- `docs/03-UX/ONBOARDING-SCREEN-SPEC.md` — contrato completo de comportamiento (estados, navegación, mensajes, accesibilidad, responsive). VINCULANTE.
- `docs/03-UX/ONBOARDING-WIREFLOW.md`
- `docs/05-Architecture/TECHNICAL-ARCHITECTURE.md` (§5 acceso y seguridad, §6 concurrencia)
- Código existente: `src/lib/**`, `src/modules/**`, `src/types/database.ts`, migración `supabase/migrations/20260719103248_mvp_onboarding_vertical_slice.sql` (las RPCs ya existen: úsalas, no dupliques lógica en TS).

## Reglas de repo/git

- Rama `feature/mvp-init`. Commits pequeños. NO push, NO PR.
- NO tocar ni commitear `AGENTS.md`, `docs/**`, `"# MiDespensa — inicialización del MVP.md"`.
- Sin secretos ni correos reales. Datos sintéticos en tests.
- Si `.git` vuelve a estar bloqueado para ti, deja los cambios en el árbol de trabajo y repórtalo; Fable 5 commiteará.

## Alcance

### 1. Autenticación cerrada
- Ruta `(auth)/login`: acceso por magic link u OTP por correo (`signInWithOtp`), sin alta pública visible; mensaje claro de aplicación privada.
- `middleware.ts`: rutas protegidas; sin sesión → `/login`; con sesión → redirección según estado de onboarding (RPC/consulta `onboarding_progress`): sin hogar → `/onboarding`, en curso → paso activo, `completed` → `/plan`.
- Callback de auth (`/auth/callback` o equivalente `@supabase/ssr`).

### 2. Onboarding O1–O6 en `src/app/onboarding/`
Implementar las seis pantallas según el dossier Figma + spec:
- O1 configurar hogar (nombre + personas; crea hogar vía `create_household_with_onboarding`, idempotente, doble clic no duplica).
- O2 frigorífico, O3 congelador, O4 despensa: mismo patrón parametrizado (NO tres componentes clonados): combobox añadir alimento (Enter añade, foco persistente, alta personalizada «Añadir "{texto}"», duplicado anunciado sin mover foco), chips de sugerencias, lista de añadidos con Quitar + toast Deshacer, acción "está vacío" solo con cero alimentos, CTA con `aria-disabled` explicado.
- O5 revisión: resúmenes por zona, Editar zona (modo edición con `return_target=review`), confirmación remota idempotente (`confirm_baseline`).
- O6 final: variante con n alimentos y con cero; CTA receta (ruta preparada) y secundaria Plan.
- Estado global/zona persistido en servidor (RPCs) + borrador local (localStorage) para reanudación y offline honesto (banner "Guardado en este dispositivo…", bloquear confirmación hasta sincronizar). Mensajería exacta de la spec §13.
- Guardado automático, reanudación exacta (UX-ONB-001/007), enlaces directos redirigen según estado.
- Realtime: suscripción a `pantry_items`/`onboarding_progress` como aviso → invalidar y re-consultar (no fuente de verdad).
- Accesibilidad spec §17: un H1 con foco al entrar, orden DOM, teclado completo, combobox ARIA, live regions, foco visible 2px, objetivos 44px, `prefers-reduced-motion`.
- Movimiento funcional spec §16 (transiciones ≤200ms, nada ornamental).

### 3. Módulos y arquitectura
- Casos de uso en `src/modules/{household,onboarding,pantry}/` (Server Actions que validan entrada+sesión y llaman a las RPCs; errores tipados con `AppError`).
- Componentes UI de spec §15 en `src/components/ui/` sin reglas de negocio.
- CSS: seguir el enfoque ya presente en `src/app/styles.css` (sin añadir Tailwind ni librerías UI nuevas).

### 4. Rutas preparadas sin simular
`src/app/(protected)/despensa|compra|recetas|plan`: página con título y estado honesto de disponibilidad limitada («Disponible próximamente» + una frase de qué será), enlazadas desde una navegación mínima post-onboarding. Nada que aparente funcionar.

### 5. Pruebas
- Unitarias (Vitest + Testing Library): reducer/máquina de estados del onboarding (transiciones de zona, deshacer, duplicados), validaciones y componentes clave (combobox: añadir/duplicado/foco; CTA aria-disabled).
- Mock de Supabase en unit tests; no llamar a red.
- E2E con dos sesiones (Playwright): escribir el spec (`e2e/onboarding-two-sessions.spec.ts`) que cubra login OTP (con `supabase auth` local o usuarios sintéticos), O1→O6 completo y sincronización entre dos contextos de navegador. Si el entorno local de Supabase no está disponible, deja el spec listo con instrucciones de ejecución y márcalo como bloqueado — no lo declares ejecutado.

## Verificación (ejecutar de verdad y reportar salida)
`npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

## Entrega
Resumen: archivos, decisiones, comandos ejecutados con resultado real, bloqueos, y qué criterios UX-ONB-001…015 quedan cubiertos/pendientes.
