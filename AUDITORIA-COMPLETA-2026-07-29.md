# Auditoría completa de MiDespensa — Seguridad y Calidad (QA)

**Fecha:** 29 de julio de 2026
**Rama auditada:** `feature/plan-mobile-recipe-filters`
**Alcance:** todo el proyecto (código de la app en `src/`, scripts, tests E2E, 47 migraciones de base de datos, configuración de Supabase, Next.js y Vercel, dependencias).
**Método:** tres agentes especializados (seguridad, base de datos y calidad de código) + comprobaciones automáticas (vulnerabilidades de dependencias, tipos, linter y suite de tests). **No se ha modificado nada**: este documento es solo diagnóstico.

---

## 0. Estado de aplicación (actualizado el 29/07/2026)

El plan de acción de las cuatro tandas **se ha aplicado**. Resumen:

| Hallazgo | Estado |
|---|---|
| A1 Next.js vulnerable | ✅ Actualizado a 16.2.12; `postcss` subido a 8.5.25 |
| A2 `proxy.ts` sin tests | ✅ Lógica extraída a `src/lib/auth/access-decision.ts` con 31 casos de test |
| A3 Test en rojo | ✅ Causa raíz: faltaba la limpieza del DOM entre tests; corregido en `src/test/setup.ts` |
| M1 Cabeceras de seguridad | ✅ CSP, HSTS, `nosniff`, `frame-ancestors`, `Referrer-Policy` y `Permissions-Policy` en `next.config.ts` |
| M2 Registro abierto | ✅ La primera cuenta exige `PILOT_BOOTSTRAP_CODE`, con comparación en tiempo constante y fallo cerrado |
| M3 `enable_signup` | ✅ Alta pública de GoTrue desactivada; contraseña mínima 6 → 8 |
| M4 `recipes_seed_one` | ✅ `revoke all ... from public` en migración `20260729140000` |
| M5 Idempotencia | ⚠️ **Parcial**: reordenado `recipes_save_recipe`; `plan_cook_meal` y `shopping_confirm_purchase` pendientes (ver nota abajo) |
| M6 Errores duplicados | ✅ Tabla única en `src/lib/supabase/rpc.ts`, con test; los 6 módulos la usan |
| M7 `Error` plano | ✅ Las validaciones lanzan `AppError('INVALID_INPUT')` |
| M8 Realtime en Plan | ✅ `WeekView` monta `RealtimeRefresh` |
| M9 `HouseholdManager` | ✅ Migrado al hook común |
| M10 Script Windows | ⏭️ No aplicado (mejora de comodidad local, sin impacto en la app) |
| B2 Tablas `poc_*` | ✅ Migración `20260729150000` las elimina |
| B3 Umbral difuso | ✅ `resolve_catalog_food` subido de 0.4 a 0.6 |
| B6 `install.ps1` | ✅ Añadido a `.gitignore`; **no se ha borrado** (fichero ajeno, sin versionar) |
| B7 Rol ARIA | ✅ `combobox` → `searchbox` |
| B9 Lint | ✅ `.git-worktrees` excluido desde el script |
| Anti-BOM en CI | ✅ Paso nuevo en `.github/workflows/ci.yml` |
| B1, B4, B5, B8, B10 | ⏭️ No aplicados: inexplotables o sin impacto con el diseño de hogar único |

**Dos salvedades importantes:**

1. **M5 quedó a medias a propósito.** `plan_cook_meal` y `shopping_confirm_purchase` validan y mutan el inventario dentro del mismo bucle, así que reordenarlas exige partirlas en dos pasadas. Es un cambio con riesgo real de descuadrar el inventario y no puede validarse sin ejecutar los E2E, así que se deja documentado en vez de aplicarse a ciegas.
2. **Las migraciones nuevas no se han podido probar contra una base de datos.** Windows ha pasado a reservar el rango de puertos **57279-57378**, que incluye los dos que usa Supabase local (57321 y 57322) — justo el escenario que anticipaba el comentario de `supabase/config.toml`. Arreglarlo pasa por remapear esos puertos, pero eso rompería tu `.env.test.local`, que no está versionado. **Antes de desplegar, hay que remapear los puertos y ejecutar `npx supabase db reset`.** Sí se ha verificado que las dos migraciones no llevan BOM y tienen los delimitadores `$$` equilibrados.

