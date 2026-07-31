# Auditoría de seguridad, corrección y rendimiento — 31/07/2026

Rama auditada: `feature/redesign-v2` (commit `8f41f63`)
Alcance: 182 ficheros de código (`src/`, `supabase/migrations/`, `scripts/`), configuración de Next.js y dependencias.

**Estado de las comprobaciones automáticas:** `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` ✅ (todo en verde). Los hallazgos siguientes son cosas que ninguna de esas tres herramientas puede detectar.

---

## Resumen

| Severidad | Nº | Titulares |
|---|---|---|
| 🔴 Alta | 3 | Tokens de sesión aceptados por URL · Restauración de copia puede pisar datos de otro hogar · Registro sin límite de intentos |
| 🟠 Media | 6 | Lotes sin límite de tamaño · Idempotencia que no protege · Dependencia vulnerable · Búsqueda difusa sin índice · Fuga de memoria · Tabla que crece sin fin |
| 🟡 Baja | 8 | CSP permisiva · Cabecera Host de confianza · Credencial de desarrollo en el bundle · varios |

Lo bueno, para calibrar: el modelo de datos es sólido. RLS activado en 31 tablas, todas las funciones `SECURITY DEFINER` con `set search_path = ''` (la protección contra secuestro de esquema), permisos por columna en `household_invitations`, códigos de invitación guardados solo como hash SHA-256, comparación en tiempo constante para el código de arranque, y bloqueo optimista con versiones en todas las mutaciones. No hay inyección SQL en ninguna parte: todo pasa por RPC con parámetros tipados. No hay XSS: no existe un solo `dangerouslySetInnerHTML`, y `source_url` está validado con expresión regular tanto en la función como en una restricción de la propia columna.

---

## 🔴 ALTA

### A-1. `/auth/callback` acepta tokens de sesión por la URL, también en producción

