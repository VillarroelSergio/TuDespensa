# MiDespensa

Monolito modular web para el MVP doméstico de MiDespensa.

## Requisitos

- Node.js 24 o posterior
- npm 11 o posterior
- Docker Desktop
- Supabase CLI (puede ejecutarse mediante `npx supabase`)

## Desarrollo local continuo

1. Instala las dependencias:

   ```bash
   npm ci
   ```

2. Copia `.env.example` a `.env.local` y completa únicamente los valores del entorno local.

3. Inicia los servicios locales una sola vez:

   ```bash
   npm run dev:services
   ```

   Docker queda en marcha entre sesiones. No hay que borrar ni recrear los contenedores para cada cambio de interfaz.

4. La primera vez, o cuando quieras volver al estado de datos conocido, resetea solo datos y migraciones:

   ```bash
   npm run dev:reset
   ```

5. Para revisar y modificar flujos reales, deja la web levantada con:

   ```bash
   npm run dev:auth
   ```

   Abre `http://localhost:3000/login` y escribe `admin`. La cuenta local `admin/admin` tiene un hogar y una despensa sintéticos, persiste mientras no ejecutes `dev:reset` y usa Auth, RLS y RPC reales. No existe fuera de desarrollo.

Para inspección exclusivamente visual sin persistencia, usa `npm run dev:demo`. Para apagar Docker al terminar, usa `npm run dev:stop`.

## Pruebas desde el móvil

Con el móvil y el ordenador en la misma red Wi-Fi, detén antes el servidor de
Next con `Ctrl+C` y ejecuta:

```bash
npm run dev:demo:mobile
```

Abre en el móvil `http://IP-DEL-ORDENADOR:3000`. Este modo es para revisar la
interfaz: no usa sesión ni persiste acciones. Si Windows pregunta, permite el
acceso de Node.js en redes privadas; no abras el puerto para redes públicas.

Para probar el flujo real con `admin`, inicia `npm run dev:auth:mobile` y cambia
temporalmente `NEXT_PUBLIC_SUPABASE_URL` en `.env.local` de `127.0.0.1` a la
misma IP local del ordenador (puerto `54321`); después reinicia Next. Supabase
local y sus claves son solo de desarrollo: nunca expongas esos puertos fuera de
tu Wi-Fi privado.

## Verificación

```bash
npm run lint
npx tsc --noEmit
npm test
npm run test:coverage
npm run test:e2e
```

La prueba E2E requiere Supabase local y valida el navegador contra el flujo real de Auth, onboarding, RLS y Realtime. Consulta [e2e/README.md](e2e/README.md) para la preparación, ejecución visible y artefactos de diagnóstico.

Con Supabase local iniciado, ejecuta la integración SQL después de `db reset`:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/mvp_onboarding_security.sql
```

El script SQL usa datos sintéticos, termina con `ROLLBACK` y no conserva usuarios ni filas de prueba.