Verificación que sí pasa: `npm run lint` limpio, `tsc --noEmit` sin errores, **232 tests en verde** (eran 190, con 1 fallando) y `npm run build` correcto.

---

## 1. Resumen ejecutivo (en lenguaje llano)

La aplicación está **notablemente bien construida** para ser un piloto: no hay contraseñas ni claves escritas en el código, los datos de cada hogar están aislados a nivel de base de datos, las acciones peligrosas están bien protegidas y el diseño de los códigos de invitación es sólido. No se ha encontrado **ningún hallazgo crítico** (nada que permita hoy a un extraño ver o tocar vuestros datos).

Aun así, hay **3 asuntos de prioridad alta** que conviene resolver antes de seguir añadiendo funciones:

1. **Actualizar Next.js de 16.2.10 a 16.2.12.** La versión actual tiene fallos de seguridad publicados, incluido uno que podría permitir saltarse el "portero" que protege las páginas privadas. Es un cambio pequeño y el más rentable de toda la auditoría.
2. **El "portero" de la app (`src/proxy.ts`) no tiene ningún test.** Toda la protección de las páginas privadas depende de ese archivo, y ni los tests unitarios ni los E2E de la integración continua lo vigilan. Si un cambio futuro lo rompiera, nadie se enteraría automáticamente.
3. **Hay un test fallando ahora mismo** (`PantryWorkspace.test.tsx`), lo que significa que la integración continua está en rojo y deja de servir como red de seguridad mientras no se arregle.

El resto son mejoras de robustez y mantenimiento (cabeceras de seguridad, límite de intentos en el registro, código duplicado que ya ha empezado a divergir, limpieza de restos del prototipo inicial). Todo está detallado y priorizado más abajo.

---

## 2. Comprobaciones automáticas

| Comprobación | Resultado |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ Sin errores |
| Tests unitarios (`vitest run`) | ❌ **1 fallo** / 189 pasan (190 en total, 29 archivos) |
| Linter (`eslint --max-warnings=0`) | ⚠️ Limpio en `src/`, pero el comando falla por una advertencia dentro de `.git-worktrees/` (carpeta que no debería analizarse) |
| Vulnerabilidades (`npm audit`) | ⚠️ **12 de severidad alta** — ninguna en código propio; afectan a `next`/`sharp` (ver hallazgo A1) y a herramientas de desarrollo (eslint y derivados) |
| Cobertura guardada (`coverage/`) | ⚠️ Obsoleta (solo contiene datos de 1 archivo); no es una métrica fiable a día de hoy |

Detalle del test que falla: `src/modules/pantry/PantryWorkspace.test.tsx:90` — `getByRole('button', { name: 'Marcar Tomates como terminado' })` encuentra **dos** botones con ese mismo nombre accesible. Puede ser un test desactualizado o un problema real de accesibilidad (dos botones idénticos para el lector de pantalla); hay que investigar cuál de los dos casos es.

---

## 3. Hallazgos de prioridad ALTA

### A1. Next.js 16.2.10 con vulnerabilidades publicadas, incluida una de salto del proxy
- **Dónde:** `package.json` (`"next": "16.2.10"`)
- **Qué pasa:** existen avisos de seguridad publicados para esta versión: *bypass* de proxy/middleware en App Router (GHSA-6gpp-xcg3-4w24), exposición de endpoints internos de Server Functions (GHSA-955p-x3mx-jcvp) y SSRF en Server Actions (GHSA-89xv-2m56-2m9x), entre otros. Es especialmente grave aquí porque **toda** la protección de rutas privadas de MiDespensa vive en `src/proxy.ts` (las páginas de `(protected)` no re-verifican la sesión por sí mismas).
- **Recomendación:** actualizar a `next@16.2.12` (o posterior) y volver a pasar `npm audit`. Esto también resuelve las vulnerabilidades heredadas de `sharp`. Confirmar de paso si el build usa Turbopack (condición de uno de los avisos).