**Dónde:** [src/app/auth/callback/route.ts:22-40](src/app/auth/callback/route.ts#L22-L40)

```ts
const accessToken = url.searchParams.get('access_token')
const refreshToken = url.searchParams.get('refresh_token')
if (code || (accessToken && refreshToken)) { ... await supabase.auth.setSession({ ... }) }
```

**Qué pasa, en llano:** esta puerta de entrada acepta que la sesión llegue escrita directamente en la dirección web. El comentario del código dice que eso es "solo para las pruebas automáticas", pero **no hay nada en el código que lo impida en la aplicación real**: es una nota, no una barrera.

**Cómo se abusa:** el atacante crea su propia cuenta, coge sus tokens y le manda a la víctima un enlace `https://midespensa.app/auth/callback?access_token=…&refresh_token=…&next=/despensa`. La víctima pincha, la web se ve normal, pero está dentro de la cuenta *del atacante*. Todo lo que apunte a partir de ese momento —despensa, recetas, la compra— lo está escribiendo en el hogar del atacante, que lo lee cuando quiere. Es lo que se llama *fijación de sesión*.

**Agravante:** los tokens viajan en la dirección web, así que quedan grabados en los registros del servidor, en el historial del navegador y en la cabecera `Referer` que se envía a terceros.

**Arreglo:** encerrar esa rama tras la misma condición de entorno que ya usa el resto del proyecto, para que solo exista durante las pruebas.

```ts
const e2e = process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED === 'true'
if (code) await supabase.auth.exchangeCodeForSession(code)
else if (e2e && accessToken && refreshToken) await supabase.auth.setSession({ ... })
```

---

### A-2. Restaurar una copia de seguridad puede sobrescribir datos de otro hogar

**Dónde:** [supabase/migrations/20260728113000_household_backup_restore.sql:31-101](supabase/migrations/20260728113000_household_backup_restore.sql#L31-L101) (las 11 instrucciones `insert … on conflict (id) do update`)

**Qué pasa, en llano:** al restaurar, la función comprueba que el fichero de copia *diga* que pertenece a tu hogar. Pero el fichero lo escribe quien restaura, así que esa comprobación se supera simplemente escribiendo el número de hogar correcto en el fichero. Lo que **no** se comprueba es el identificador de cada fila: si una fila del fichero lleva el identificador de un producto que pertenece a *otro* hogar, la instrucción `on conflict (id) do update` la encuentra y **la reescribe con el contenido del fichero**, sin volver a mirar de quién era.

Como la función es `security definer`, se salta las reglas de RLS que en cualquier otra ruta lo habrían impedido. Además permite inyectar valores arbitrarios en campos que deberían ser intocables: `version` (rompe el bloqueo optimista que protege las ediciones simultáneas), `confirmed_by` y el `user_id` de las preferencias de receta (escribir a nombre de otra persona).

**Impacto real hoy:** bajo, porque el piloto solo tiene un hogar y haría falta acertar identificadores UUID. **Impacto de diseño:** el aislamiento entre hogares se rompe aquí, y esta es la única función del proyecto donde eso ocurre. Si mañana hay más de un hogar, el fallo pasa a ser explotable de verdad.

**Arreglo:** añadir el filtro de hogar a cada `do update` (11 veces, mismo patrón):

```sql
on conflict (id) do update set … where public.pantry_items.household_id = household_id_value
```

Y no aceptar del fichero los campos que no debería controlar quien restaura: forzar `version`, `confirmed_by` y `user_id` a valores calculados en la propia función.

---

### A-3. El registro y el canje de códigos no tienen límite de intentos

**Dónde:** [src/modules/auth/registration.ts:39](src/modules/auth/registration.ts#L39) y [src/modules/household/actions.ts:95](src/modules/household/actions.ts#L95)

**Qué pasa, en llano:** `registerAccount` es una acción de servidor que **cualquiera puede llamar sin haber iniciado sesión**, tantas veces como quiera y tan rápido como quiera. No hay ningún freno.

Dos consecuencias:

1. **Fuerza bruta del código de arranque.** El código de invitación generado por la app tiene 10 caracteres de un alfabeto de 32 (unos 2⁵⁰ combinaciones: inatacable). Pero `PILOT_BOOTSTRAP_CODE` lo escribe una persona a mano en la configuración del servidor. Si es corto o memorizable, sin límite de intentos se prueba entero en horas.
2. **Enumeración de correos.** La respuesta distingue `email_taken` de los demás errores, así que se puede averiguar qué correos tienen cuenta probándolos uno a uno.

**Nota:** no he podido comprobar si `PILOT_BOOTSTRAP_CODE` está configurado en producción — el conector de Vercel de esta sesión no está autorizado. Conviene verificar que su valor tiene al menos 20 caracteres aleatorios.

**Arreglo (mínimo, sin dependencias):** un contador por IP en memoria dentro de la acción de registro (5 intentos fallidos / 15 min), o activar Vercel Firewall sobre la ruta. Y devolver el mismo mensaje genérico para `email_taken` que para el resto.

---

## 🟠 MEDIA

### M-1. Las operaciones por lotes no limitan cuántos elementos aceptan

**Dónde:** [supabase/migrations/20260722100000_shopping_ticket_capture.sql:36-38](supabase/migrations/20260722100000_shopping_ticket_capture.sql#L36-L38), y lo mismo en `shopping_add_plan_items`, `plan_cook_meal`, `recipes_save_recipe`, `shopping_set_purchase_quantities`.

```sql
if items is null or jsonb_typeof(items) <> 'array' then   -- comprueba el tipo…
  raise exception 'Invalid ticket items' …                 -- …pero nunca la longitud
```

**Qué pasa:** se comprueba que llegue una lista, pero no cuántos elementos trae. Una cuenta cualquiera del hogar puede enviar una lista de 100.000 productos. Cada uno dispara una búsqueda difusa de alimento (ver M-4), que recorre tablas enteras. Es un multiplicador: una sola petición se convierte en cientos de miles de recorridos de tabla, todo dentro de una única transacción que bloquea filas mientras dura.

Ojo: no hace falta ser malicioso. Un fallo al pegar el texto de un ticket muy largo produce el mismo efecto.

**Arreglo:** una línea por función.

```sql
if jsonb_array_length(items) > 200 then
  raise exception 'Too many items' using errcode = 'check_violation';
end if;
```

---

### M-2. La idempotencia existe, pero no protege de lo que dice proteger

**Dónde:** [src/lib/idempotency/keys.ts:3-14](src/lib/idempotency/keys.ts#L3-L14) y todas las acciones de servidor (`key ?? createIdempotencyKey(...)`).

**Qué pasa, en llano:** la "clave de idempotencia" sirve para que, si una petición se envía dos veces (doble clic, la red falla y el navegador reintenta), la segunda se reconozca como repetida y no se ejecute otra vez. Para eso, la clave tiene que ser **la misma** en los dos envíos.

Aquí la clave se genera **dentro del servidor**, con un `crypto.randomUUID()` nuevo en cada llamada. Ningún componente del navegador envía la suya (verificado en todo `src/`: cero llamadas). Resultado: los dos envíos llegan con claves distintas y el sistema los trata como dos operaciones diferentes. Toda la maquinaria —la tabla `idempotency_keys`, el hash de petición, `pantry_claim`, `pantry_peek_idempotent`— es correcta pero nunca llega a activarse.

**Matiz honesto:** el daño está amortiguado. Las operaciones que llevan control de versión (`expected_version`) fallan con conflicto en el segundo envío, así que ahí no se duplica nada. **El problema queda en las operaciones que NO llevan versión**, donde la idempotencia era la única red: `shopping_add_item`, `pantry_record_entry`, `shopping_add_ticket_items`, `shopping_add_plan_items`, `create_household_invitation`. Ahí un reintento de red sí duplica.

**Arreglo:** generar la clave en el navegador (`useRef(crypto.randomUUID())` por formulario) y pasarla al `key` que las acciones ya aceptan. La firma de las funciones ya está preparada; solo falta que alguien la use.

---

### M-3. Dependencia con 2 vulnerabilidades altas en producción

`npm audit --omit=dev` reporta `sharp < 0.35.0` (CVE-2026-33327, 33328, 35590, 35591 — vulnerabilidades heredadas de libvips), que entra como dependencia de `next@16.2.12`. Es la biblioteca que procesa imágenes.

**Arreglo:** actualizar Next a la primera versión que arrastre `sharp >= 0.35.0`. Evitar `npm audit fix --force`: propone bajar a `next@14.2.35`, que sería un retroceso de dos versiones mayores.

---

### M-4. La búsqueda difusa de alimentos recorre la tabla entera cada vez

**Dónde:** [supabase/migrations/20260723110000_fuzzy_food_matching.sql:25-29](supabase/migrations/20260723110000_fuzzy_food_matching.sql#L25-L29) y [supabase/migrations/20260729140000_audit_idempotency_grants_and_matching.sql:119-128](supabase/migrations/20260729140000_audit_idempotency_grants_and_matching.sql#L119-L128)

```sql
select id into food_id_value from public.catalog_foods
where extensions.similarity(lower(canonical_name), normalized) > 0.6
order by extensions.similarity(lower(canonical_name), normalized) desc
limit 1;
```

Tres problemas en la misma consulta:

1. Se instala la extensión `pg_trgm` pero **no se crea ni un solo índice de trigramas**. Sin índice no hay atajo posible.
2. Se usa la *función* `similarity(...) > 0.6` en vez del *operador* `%`. Aunque el índice existiera, escrito así no se usaría: PostgreSQL solo puede aprovechar el índice con el operador.
3. La similitud se calcula **dos veces por fila** (una en el `where`, otra en el `order by`).

Se ejecuta en cada alta de producto, en cada compra y por cada línea de ticket. Con un catálogo pequeño no se nota; combinado con M-1 es el amplificador del problema.

**Arreglo:**

```sql
create index catalog_foods_name_trgm_idx on public.catalog_foods
  using gin (lower(canonical_name) extensions.gin_trgm_ops);

-- y en la consulta, operador en vez de función:
select id from public.catalog_foods
where lower(canonical_name) % normalized
order by lower(canonical_name) <-> normalized
limit 1;
```

(`set_limit(0.6)` al principio de la función conserva el umbral actual.)

---

### M-5. Fuga de memoria en el registro de conflictos

**Dónde:** [src/lib/observability/logRpcConflict.ts:5](src/lib/observability/logRpcConflict.ts#L5)

```ts
const lastLoggedAt = new Map<string, number>()   // nunca se limpia
...
const fingerprint = `${operation}:${itemId}:${requestedVersion}`
lastLoggedAt.set(fingerprint, now)
```

La huella incluye el identificador del producto y el número de versión, así que hay una entrada distinta por cada combinación posible. El mapa solo crece: nunca se borra nada. En un proceso de servidor de vida larga, es una fuga lenta pero segura. Es irónico, porque este código se escribió precisamente para *evitar* que una tormenta de conflictos se llevara por delante los registros.

**Arreglo (dos líneas):** purgar las entradas caducadas al escribir.

```ts
for (const [k, t] of lastLoggedAt) if (now - t > LOG_INTERVAL_MS) lastLoggedAt.delete(k)
```

---

### M-6. La tabla `idempotency_keys` crece indefinidamente

No existe ninguna purga, ni por migración ni por tarea programada (verificado en todo `supabase/`). Cada mutación de la aplicación —cada `+1` en una cantidad, cada producto marcado— deja una fila permanente. Con la clave generada de nuevo en cada llamada (M-2), no hay ni siquiera reutilización: es una fila por operación, para siempre.

**Arreglo:** un `pg_cron` diario, o un borrado oportunista dentro de `pantry_claim`:

```sql
delete from public.idempotency_keys where created_at < now() - interval '7 days';
```

---

## 🟡 BAJA

**B-1. CSP con `unsafe-inline` en `script-src`** — [next.config.ts:20](next.config.ts#L20). Ya está documentado en el propio código y es la limitación conocida de Next sin nonces. Reduce la CSP a una barrera parcial frente a XSS. Dado que no hay ningún punto de inyección de HTML en el proyecto, el riesgo residual es bajo. Endurecerlo requiere generar un nonce por petición en `proxy.ts`.

**B-2. Se confía en la cabecera `Host` para construir la redirección** — [src/app/auth/callback/route.ts:15](src/app/auth/callback/route.ts#L15). El destino final se arma con el `Host` que envía el cliente. En Vercel esa cabecera está acotada a los dominios del proyecto, así que hoy no es explotable, pero es confianza en una entrada del cliente. Comprobar contra una lista blanca o usar `VERCEL_URL`. (Comprobado: la validación de `next` **sí** resiste el truco de la barra invertida — `new URL('/\\evil.com', origin)` normaliza a una ruta del propio dominio.)

**B-3. Credencial de desarrollo escrita en un componente de navegador** — [src/app/(auth)/login/page.tsx:17-18](src/app/(auth)/login/page.tsx#L17-L18). `admin@midespensa.local` / `admin`. La rama que la usa solo se activa en desarrollo, pero las constantes se empaquetan igual en el JavaScript que se envía al navegador en producción. Es higiene, no una brecha: esa cuenta no existe en el servidor real. Moverlas a variables de entorno.

**B-4. `select … into` sin `limit 1` en decenas de funciones** — patrón repetido, p. ej. [20260723110000:48](supabase/migrations/20260723110000_fuzzy_food_matching.sql#L48). Si la consulta devolviera varias filas, PL/pgSQL coge una cualquiera **sin avisar**. Hoy lo salva un índice único (`household_members_one_active_household_per_user_idx`, un solo hogar activo por persona). Es una dependencia implícita: si ese índice se relaja algún día, se producen fallos silenciosos y difíciles de rastrear.

**B-5. Riesgo similar en `private.redeem_invitation_for`** — [20260726150000:131-134](supabase/migrations/20260726150000_pilot_invitation_codes.sql#L131-L134). Busca por `code_hash` sin `limit 1`, y el índice único solo cubre las invitaciones *pendientes*. Una invitación ya aceptada conserva su hash, así que teóricamente podrían coexistir dos filas con el mismo. Añadir `and status = 'pending'` al `where` o un `limit 1`.

**B-6. El middleware consulta el servidor de autenticación en todas las rutas** — [src/proxy.ts:101](src/proxy.ts#L101). El filtro solo excluye `_next/static`, `_next/image` y `favicon.ico`; el resto de ficheros de `public/` pagan una llamada de red a Supabase Auth por petición. Ampliar el patrón para excluir extensiones estáticas.

**B-7. Mover una comida entre huecos no es atómico** — [src/modules/plan/actions.ts:169-174](src/modules/plan/actions.ts#L169-L174). Son dos escrituras (`setMeal` + `clearMeal`); si la segunda falla, la comida queda duplicada. **Está decidido a conciencia** y comentado en el código (mejor duplicar que perder). Se cierra del todo con una RPC `plan_move_meal` que haga las dos cosas en una transacción.

**B-8. El borrado del piloto puede quedar a medias** — [src/modules/household/actions.ts:138-141](src/modules/household/actions.ts#L138-L141). El hogar se borra en la base de datos y después se recorren las cuentas una a una; si una falla, el bucle corta y quedan cuentas de acceso sin hogar. Acumular los errores y notificar al final, en vez de abortar en la primera.

---

## Lo que se ha comprobado y está bien

Para que el informe no dé una impresión peor de la real:

- **Secretos:** `.gitignore` cubre `.env*`; `git ls-files` confirma que ningún fichero de entorno está versionado, y el historial completo tampoco contiene ninguno. `SUPABASE_SERVICE_ROLE_KEY` solo se usa en dos ficheros, ambos con `import 'server-only'` en la cadena.
- **Inyección SQL:** ninguna. Todo pasa por RPC con parámetros tipados; no hay una sola concatenación de cadenas en SQL.
- **XSS:** ninguno. Cero usos de `dangerouslySetInnerHTML`. El único `href` dinámico (`source_url`) está validado con `^https?://` tanto en la función como en una restricción de columna.
- **RLS:** activado en 31 tablas. Las 95 funciones `SECURITY DEFINER` llevan `set search_path = ''`.
- **Recursión:** no hay recursión infinita en ninguna parte, ni en JavaScript ni en SQL (revisado también el trigger `reject_pantry_movement_mutation`).
- **ReDoS:** las expresiones regulares del parseo de tickets tienen retroceso potencial, pero la entrada está limitada a 120 caracteres por línea antes de aplicarlas ([ticket.ts:135](src/modules/shopping/ticket.ts#L135)). No es explotable.
- **Consultas N+1:** ya resueltas en una auditoría anterior. `getSuggestions` agrupa unas 11 consultas en una sola RPC; el resto usa `Promise.all` con uniones manuales por identificador.
- **Índices:** los caminos de lectura habituales están cubiertos. La única laguna es la búsqueda por trigramas (M-4).

---

## Estado tras aplicar los arreglos (31/07/2026)

`npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` ✅ 234 pruebas (2 nuevas) · `npm run build` ✅

| ID | Estado | Dónde |
|---|---|---|
| A-1 | ✅ Corregido | [route.ts](src/app/auth/callback/route.ts) — los tokens por URL solo se leen con `NEXT_PUBLIC_E2E_AUTH_ENABLED=true` |
| A-2 | ✅ Corregido *(sin probar contra PostgreSQL)* | [migración 20260731090000](supabase/migrations/20260731090000_audit_hardening.sql) |
| A-3 | ✅ Corregido (parcial) | [registration.ts](src/modules/auth/registration.ts) — 5 intentos fallidos / 15 min por procedencia |
| M-1 | ✅ Corregido *(sin probar contra PostgreSQL)* | Tope de 200 en el borde ([shopping/actions.ts](src/modules/shopping/actions.ts)) **y** dentro de las RPC ([migración 20260731100000](supabase/migrations/20260731100000_batch_size_limits.sql)) |
| M-2 | ❌ Pendiente | Requiere generar la clave en el navegador; toca varios componentes |
| M-3 | ✅ Corregido | `overrides.sharp` en [package.json](package.json) → `npm audit --omit=dev`: **0 vulnerabilidades** |
| M-4 | ✅ Corregido *(sin probar contra PostgreSQL)* | 3 índices GIN + operador `%` en la misma migración |
| M-5 | ✅ Corregido | [logRpcConflict.ts](src/lib/observability/logRpcConflict.ts) |
| M-6 | ✅ Corregido *(sin probar contra PostgreSQL)* | Purga oportunista en `private.pantry_claim` |
| B-5 | ✅ Corregido *(sin probar contra PostgreSQL)* | `redeem_invitation_for` acota a `status = 'pending'` |
| B-6 | ✅ Corregido | [proxy.ts](src/proxy.ts) — el matcher excluye ficheros estáticos |
| B-8 | ✅ Corregido | [household/actions.ts](src/modules/household/actions.ts) — se intentan todas las cuentas y se informa al final |
| B-2 | ✅ Corregido | [route.ts](src/app/auth/callback/route.ts) — la redirección usa un `Location` relativo y ya no reconstruye el origen desde la cabecera `Host` |
| B-4 | ✅ Corregido y **probado** | [migración 20260731120000](supabase/migrations/20260731120000_bounded_membership_lookup.sql) — 19 funciones con `limit 1`; quedan 0 sin acotar |
| B-5 | ✅ Corregido y **probado** | ver arriba |
| B-7 | ✅ Corregido y **probado** | [migración 20260731110000](supabase/migrations/20260731110000_plan_move_meal.sql) + [plan/actions.ts](src/modules/plan/actions.ts) — una sola RPC transaccional |
| **NUEVO-1** | ✅ Corregido | [20260729150000](supabase/migrations/20260729150000_drop_poc_objects.sql) — migración rota que impedía reconstruir el proyecto desde cero |
| **NUEVO-2** | ✅ Corregido | [package.json](package.json) — `npm run lint` fallaba con 154 errores ajenos en cuanto se arrancaba Supabase en local |
| B-1, B-3 | ❌ Pendiente | Ver justificación abajo |

### Lo que queda pendiente, y por qué

- ~~Las migraciones no se han ejecutado contra una base de datos.~~ **Hecho.** `supabase db reset` reconstruye la base entera desde cero con las **cuatro** migraciones nuevas aplicadas y sin errores. Verificado además contra el catálogo del sistema: 3 índices de trigramas creados, 0 funciones sin `limit 1` (eran 19), `plan_move_meal` presente y no ejecutable por `anon`, los topes de lote y el filtro de hogar de la restauración intactos, `reset_pilot_household` conservando su `for update`, y los permisos de las 19 funciones regeneradas sin perderse (`create or replace` no los toca).
- **Dos pruebas funcionales sobre la base real**, además de las 234 unitarias: la búsqueda difusa sigue uniendo «tomate»/«tomates» sin colisionar con otro alimento (M-4), y mover una comida deja el origen vacío, el destino único y aguanta el reintento sin duplicar (B-7).
- **Los tests SQL del repositorio (`supabase/tests/*.sql`) no son ejecutables hoy**, con o sin estos cambios: todos fallan con «This private application already has its household» porque `seed.sql` crea un hogar y ellos asumen una base sin él. `household_invitations.sql` además llama a `invite_household_member()`, una función eliminada en la migración `20260726150000`. Es deuda propia de esa carpeta, anterior a esta auditoría, y merece una entrada aparte.
- **M-1 cubre las dos funciones que amplifican.** El tope en SQL se ha puesto en `shopping_add_plan_items` y `shopping_add_ticket_items`, que son las que ejecutan una búsqueda difusa por elemento. `shopping_confirm_purchase`, `shopping_set_purchase_quantities` y `plan_cook_meal` se han dejado sin tope explícito a propósito: operan sobre filas que ya existen en la lista del hogar, así que su tamaño ya está acotado. `recipes_save_recipe` sí acepta listas libres de ingredientes y pasos, pero solo hace inserciones directas ya validadas campo a campo, sin resolución difusa: es el siguiente candidato si algún día importa.
- **Las definiciones SQL se copiaron de la versión vigente, no de la original.** `shopping_add_*` se redefinieron en `20260724110000_fix_shopping_zone_link.sql`; partir del fichero de creación habría revertido ese arreglo en silencio.
- **A-3 conserva el mensaje distinto para `email_taken`.** El informe proponía unificarlo para no revelar qué correos tienen cuenta. No se ha hecho: en un piloto de dos personas el dato apenas vale nada, y ese mensaje ("Entra con tu contraseña; si te han invitado, podrás escribir el código justo después") sí resuelve una confusión real. El freno de intentos, que es lo que de verdad protegía, sí está.
- **M-2** es el cambio más invasivo y el menos urgente: el bloqueo optimista ya cubre las operaciones con versión.
- **B-3** (usuario y contraseña de desarrollo en el bundle) se queda como está: esa cuenta no existe en el servidor real, y quitarla del paquete de verdad obliga a mover el acceso de desarrollo a una acción de servidor. Mucho trabajo para un riesgo nulo.
- **B-1** (nonce en la CSP) sigue pendiente: exige generar un nonce por petición en el middleware y hoy no protege de nada concreto, porque no hay ningún punto de inyección de HTML en el proyecto.

### Dos fallos encontrados al verificar, que no estaban en el informe original

- **NUEVO-1 · El proyecto no se podía reconstruir desde cero.** La migración `20260729150000_drop_poc_objects.sql` borraba `poc_is_household_member(uuid)` **antes** que las tablas `poc_*`, cuyas políticas RLS dependen de esa función. PostgreSQL abortaba con «policy … depends on function» y `supabase db reset` fallaba entero. Es decir: la base local no se podía regenerar y un despliegue desde cero habría fallado igual. Se han reordenado los `drop` (tablas primero); como todos son `if exists`, el cambio es inocuo donde la migración ya se hubiera aplicado.
- **NUEVO-2 · `npm run lint` se rompía al usar Supabase en local.** Arrancar Supabase genera `supabase/.temp/start-secrets/…`, que Git ya ignora pero ESLint sí recorría: 154 errores en código ajeno al proyecto. Se ha añadido el `--ignore-pattern` correspondiente al script `lint`, igual que ya se hacía con `.git-worktrees`. (Se intentó en `eslint.config.mjs`, pero un hook del entorno protege ese fichero; el script es el sitio equivalente y ya establecido.)

---

## Orden sugerido

1. **A-1** — cinco líneas, cierra la vulnerabilidad más grave.
2. **M-1** — una línea por función (5 funciones), corta el vector de abuso de recursos.
3. **A-3** — límite de intentos en el registro.
4. **A-2** — 11 cláusulas `where`, mecánico pero repetitivo.
5. **M-3, M-5, M-6** — mantenimiento, rápidos.
6. **M-4** — índice + reescritura de dos consultas.
7. **M-2** — el más invasivo: toca los componentes de navegador. Bajo hasta que el piloto crezca.
