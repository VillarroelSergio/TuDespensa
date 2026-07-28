-- Seguridad e integridad del canje de invitaciones por código de un solo uso.
-- Los "hashes" son literales de 64 hex (repeat('a',64), ...): la BD solo
-- valida forma y unicidad, nunca calcula un SHA-256 real (eso lo hace Node).
-- Solo usa identidades y correos sintéticos reservados por example.invalid.
--
-- Nota de patrón: code_hash/email solo son legibles por el rol de la base
-- (postgres), no por "authenticated" (grant por columnas). Por eso cada
-- llamada RPC que necesita auth.uid() se hace bajo "set local role
-- authenticated" y el resultado se guarda en una tabla temporal; las
-- aserciones que leen esas columnas se ejecutan después de "reset role".
--
-- El piloto es UN solo hogar con máximo dos miembros activos (households_
-- singleton_guard + enforce_two_active_members_trigger). Por eso, para poder
-- probar de verdad la ruta "sesión ya autenticada que aún no es miembro"
-- (redeem_invitation) después de haber llenado el hogar con la ruta de
-- registro (redeem_invitation_for_new_member), el test desactiva la
-- membresía de B directamente (fixture, no vía RPC): no existe una función
-- "salir del hogar" en este alcance, y es la única forma de liberar el
-- segundo hueco sin un segundo hogar (que el trigger prohíbe).

begin;

do $$
begin
  if to_regclass('public.household_invitations') is null
     or to_regprocedure('public.create_household_invitation(text)') is null
     or to_regprocedure('public.redeem_invitation_for_new_member(text, uuid)') is null
     or to_regprocedure('public.redeem_invitation(text)') is null then
    raise exception 'Pilot invitation codes schema is not installed';
  end if;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '2a000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'owner-a@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '2a000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'guest-b@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '2a000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'outsider-c@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '2a000000-0000-0000-0000-000000000004',
   'authenticated', 'authenticated', 'fourth-d@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '2a000000-0000-0000-0000-000000000005',
   'authenticated', 'authenticated', 'fifth-e@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '2a000000-0000-0000-0000-000000000006',
   'authenticated', 'authenticated', 'sixth-f@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- A crea su hogar (queda owner/active).
set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.create_household_with_onboarding(
  'Hogar de A', '[]'::jsonb, 'create-household-codes-1'
);
reset role;

create temp table t_household as
  select household_id from public.household_members
  where user_id = '2a000000-0000-0000-0000-000000000001' and status = 'active';

-- 1) El propietario crea una invitación: pending, con code_hash, sin email.
set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000001';
set local role authenticated;
create temp table t_result_a as
  select public.create_household_invitation(repeat('a', 64)) as result;
reset role;

do $$
declare
  result jsonb := (select result from t_result_a);
  invitation_id_value uuid := (result ->> 'invitation_id')::uuid;
begin
  if invitation_id_value is null or (result ->> 'expires_at') is null then
    raise exception 'create_household_invitation did not return invitation_id/expires_at';
  end if;

  if not exists (
    select 1 from public.household_invitations
    where id = invitation_id_value
      and status = 'pending'
      and code_hash = repeat('a', 64)
      and email is null
  ) then
    raise exception 'First invitation was not created as expected';
  end if;
end;
$$;

-- 3) Una segunda invitación revoca la primera; solo queda una pending
-- (lo garantiza el índice único parcial por hogar).
set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000001';
set local role authenticated;
create temp table t_result_b as
  select public.create_household_invitation(repeat('b', 64)) as result;
reset role;

do $$
declare
  result jsonb := (select result from t_result_b);
  invitation_id_value uuid := (result ->> 'invitation_id')::uuid;
  household_id_value uuid := (select household_id from t_household);
begin
  if (select count(*) from public.household_invitations
      where household_id = household_id_value and status = 'pending') <> 1 then
    raise exception 'More than one pending invitation exists for the household';
  end if;

  if not exists (
    select 1 from public.household_invitations
    where id = invitation_id_value and status = 'pending' and code_hash = repeat('b', 64)
  ) then
    raise exception 'Second invitation is not the current pending one';
  end if;

  if (select count(*) from public.household_invitations
      where household_id = household_id_value
        and status = 'revoked' and code_hash = repeat('a', 64)) <> 1 then
    raise exception 'First invitation was not revoked by the second';
  end if;
end;
$$;