### A2. La lógica de acceso (`src/proxy.ts`) no tiene tests y los E2E no corren en CI
- **Dónde:** `src/proxy.ts:16-129` y `.github/workflows/ci.yml`
- **Qué pasa:** el archivo decide quién entra a `/despensa`, `/plan`, `/compra`, `/recetas`, `/hogar`, el gate de onboarding y la redirección a `/unirme`, con varias ramas condicionales, y no existe `proxy.test.ts`. La CI solo ejecuta lint + tipos + vitest; los E2E (que sí cubren parte de esto) requieren Supabase local y no se ejecutan automáticamente.
- **Riesgo:** un cambio futuro podría dejar pasar a usuarios sin sesión (o bloquear a los legítimos) sin que ninguna comprobación automática lo detecte.
- **Recomendación:** extraer la lógica de decisión a una función pura (entrada: ruta + estado de sesión/membresía → salida: redirección o paso) y cubrirla con una tabla de casos en vitest, dejando `proxy.ts` como envoltorio fino.

### A3. Suite de tests en rojo
- **Dónde:** `src/modules/pantry/PantryWorkspace.test.tsx:90`
- **Qué pasa:** 1 test falla (dos botones comparten el nombre accesible "Marcar Tomates como terminado"). Mientras esté en rojo, la CI no distingue fallos nuevos de este fallo conocido.
- **Recomendación:** investigar si el duplicado es un bug de accesibilidad real en `PantryWorkspace` (dos botones idénticos anunciados al lector de pantalla) o un test desfasado, y arreglar lo que corresponda cuanto antes.

---

## 4. Hallazgos de prioridad MEDIA

### Seguridad

**M1. Sin cabeceras de seguridad HTTP** — `next.config.ts` no define `headers()` y `vercel.json` solo fija la región. Faltan `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors` y una CSP básica. Son la "segunda línea de defensa" del navegador si algún día se cuela un fallo de inyección. *Recomendación:* añadir `headers()` en `next.config.ts` con HSTS, `nosniff`, `frame-ancestors 'none'` y una CSP que permita solo el propio dominio y el de Supabase.

**M2. Registro de cuentas sin límite de intentos** — `registerAccount` (`src/modules/auth/registration.ts:26-103`) es un endpoint público que crea usuarios con la clave de administrador. Antes de existir el primer hogar no exige código de invitación, y no hay CAPTCHA ni límite por IP en la app. Riesgo: creación masiva de cuentas basura / gasto de cuota. *Recomendación:* exigir siempre código de invitación (la opción más simple para un piloto privado) o añadir límite de tasa/CAPTCHA.

**M3. `enable_signup = true` en `supabase/config.toml`** — si esa configuración se aplica también al proyecto remoto, el endpoint público de registro de Supabase (`/auth/v1/signup`) sigue abierto y **se salta** el flujo con código de invitación. El daño está muy acotado por las defensas en profundidad (la cuenta quedaría "huérfana": no puede crear un segundo hogar por el trigger *singleton*, ni ver datos por RLS), pero genera cuentas basura. *Recomendación:* desactivar el signup público en el proyecto remoto (o verificar en el Dashboard que ya lo está). De paso, subir `minimum_password_length` de 6 a 8 para alinearlo con la validación de la app.

**M4. Función interna `private.recipes_seed_one` sin `revoke` ni validación de pertenencia** — (`supabase/migrations/20260720120000_recipes_preferences.sql` y `20260724085349`). Confía en los parámetros `household_id`/`actor_id` sin comprobar quién la llama, y es de las pocas funciones `private.*` sin `revoke all ... from public`. Hoy **no es explotable** (el esquema `private` no está expuesto por la API), pero es inconsistente con el resto del código y quedaría expuesta si algún día cambia `api.schemas`. *Recomendación:* añadir el `revoke` y validar la membresía dentro de la función.

### Base de datos — concurrencia

**M5. El antipatrón que causó el incidente de los 260M de rollbacks sigue vivo en 3 funciones** — el hotfix `20260728163451` reordenó a `peek → validar versión → claim` en las RPC de despensa/compra, pero `recipes_save_recipe`, `plan_cook_meal` y `shopping_confirm_purchase` siguen reclamando la clave de idempotencia **antes** de validar la versión (el propio hotfix lo documenta como fuera de alcance). Riesgo estructural idéntico al del incidente si esas acciones reciben ráfagas con versión obsoleta. *Recomendación:* aplicar el mismo reordenamiento en las tres, o documentar formalmente la aceptación del riesgo.

### Calidad de código

