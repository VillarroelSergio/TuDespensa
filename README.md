# MiDespensa

Monolito modular web para el MVP doméstico de MiDespensa. Esta fase contiene el scaffold de Next.js y la capa de datos del onboarding; las pantallas funcionales se implementarán después.

## Requisitos

- Node.js 24 o posterior
- npm 11 o posterior
- Docker Desktop
- Supabase CLI (puede ejecutarse mediante `npx supabase`)

## Arranque local

1. Instala las dependencias:

   ```bash
   npm ci
   ```

2. Copia `.env.example` a `.env.local` y completa únicamente valores del entorno local.
3. Inicia y reconstruye Supabase desde las migraciones:

   ```bash
   npx supabase start
   npx supabase db reset
   ```

4. Obtén las URL y claves locales con `npx supabase status` y arranca Next.js:

   ```bash
   npm run dev
   ```

La aplicación queda disponible en `http://localhost:3000`. No guardes claves reales en el repositorio.

## Verificación

```bash
npm run lint
npx tsc --noEmit
npm test
npm run test:coverage
npm run test:e2e
```

La prueba E2E requiere Supabase local y valida el navegador contra el flujo real
de Auth, onboarding, RLS y Realtime. Consulta [e2e/README.md](e2e/README.md)
para la preparación, ejecución visible y artefactos de diagnóstico.

Con Supabase local iniciado, ejecuta la integración SQL después de `db reset`:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/mvp_onboarding_security.sql
```

El script SQL usa datos sintéticos, termina con `ROLLBACK` y no conserva usuarios ni filas de prueba.
