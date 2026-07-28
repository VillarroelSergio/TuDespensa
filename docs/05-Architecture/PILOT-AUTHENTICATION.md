---
title: Autenticación del piloto privado
aliases:
  - Pilot Authentication
  - Autenticación por código de invitación
tags:
  - midespensa
  - arquitectura
  - auth
  - piloto
status: in-progress
updated: 2026-07-26
notion_task: "https://app.notion.com/p/3a8ad407cbfd81f9b17decfef02ae713"
related:
  - "[[TECHNICAL-ARCHITECTURE]]"
  - "[[ACTIVE-CONTEXT]]"
  - "[[DOMAIN-DATA-MODEL]]"
  - "[[adr/0004-acceso-cerrado-rls]]"
---

# Autenticación del piloto privado

> [!info] Reemplaza a `AUTHENTICATION-DEVICE-VERIFICATION`
> Aquella nota describía acceso por contraseña **más un OTP por correo para
> verificar el navegador**, y daba por necesarios SMTP propio y confirmación de
> correo. El piloto elimina esa vía por completo. Esta nota es la canónica.

## Problema que resolvió este rediseño

La auditoría del 2026-07-26 encontró un **fallo crítico de autorización**. La
cadena era:

1. El registro estaba abierto: cualquiera podía crear una cuenta desde `/login`.
2. La invitación al hogar se identificaba **únicamente por el correo**
   (`get_my_pending_invitation` comparaba `auth.users.email` con
   `household_invitations.email`).
3. El piloto no confirma el correo.

Consecuencia: **cualquiera que adivinara el correo invitado podía registrarse
con él, sin tener acceso a ese buzón, y unirse al hogar.** La invitación no
demostraba nada.

Defectos adicionales confirmados:

- La invitación dependía de `inviteUserByEmail`, es decir de SMTP.
- El retorno de la invitación se construía con la cabecera `host`, que en Vercel
  es una **URL de despliegue efímera y protegida**.
- El registro se quedaba bloqueado en «Revisa tu correo» si Supabase exigía
  confirmación.
- El onboarding pintaba «crear hogar» **antes** de resolver la invitación, y
  crear el segundo hogar disparaba el trigger `households_singleton_guard` con
  el mensaje crudo `This private application already has its household`. Ese es
  el origen exacto del error observado en Vercel.
- Quedaban vivos restos de la verificación de navegador (`/auth/verify-device`,
  `requestNewBrowserCode`, que llamaba a `signInWithOtp`) y código muerto
  (`/auth/invitation-callback`, `invitation-session.ts`).

## Decisión

**La invitación es un código de un solo uso, entregado fuera de banda.**

