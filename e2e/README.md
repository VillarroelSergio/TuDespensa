# Pruebas E2E

La suite valida el recorrido real de onboarding contra Supabase local: enlace
mágico, cookies y callback de Auth, RLS, Realtime y la persistencia del estado
completado. Cada ejecución crea usuarios sintéticos con un correo `example.test`.
El comando de preparación `db reset` los elimina junto con el resto de datos
locales antes de la siguiente ejecución aislada.

## Preparación local

1. Inicia Supabase y aplica las migraciones:

   ```powershell
   npx supabase start
   npx supabase db reset
   ```

2. Copia las variables mostradas por `npx supabase status -o env` a `.env.local`.
   Deben incluir `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
   `SUPABASE_SERVICE_ROLE_KEY`. No se versionan credenciales.

3. Ejecuta la suite:

   ```powershell
   npm run test:e2e
   ```

Playwright inicia Next.js si no se indica `E2E_BASE_URL`. Para observar las
interacciones en Chromium, usa `npm run test:e2e:headed`; para abrir el informe
de la última ejecución, usa `npm run test:e2e:report`.

Los fallos conservan captura, vídeo y traza en `test-results/`; el informe HTML
se escribe en `playwright-report/`. Ambos directorios están excluidos de Git.