**M6. Manejo de errores duplicado en 6 módulos y ya divergente** — cada `actions.ts` repite su propia función `failure()`, y el mismo error de base de datos (`23505`, violación de unicidad) ya se clasifica distinto según el módulo: `INVALID_INPUT` en pantry, `CONFLICT` en household, `UNEXPECTED` en los otros cuatro. Además, la observabilidad de conflictos (`logRpcConflict`) solo cubre pantry y shopping. *Recomendación:* extraer `failure()` y el wrapper `rpc<T>()` a un helper compartido con una única tabla de mapeo, testeada.

**M7. Las validaciones de `src/lib/validation/onboarding.ts` lanzan `Error` plano en vez de `AppError('INVALID_INPUT')`** — rompe el contrato de errores tipados que usa el resto de la app; se usa desde los 6 módulos. *Recomendación:* cambiar los `throw new Error(...)` por `AppError`.

**M8. La vista semanal del Plan no se actualiza en tiempo real** — `src/modules/plan/WeekView.tsx` es la única vista principal sin `useRealtimeRefresh` (el propio E2E `founder-realtime.spec.ts:136-139` lo documenta como hallazgo conocido). Con dos personas usando la app, un cambio de plan no aparece en el otro móvil hasta recargar. *Recomendación:* añadir `useRealtimeRefresh` como en `CookReview.tsx`.

**M9. `HouseholdManager.tsx` reimplementa a mano la suscripción realtime** que el hook común `useRealtimeRefresh` ya resuelve (incluido el *debounce* que aquí falta). *Recomendación:* migrar al hook.

**M10. `scripts/capture-visual-context.mjs` puede dejar un `next dev` colgado en Windows** — usa `server.kill()` simple, el problema exacto que `scripts/free-e2e-port.mjs` ya resuelve con `taskkill /T` para los E2E. *Recomendación:* reutilizar esa utilidad existente.

---

## 5. Hallazgos de prioridad BAJA

| # | Hallazgo | Dónde | Nota |
|---|---|---|---|
| B1 | Restauración de backup: los campos `user_id`/`confirmed_by`/`created_by` del JSON no se validan contra los miembros reales del hogar; y el `ON CONFLICT DO UPDATE` no reafirma el `household_id` de la fila existente | `supabase/migrations/20260728113000_household_backup_restore.sql` | Requiere ser ya el propietario; hoy inexplotable entre hogares (hogar único + UUIDs). Endurecer si se evoluciona a multi-hogar |
| B2 | Tablas y RPCs del prototipo (`poc_*`) siguen en el esquema, concedidas a `authenticated`, sin uso en el frontend | `20260719093214_poc_two_session_security.sql` | Superficie innecesaria; eliminar en una migración de limpieza |
| B3 | Umbral de similitud difusa 0.4 sin corregir en `resolve_catalog_food` (el mismo bug ya se subió a 0.6 en `resolve_household_food`) | `20260723130000` vs `20260729130000` | Posibles emparejamientos de alimentos incorrectos desde catálogo |
| B4 | FKs a `auth.users(id)` sin `ON DELETE` (`created_by`, `actor`, `confirmed_by`, …) | varias migraciones | Un borrado manual de usuario desde el Dashboard fallaría por FK; documentar que se use siempre `reset_pilot_household` |
| B5 | Faltan índices con `household_id` como columna líder en tablas hijas (`recipe_ingredients`, `shopping_items`, …) | varias | Impacto nulo hoy (hogar único); higiene de futuro |
| B6 | `install.ps1` en la raíz es el instalador de una herramienta ajena al proyecto (`codebase-memory-mcp`), sin seguimiento en git | `install.ps1` | El script en sí es seguro (verificado); decidir si se borra o se mueve fuera del repo |
| B7 | `SearchAddCombobox` anuncia `role="combobox"` sin cumplir el patrón ARIA completo (sin opciones navegables por flechas) | `src/components/ui/SearchAddCombobox.tsx:6-16` | Cambiar a `role="searchbox"` es lo más barato y correcto |
| B8 | `key={index}` en filas editables de formularios (ingredientes, pasos, líneas de ticket) | `RecipeEditor.tsx:187,262,341`, `TicketImport.tsx:115` | Sin corrupción de datos; solo saltos de foco al borrar filas intermedias |
| B9 | `npm run lint` analiza `.git-worktrees/` y falla por código ajeno al árbol principal | `eslint.config.mjs` | Añadir `.git-worktrees/**` a los ignores |
| B10 | 12 vulnerabilidades altas de `npm audit` en herramientas de desarrollo (eslint y derivados, vía `minimatch`/`brace-expansion`) | `package.json` | No se ejecutan en producción; se resolverán con actualizaciones mayores de eslint cuando toque |