- El código se genera **en Node**: 10 caracteres de base32 de Crockford
  (alfabeto `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, sin `I`, `L`, `O` ni `U` para
  que no haya confusión al dictarlo), mostrado como `XXXXX-XXXXX`.
- **PostgreSQL sólo recibe y almacena el hash SHA-256.** El código en claro
  existe una única vez, en la pantalla de la persona propietaria, y no se
  guarda, ni se registra en logs, ni viaja en la URL.
- La propietaria se lo pasa a la otra persona **de viva voz o por mensajería**.
- Caduca a los 7 días, es de un solo uso, y **como máximo hay uno pendiente por
  hogar**: generar un código nuevo invalida el anterior.

**El código además cierra el registro.** Si ya existe un hogar, no se puede
crear ninguna cuenta sin un código válido, y el código se valida **antes** de
crear la cuenta. Así nunca vuelve a quedar una cuenta huérfana ni se alcanza el
error del trigger.

### Por qué esto es seguro y el correo no lo era

El código es un secreto de ~50 bits que **sólo puede haber entregado la
propietaria**. El correo, en cambio, es un dato público y adivinable que la
aplicación no verificaba. La autorización pasa de «demuestras conocer un
identificador» a «demuestras poseer un secreto entregado por quien ya está
dentro».

## Arquitectura resultante

### Base de datos (migración `20260726150000_pilot_invitation_codes.sql`)

| Objeto | Rol que lo ejecuta | Función |
| --- | --- | --- |
| `create_household_invitation(code_hash)` | `authenticated` (sólo propietaria) | Genera/renueva el código. Revoca el pendiente anterior. |
| `redeem_invitation_for_new_member(code_hash, new_user_id)` | **`service_role` únicamente** | Canje durante el registro, cuando aún no hay `auth.uid()`. |
| `redeem_invitation(code_hash)` | `authenticated` | Canje para una cuenta que **ya existe** y aún no es miembro. Une a `auth.uid()`, nunca a un id recibido por parámetro. |
| `pilot_needs_invitation()` | `authenticated` | Un único bit para el enrutado: «esta cuenta necesita código». |
| `pilot_household_exists()` | **`service_role` únicamente** | El mismo bit para el registro, **antes** de que exista sesión: «¿ya hay hogar? ¿hace falta código?». |
| `private.redeem_invitation_for(user_id, code_hash)` | **ningún rol de cliente** | Lógica común de canje, para que las dos rutas no se desincronicen. |

La distinción de permisos es deliberada: `redeem_invitation_for_new_member`
acepta un id ajeno, así que **jamás** se concede a `authenticated`; si se
concediera, cualquiera podría meter a un tercero en el hogar.
`redeem_invitation` sí puede concederse porque sólo une a quien la llama.

`code_hash`, `email` e `invited_by` **no son legibles por `authenticated`**
(permisos por columna): el hash no puede llegar al navegador ni por error.

### Garantías conservadas

- **Máximo dos cuentas**: trigger `enforce_two_active_members` más el índice
  único de una sola membresía activa por persona. El canje lo vuelve a
  comprobar dentro de la transacción.
- **Un solo hogar**: trigger `households_singleton_guard`, conservado como
  defensa en profundidad.
- **Canje concurrente**: la fila de la invitación se toma con `for update`, así
  que dos intentos simultáneos se serializan; el segundo recibe error.
- **Reintento idempotente**: si la misma cuenta reintenta con el mismo código,
  se le devuelve éxito en lugar de un error. El uso único lo garantiza el
  `status`, no borrar el hash.
- **RLS sigue siendo la defensa principal**: nada de esto relaja las políticas
  por hogar.

### «Mi hogar» con dos personas

Varias consultas resolvían el hogar con
`from('household_members').select('household_id').eq('status','active').maybeSingle()`,
**sin filtrar por usuario**. Con una sola persona funcionaba; en cuanto entra la
segunda, RLS permite que los miembros se vean entre sí, la consulta devuelve dos
filas y `maybeSingle()` falla con «multiple rows returned». La despensa, la
compra y el onboarding se rompían justo al cumplirse el objetivo del piloto.
Corregido añadiendo `.eq('user_id', user.id)` en las cuatro llamadas
(`pantry`, `shopping` y dos en `onboarding`); el middleware ya lo hacía bien.

### Registro (servidor)

`registerAccount` corre en el servidor con la clave de servicio y, en este
orden: valida la forma de correo y contraseña → pregunta por
`pilot_household_exists()` si ya hay hogar → exige código si lo hay → crea la
cuenta con `email_confirm: true` → canjea el código. **Si el canje falla, borra
la cuenta que acaba de crear**, para que no quede ninguna cuenta huérfana.

Ese primer paso **falla cerrado**: si la comprobación no se puede resolver, no
se crea ninguna cuenta. La primera versión leía `households` directamente con
la clave de servicio e **ignoraba el error**; como los permisos de tabla están
revocados incluso para `service_role` (todo pasa por RPC), la consulta siempre
devolvía «permission denied», el registro se creía «aún no hay hogar» y **dejaba
crear cuentas sin código**. Lo detectó la prueba E2E del caso 1, no las pruebas
unitarias, que simulaban esa consulta como si funcionase. Ahora hay una prueba
unitaria de regresión y otra SQL sobre los permisos de la función.

`email_confirm: true` es deliberado: el piloto no depende de SMTP. La
verificación de correo queda **aplazada** a cuando existan dominio y SMTP
propios, y podrá activarse sin rehacer este diseño.

## Limitaciones aceptadas del piloto

- **Sin recuperación automática de contraseña**: depende de SMTP. La interfaz lo
  explica en lugar de ofrecer un botón que no funciona. Mientras no exista SMTP,
  la vía de recuperación es el reinicio guiado del piloto.
- **Sin verificación de correo**: cualquiera podría registrar la primera cuenta
  con un correo que no controla. En un piloto de dos personas conocidas es
  asumible; deja de serlo al ampliar el acceso.
- **Sin límite de intentos** en el canje del código. La protección es la
  entropía del código (~50 bits), el uso único, la caducidad de 7 días y que
  como máximo hay uno pendiente. Si se abriera el acceso, hay que añadir
  limitación de intentos.
- **La primera cuenta no exige código**: quien llegue antes de que exista el
  hogar puede crearlo. Es el arranque del piloto; a partir de ese momento el
  hogar único bloquea cualquier otro.

## Reparación de la cuenta remota huérfana

> [!warning] Este procedimiento NO se ha ejecutado
> Toca datos reales del proyecto remoto. Requiere autorización explícita, paso a
> paso. Ningún agente debe ejecutarlo por iniciativa propia.

### Situación verificada en remoto (2026-07-26)

- **Cuenta A**: confirmada, con membresía `owner` / `active`.
- **Cuenta B**: confirmada y capaz de iniciar sesión, **sin membresía**.
- **Una invitación `pending`** cuyo `email` coincide con el de la cuenta B.

### Por qué la reparación es no destructiva

El diseño anterior sólo permitía unirse aceptando una invitación **por correo**.
Como esa vía se elimina y la cuenta B ya existe, la única salida habría sido
**borrar un usuario en producción**. `redeem_invitation` evita eso: una sesión ya
autenticada puede canjear un código y unirse.

### Requisito previo

1. Migración `20260726150000_pilot_invitation_codes.sql` aplicada en remoto.
2. Aplicación desplegada con la pantalla de canje.

La migración está escrita para aplicarse sobre el esquema remoto tal como está:
todos sus `drop` usan `if exists`, porque se ha verificado que
`middleware_context` y `trusted_browsers` **no existen en remoto** aunque sí en
local.

### Pasos

1. **Invalidar la invitación obsoleta.** La `pending` actual tiene `email` pero
   **no tiene `code_hash`**, así que ya no es canjeable; aun así hay que
   retirarla porque ocupa el hueco del índice «una pendiente por hogar». Desde
   `/hogar`, con la sesión de la cuenta A: **Retirar**.

   Comprobación previa, sólo lectura:

   ```sql
   select id, status, code_hash is null as sin_codigo, created_at
   from public.household_invitations
   where status = 'pending';
   ```

2. **Generar el código** en `/hogar` con la cuenta A. Se muestra una sola vez.

3. **Entregarlo fuera de banda** a la persona de la cuenta B. Sin correo, sin
   SMTP, sin ninguna URL de Vercel.

4. **Canjear.** La cuenta B **inicia sesión con su contraseña** (no se registra
   de nuevo: ya existe). La aplicación detecta que necesita código
   (`pilot_needs_invitation()`) y la lleva a la pantalla de canje. Al introducir
   el código queda como `member` / `active`.

5. **Verificar**, en modo lectura:

   ```sql
   -- Exactamente dos filas: una 'owner' y una 'member'.
   select role, status
   from public.household_members
   where status = 'active'
   order by role;

   select status, accepted_by is not null as canjeada, accepted_at
   from public.household_invitations
   order by created_at desc
   limit 3;
   ```

   Y en la aplicación, con las dos sesiones abiertas: que ambas vean la misma
   despensa y que un cambio en una llegue a la otra.

### Si el paso 4 falla

El mensaje de error es genérico a propósito (no distingue código inexistente,
caducado, revocado o ya usado). Ante un fallo:

1. Confirmar que la cuenta B **no se ha registrado de nuevo** creando una
   tercera identidad. Si lo hizo, habría que eliminarla: acción destructiva que
   requiere autorización aparte.
2. Repetir los pasos 2 y 3. Generar un código nuevo invalida el anterior, así
   que no quedan dos códigos vivos.

### Alternativa destructiva (no recomendada)

**Reiniciar pruebas** en `/hogar` (escribiendo `BORRAR`) elimina el hogar, sus
datos y las cuentas activas. **Destruye despensa, recetas, plan e histórico.**
No hay razón para usarlo sólo por la cuenta huérfana.

## Cambios remotos que siguen requiriendo autorización

- Aplicar la migración al proyecto remoto (`supabase db push`).
- Desplegar la aplicación.
- Cambiar la configuración remota de Supabase Auth.
- Cambiar variables de entorno en Vercel.
- Crear, modificar o eliminar usuarios remotos.

## Camino de evolución

Cuando existan dominio y SMTP propios, se podrá añadir **sin rehacer este
diseño**: confirmación de correo al registrarse, recuperación de contraseña por
correo, y opcionalmente entrega del código de invitación también por correo
(como comodidad, no como autorización: el código seguiría siendo el secreto).