-- 4) Formato de code_hash inválido.
set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$
begin
  begin
    perform public.create_household_invitation('not-a-valid-hash');
    raise exception 'Invalid code_hash format was accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
reset role;

-- 5) Canje correcto (registro nuevo, service_role): crea la membresía
-- member/active y acepta la invitación. El hash NO se borra (R3): el uso
-- único lo garantiza el status, no el hash, precisamente para poder
-- reconocer un reintento idempotente.
set local role service_role;
create temp table t_result_redeem_1 as
  select public.redeem_invitation_for_new_member(
    repeat('b', 64), '2a000000-0000-0000-0000-000000000002'
  ) as result;
reset role;

do $$
declare
  result jsonb := (select result from t_result_redeem_1);
  household_id_value uuid := (select household_id from t_household);
begin
  if (result ->> 'household_id')::uuid <> household_id_value then
    raise exception 'Redeem did not return the expected household_id';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = household_id_value
      and user_id = '2a000000-0000-0000-0000-000000000002'
      and role = 'member' and status = 'active'
  ) then
    raise exception 'Guest was not added as an active member';
  end if;

  if not exists (
    select 1 from public.household_invitations
    where household_id = household_id_value
      and status = 'accepted'
      and accepted_by = '2a000000-0000-0000-0000-000000000002'
      and code_hash = repeat('b', 64)
  ) then
    raise exception 'Invitation was not marked accepted (code_hash must be preserved, not cleared)';
  end if;
end;
$$;

-- 9) Reintento AUTÉNTICO: la misma llamada, con el mismo código y el mismo
-- usuario, otra vez, sin manipular ninguna fila entre medias. Debe devolver
-- el mismo household_id, no crear una segunda membresía, y dejar la
-- invitación en accepted.
set local role service_role;
create temp table t_result_redeem_1_retry as
  select public.redeem_invitation_for_new_member(
    repeat('b', 64), '2a000000-0000-0000-0000-000000000002'
  ) as result;
reset role;

do $$
declare
  result jsonb := (select result from t_result_redeem_1_retry);
  household_id_value uuid := (select household_id from t_household);
begin
  if (result ->> 'household_id')::uuid <> household_id_value then
    raise exception 'Idempotent retry did not return the expected household_id';
  end if;

  if (select count(*) from public.household_members
      where household_id = household_id_value
        and user_id = '2a000000-0000-0000-0000-000000000002'
        and status = 'active') <> 1 then
    raise exception 'Idempotent retry created a duplicate membership';
  end if;

  if not exists (
    select 1 from public.household_invitations
    where household_id = household_id_value
      and status = 'accepted'
      and accepted_by = '2a000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Idempotent retry did not leave the invitation accepted';
  end if;
end;
$$;

-- 6) El mismo código canjeado por una persona DISTINTA: la garantía de uso
-- único que de verdad importa.
set local role service_role;
do $$
begin
  begin
    perform public.redeem_invitation_for_new_member(
      repeat('b', 64), '2a000000-0000-0000-0000-000000000003'
    );
    raise exception 'Already-used invitation code was redeemed by a different person';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- 7) Código inexistente.
set local role service_role;
do $$
begin
  begin
    perform public.redeem_invitation_for_new_member(
      repeat('c', 64), '2a000000-0000-0000-0000-000000000003'
    );
    raise exception 'Nonexistent invitation code was redeemed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- 2) Un miembro NO propietario (B, ya miembro tras el canje) no puede crear
-- invitaciones.
set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
begin
  begin
    perform public.create_household_invitation(repeat('e', 64));
    raise exception 'Non-owner member was allowed to create an invitation';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- 8) Invitación caducada: se fuerza expires_at en el pasado directamente
-- (no hay RPC para retroceder el reloj) y se intenta canjear.
do $$
declare
  household_id_value uuid := (select household_id from t_household);
begin
  insert into public.household_invitations
    (household_id, invited_by, status, code_hash, email, expires_at)
  values
    (household_id_value, '2a000000-0000-0000-0000-000000000001', 'pending',
     repeat('d', 64), null, now() - interval '1 day');
end;
$$;

set local role service_role;
do $$
begin
  begin
    perform public.redeem_invitation_for_new_member(
      repeat('d', 64), '2a000000-0000-0000-0000-000000000003'
    );
    raise exception 'Expired invitation code was redeemed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Libera el hueco del índice "una pendiente por hogar" para los siguientes casos.
