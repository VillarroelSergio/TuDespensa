-- Auditoría 2026-07-29: retirada de la prueba de concepto inicial
-- (20260719093214_poc_two_session_security.sql). Sus 4 tablas y sus RPC
-- seguían en el esquema con `grant execute ... to authenticated`, es decir,
-- superficie invocable desde cualquier sesión, pese a que ninguna parte de la
-- aplicación las usa: `grep -r "poc_" src/ e2e/` no devuelve nada. El modelo
-- real vive en households/household_members/pantry_items/idempotency_keys.
--
-- Las tablas poc_* nunca han contenido datos de la aplicación, solo los del
-- ensayo de concurrencia con el que se validó el diseño de dos sesiones.

drop function if exists public.poc_consume_pantry_item(uuid, integer, text);
drop function if exists public.poc_update_pantry_item(uuid, integer, text);
drop function if exists public.poc_is_household_member(uuid);

-- El trigger de dos miembros activos cae con su tabla, pero la función queda
-- suelta si no se nombra.
drop function if exists public.poc_enforce_two_active_members() cascade;

drop table if exists public.poc_idempotency_keys;
drop table if exists public.poc_pantry_items;
drop table if exists public.poc_household_members;
drop table if exists public.poc_households;