---

## 6. Lo que está bien hecho (verificado, no supuesto)

**Seguridad**
- **Cero secretos en el código**: ni claves, ni tokens, ni credenciales en `src/`, `scripts/`, `e2e/`, `supabase/` ni `docs/`. Solo `.env.example` (plantilla vacía) está versionado; los `.env.local` reales están fuera de git.
- **El bypass de login de desarrollo no puede activarse en producción**: exige `NODE_ENV === 'development'`, que Next fija estáticamente en el build.
- **Uso de la clave maestra (service role) limitado a 3 puntos, todos justificados y con salvaguardas** (registro con fail-closed y compensación, reset del piloto validado por RPC de sesión, `import 'server-only'` que impide que llegue al navegador).
- **Protección contra open redirect** en el login (`returnTo` con lista blanca) y en el callback de auth.
- **Sin `dangerouslySetInnerHTML`, sin `eval`, sin SQL dinámico**: superficie de XSS e inyección prácticamente nula.
- **Códigos de invitación bien diseñados**: ~50 bits de entropía con CSPRNG, solo se guarda el hash, un solo uso, caducidad de 7 días.
- **La imagen del ticket no se almacena** — de hecho el flujo actual es solo de texto pegado; no existe subida de archivos.

**Base de datos**
- **RLS habilitado en el 100% de las tablas de dominio**; cero permisos a `anon`; toda escritura pasa por RPC `SECURITY DEFINER`.
- **Las ~90 funciones `SECURITY DEFINER` fijan `search_path`** (elimina una clase entera de ataques de escalada).
- **Integridad entre hogares reforzada a nivel de esquema** con claves foráneas compuestas `(household_id, id)` — no solo con RLS.
- **Histórico de movimientos de despensa inmutable** (append-only por trigger).
- **El rediseño de idempotencia (`peek → validar → claim`) del hotfix de julio es correcto** y está excelentemente documentado en la propia migración.
- **El problema del BOM en el catálogo de recetas ya no existe**: verificado byte a byte en los 47 archivos; el catálogo va en base64, inmune a que un editor lo corrompa. (Conviene añadir a CI una comprobación anti-BOM para que no vuelva.)

**Calidad**
- **Tipado estricto real**: cero `any` y cero `as unknown as` en todo `src/`.
- **Ningún error silenciado**: no hay `catch {}` vacíos; los errores de negocio usan `AppError` tipado y los mensajes al usuario están en español.
- **`useRealtimeRefresh` bien construido**: sin fugas de suscripciones, con limpieza correcta y decisiones documentadas.
- **`PrimaryButton` usa el patrón accesible `aria-disabled` + `aria-describedby`** (mejor que deshabilitar a secas).
- **CI mínima pero correcta** (lint estricto + tipos + tests en cada push) y los módulos de lógica pura están bien testeados.

---

## 7. Plan de acción sugerido (por orden)

1. **Ya mismo (menos de una hora):** actualizar Next.js a 16.2.12 (A1) · arreglar el test en rojo (A3) · excluir `.git-worktrees` del lint (B9) · decidir qué hacer con `install.ps1` (B6).
2. **Esta semana:** cabeceras de seguridad (M1) · exigir siempre código de invitación o rate-limit en el registro (M2) · verificar/desactivar el signup público en Supabase remoto y subir la longitud mínima de contraseña (M3) · tests de la lógica de `proxy.ts` (A2).
3. **Siguiente ciclo:** unificar `failure()`/`rpc()` compartidos (M6, M7) · reordenar idempotencia en las 3 RPC pendientes (M5) · `revoke` + validación en `recipes_seed_one` (M4) · realtime en el Plan (M8) y en `HouseholdManager` (M9).
4. **Limpieza y futuro:** borrar tablas/RPCs `poc_*` (B2) · umbral difuso del catálogo (B3) · resto de hallazgos bajos · comprobación anti-BOM en CI.

---

*Documento generado por auditoría automatizada con revisión de tres agentes especializados (seguridad, base de datos y QA). Ningún archivo del proyecto ha sido modificado durante la auditoría.*