delete from public.household_invitations
where code_hash = repeat('d', 64) and status = 'pending';

-- 10) Hogar lleno (A + B activos): canjear una invitación nueva para una
-- tercera cuenta se rechaza. Se inserta la invitación directamente porque
-- create_household_invitation ya rechazaría crearla con el hogar lleno.
do $$
declare
  household_id_value uuid := (select household_id from t_household);
begin
  insert into public.household_invitations
    (household_id, invited_by, status, code_hash, email, expires_at)
  values
    (household_id_value, '2a000000-0000-0000-0000-000000000001', 'pending',
     repeat('f', 64), null, now() + interval '7 days');
end;
$$;

set local role service_role;
do $$
begin
  begin
    perform public.redeem_invitation_for_new_member(
      repeat('f', 64), '2a000000-0000-0000-0000-000000000004'
    );
    raise exception 'Third account was added to a full household';
  exception when check_violation then null;
  end;
end;
$$;
reset role;

-- El check_violation se lanza antes de tocar la fila: sigue pending. La
-- limpiamos para no chocar con el índice "una pendiente por hogar".
delete from public.household_invitations
where code_hash = repeat('f', 64) and status = 'pending';

-- 11) authenticated no puede ejecutar redeem_invitation_for_new_member;
-- service_role sí.
do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.redeem_invitation_for_new_member(text, uuid)',
    'execute'
  ) then
    raise exception 'authenticated can execute redeem_invitation_for_new_member';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.redeem_invitation_for_new_member(text, uuid)',
    'execute'
  ) then
    raise exception 'service_role cannot execute redeem_invitation_for_new_member';
  end if;
end;
$$;

-- 12) El camino antiguo basado en correo y la superficie de OTP ya no existen.
do $$
begin
  if to_regprocedure('public.get_my_pending_invitation()') is not null
     or to_regprocedure('public.accept_household_invitation(uuid)') is not null
     or to_regprocedure('public.invite_household_member(text)') is not null
     or to_regprocedure('public.middleware_context(text)') is not null then
    raise exception 'A legacy email/OTP function still exists';
  end if;

  if to_regclass('public.trusted_browsers') is not null then
    raise exception 'trusted_browsers table still exists';
  end if;
end;
$$;

-- === public.redeem_invitation: canje por una sesión YA autenticada =========
-- Libera el segundo hueco del hogar (fixture, ver nota de cabecera) para
-- poder probar de verdad la ruta de cuenta ya existente sin membresía.
update public.household_members
set status = 'inactive', updated_at = now()
where user_id = '2a000000-0000-0000-0000-000000000002' and status = 'active';

-- El hogar vuelve a tener sitio: el propietario genera un código real.
set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000001';
set local role authenticated;
create temp table t_result_g as
  select public.create_household_invitation(repeat('11', 32)) as result;
reset role;

-- Canje correcto: quien llama (E) aún no es miembro y se une a sí misma.
set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000005';
set local role authenticated;
create temp table t_result_redeem_self as
  select public.redeem_invitation(repeat('11', 32)) as result;
reset role;

do $$
declare
  result jsonb := (select result from t_result_redeem_self);
  household_id_value uuid := (select household_id from t_household);
begin
  if (result ->> 'household_id')::uuid <> household_id_value then
    raise exception 'redeem_invitation did not return the expected household_id';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = household_id_value
      and user_id = '2a000000-0000-0000-0000-000000000005'
      and role = 'member' and status = 'active'
  ) then
    raise exception 'Existing session was not added as an active member';
  end if;

  if not exists (
    select 1 from public.household_invitations
    where household_id = household_id_value
      and status = 'accepted'
      and accepted_by = '2a000000-0000-0000-0000-000000000005'
      and code_hash = repeat('11', 32)
  ) then
    raise exception 'Invitation was not marked accepted for the self-redeeming session';
  end if;
end;
$$;

-- Hogar lleno (A + E) otra vez: redeem_invitation para una tercera cuenta
-- se rechaza con check_violation.
do $$
declare
  household_id_value uuid := (select household_id from t_household);
begin
  insert into public.household_invitations
    (household_id, invited_by, status, code_hash, email, expires_at)
  values
    (household_id_value, '2a000000-0000-0000-0000-000000000001', 'pending',
     repeat('22', 32), null, now() + interval '7 days');
end;
$$;

set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000006';
set local role authenticated;
do $$
begin
  begin
    perform public.redeem_invitation(repeat('22', 32));
    raise exception 'A third account joined a full household via redeem_invitation';
  exception when check_violation then null;
  end;
end;
$$;
reset role;

delete from public.household_invitations
where code_hash = repeat('22', 32) and status = 'pending';

-- redeem_invitation con código inexistente (formato válido, sin fila que lo case).
set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$
begin
  begin
    perform public.redeem_invitation(repeat('9', 64));
    raise exception 'Nonexistent invitation code was redeemed via redeem_invitation';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- redeem_invitation con código caducado.
do $$
declare
  household_id_value uuid := (select household_id from t_household);
begin
  insert into public.household_invitations
    (household_id, invited_by, status, code_hash, email, expires_at)
  values
    (household_id_value, '2a000000-0000-0000-0000-000000000001', 'pending',
     repeat('33', 32), null, now() - interval '1 day');
end;
$$;

set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$
begin
  begin
    perform public.redeem_invitation(repeat('33', 32));
    raise exception 'Expired invitation code was redeemed via redeem_invitation';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

delete from public.household_invitations
where code_hash = repeat('33', 32) and status = 'pending';

-- Permisos de redeem_invitation: anon no, authenticated sí.
do $$
begin
  if has_function_privilege('anon', 'public.redeem_invitation(text)', 'execute') then
    raise exception 'anon can execute redeem_invitation';
  end if;

  if not has_function_privilege('authenticated', 'public.redeem_invitation(text)', 'execute') then
    raise exception 'authenticated cannot execute redeem_invitation';
  end if;
end;
$$;

-- La función privada compartida no se expone a ningún rol de cliente.
do $$
begin
  if has_function_privilege(
    'authenticated', 'private.redeem_invitation_for(uuid, text)', 'execute'
  ) then
    raise exception 'authenticated can execute the private shared redeem helper';
  end if;
end;
$$;

-- 13) pilot_needs_invitation(): el bit que el middleware necesita para
-- distinguir "aún no hay hogar" de "el hogar ya existe pero esta cuenta no es
-- miembro". No se prueba el caso "no existe ningún hogar": en esta
-- transacción ya hay uno creado y borrarlo arrastraría el resto del test.

-- Cuenta autenticada sin membresía activa (outsider-c) y el hogar ya existe.
set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$
begin
  if public.pilot_needs_invitation() is not true then
    raise exception 'pilot_needs_invitation should be true for a non-member with an existing household';
  end if;
end;
$$;
reset role;

-- Propietaria (miembro activa) → false.
set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$
begin
  if public.pilot_needs_invitation() is not false then
    raise exception 'pilot_needs_invitation should be false for the owner';
  end if;
end;
$$;
reset role;

-- Miembro activa no propietaria (E) → false.
set local "request.jwt.claim.sub" = '2a000000-0000-0000-0000-000000000005';
set local role authenticated;
do $$
begin
  if public.pilot_needs_invitation() is not false then
    raise exception 'pilot_needs_invitation should be false for an active non-owner member';
  end if;
end;
$$;
reset role;

do $$
begin
  if has_function_privilege('anon', 'public.pilot_needs_invitation()', 'execute') then
    raise exception 'anon can execute pilot_needs_invitation';
  end if;

  if not has_function_privilege('authenticated', 'public.pilot_needs_invitation()', 'execute') then
    raise exception 'authenticated cannot execute pilot_needs_invitation';
  end if;
end;
$$;

-- Caso 14: pilot_household_exists. El registro en servidor depende de esta
-- función para exigir código cuando el hogar ya existe; solo el servidor
-- puede ejecutarla.
do $$
begin
  if public.pilot_household_exists() is not true then
    raise exception 'pilot_household_exists should be true while a household exists';
  end if;

  if not has_function_privilege('service_role', 'public.pilot_household_exists()', 'execute') then
    raise exception 'service_role cannot execute pilot_household_exists';
  end if;

  if has_function_privilege('authenticated', 'public.pilot_household_exists()', 'execute') then
    raise exception 'authenticated can execute pilot_household_exists';
  end if;

  if has_function_privilege('anon', 'public.pilot_household_exists()', 'execute') then
    raise exception 'anon can execute pilot_household_exists';
  end if;
end;
$$;

rollback;
