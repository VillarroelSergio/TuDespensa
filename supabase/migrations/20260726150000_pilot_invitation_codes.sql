-- Sustituye la invitación por correo por un código de invitación de un solo
-- uso. El código en claro nunca llega a PostgreSQL: Node lo genera y solo
-- envía su hash SHA-256; aquí se guarda y valida el hash, nunca el código.
-- Esto cierra el fallo crítico del piloto: con correo + registro abierto sin
-- confirmar, cualquiera que adivinara el correo invitado podía registrarse
-- con él y entrar en el hogar. Con el código, solo quien lo recibe en mano
-- puede canjearlo, y el canje consume el código (una sola vez, con caducidad).
--
-- El esquema remoto y el local no coinciden exactamente (middleware_context y
-- trusted_browsers pueden no existir en remoto todavía). Todos los drops de
-- esta migración usan "if exists" para poder aplicarse igual en ambos sitios.

alter table public.household_invitations
  add column if not exists code_hash text,
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days');

alter table public.household_invitations
  alter column email drop not null;

drop index if exists public.household_invitations_one_pending_per_email_idx;
drop index if exists public.household_invitations_pending_email_idx;

-- Como mucho una invitación pendiente por hogar: es un piloto de dos personas,
-- generar un código nuevo invalida cualquier invitación pendiente anterior.
create unique index household_invitations_one_pending_per_household_idx
  on public.household_invitations (household_id)
  where status = 'pending';

create unique index household_invitations_pending_code_idx
  on public.household_invitations (code_hash)
  where status = 'pending' and code_hash is not null;

-- El código en claro nunca se ve desde el navegador ni el hash que lo
-- representa: el propietario solo necesita leer el estado de su invitación,
-- no el hash. Se sustituye el grant de tabla completa por columnas concretas.
revoke all on table public.household_invitations from anon, authenticated;
grant select (id, household_id, status, created_at, updated_at, expires_at, accepted_at, accepted_by)
  on public.household_invitations to authenticated;

-- El propietario genera (o renueva) el código de invitación de su hogar.
-- Recibe el hash ya calculado en Node; aquí solo se valida su forma.
create function public.create_household_invitation(code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  submitted_code_hash text := code_hash;
  household_id_value uuid;
  active_members integer;
  invitation_row public.household_invitations;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;

  if submitted_code_hash is null or submitted_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation code hash' using errcode = 'invalid_parameter_value';
  end if;

  select member.household_id into household_id_value
  from public.household_members as member
  where member.user_id = actor_id and member.role = 'owner' and member.status = 'active';

  if household_id_value is null then
    raise exception 'Only the household owner can invite'
      using errcode = 'insufficient_privilege';
  end if;

  -- Bloquea la fila del hogar para serializar con altas y otras invitaciones.
  perform 1
  from public.households
  where id = household_id_value
  for update;

  select count(*) into active_members
  from public.household_members
  where household_id = household_id_value and status = 'active';

  if active_members >= 2 then
    raise exception 'This household is already full'
      using errcode = 'check_violation';
  end if;

  -- Generar un código nuevo invalida cualquier invitación pendiente previa.
  update public.household_invitations
  set status = 'revoked', updated_at = now()
  where household_id = household_id_value and status = 'pending';

  insert into public.household_invitations
    (household_id, invited_by, status, code_hash, email, expires_at)
  values
    (household_id_value, actor_id, 'pending', submitted_code_hash, null, now() + interval '7 days')
  returning * into invitation_row;

  return jsonb_build_object(
    'invitation_id', invitation_row.id,
    'expires_at', invitation_row.expires_at
  );
end;
$$;

-- Lógica común de canje, compartida por las dos rutas públicas (registro
-- nuevo y sesión ya autenticada) para que no puedan desincronizarse. No se
-- expone a ningún rol de cliente, ni siquiera service_role: solo la llaman,
-- por dentro, las dos funciones "security definer" de más abajo.
--
-- El uso único lo garantiza el status ('pending' -> 'accepted'), no borrar el
-- hash: conservarlo es inofensivo (es el hash de un secreto aleatorio ya
-- canjeado) y es justo lo que permite reconocer un reintento idempotente del
-- mismo registro sin fabricar estado artificial.
create function private.redeem_invitation_for(target_user_id uuid, submitted_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.household_invitations;
  active_members integer;
begin
  if target_user_id is null
     or submitted_code_hash is null
     or submitted_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation redemption request'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into invitation_row
  from public.household_invitations as invitation
  where invitation.code_hash = submitted_code_hash
  for update;

  -- Mismo mensaje para código inexistente, caducado, revocado o ya usado por
  -- otra persona: no debe filtrarse cuál de los casos es.
  if invitation_row.id is null then
    raise exception 'Invitation code is invalid or has expired'
      using errcode = 'insufficient_privilege';
  end if;

  -- Reintento idempotente: esta misma cuenta ya canjeó este código antes.
  if invitation_row.status = 'accepted' and invitation_row.accepted_by = target_user_id then
    return jsonb_build_object('household_id', invitation_row.household_id);
  end if;

  if invitation_row.status <> 'pending' or invitation_row.expires_at <= now() then
    raise exception 'Invitation code is invalid or has expired'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into active_members
  from public.household_members
  where household_id = invitation_row.household_id and status = 'active';

  if active_members >= 2 then
    raise exception 'This household is already full'
      using errcode = 'check_violation';
  end if;

  insert into public.household_members (household_id, user_id, role, status)
  values (invitation_row.household_id, target_user_id, 'member', 'active')
  on conflict (household_id, user_id)
  do update set status = 'active', updated_at = now();

  update public.household_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = target_user_id, updated_at = now()
  where id = invitation_row.id;

  return jsonb_build_object('household_id', invitation_row.household_id);
end;
$$;

revoke all on function private.redeem_invitation_for(uuid, text)
  from public, anon, authenticated, service_role;

-- Canjea un código de invitación para dar de alta a una cuenta recién creada.
-- La llama el registro desde el servidor (service_role) justo después de crear
-- el usuario en auth.users, momento en el que todavía no hay auth.uid(); por
-- eso recibe new_user_id explícito. Al aceptar un id ajeno, jamás se concede
-- a authenticated: solo service_role puede invocarla.
create function public.redeem_invitation_for_new_member(code_hash text, new_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new_user_id is null or not exists (select 1 from auth.users where id = new_user_id) then
    raise exception 'Invalid invitation redemption request'
      using errcode = 'invalid_parameter_value';
  end if;

  return private.redeem_invitation_for(new_user_id, code_hash);
end;
$$;

-- Canjea un código de invitación para la sesión ya autenticada que la llama
-- (una cuenta que ya existe pero todavía no pertenece a ningún hogar). A
-- diferencia de redeem_invitation_for_new_member, siempre une a quien llama
-- (auth.uid()), nunca a un id recibido por parámetro; por eso sí se puede
-- conceder a authenticated sin riesgo.
create function public.redeem_invitation(code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;

  return private.redeem_invitation_for(actor_id, code_hash);
end;
$$;

-- Elimina el camino antiguo basado en correo: era el fallo de seguridad.
-- "drop" ya retira los privilegios por sí solo; el "revoke" previo no aporta
-- nada y solo puede fallar si el objeto no existiera todavía en remoto.
drop function if exists public.get_my_pending_invitation();
drop function if exists public.accept_household_invitation(uuid);
drop function if exists public.invite_household_member(text);

-- Elimina toda la superficie de OTP / verificación de navegador: el piloto
-- de dos cuentas ya no la necesita con el código de invitación.
drop function if exists public.middleware_context(text);
drop table if exists public.trusted_browsers;

-- Defensa en profundidad: si en el futuro se relajara la comprobación de
-- status, que no quede ningún hash con el que casar una invitación revocada.
create or replace function public.revoke_household_invitation(invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invitation_row public.household_invitations;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;

  update public.household_invitations as invitation
  set status = 'revoked', code_hash = null, updated_at = now()
  where invitation.id = revoke_household_invitation.invitation_id
    and invitation.status = 'pending'
    and private.is_household_owner(invitation.household_id, actor_id)
  returning invitation.* into invitation_row;

  if invitation_row.id is null then
    raise exception 'Invitation was changed, unavailable, or inaccessible'
      using errcode = 'serialization_failure';
  end if;

  return jsonb_build_object('invitation_id', invitation_row.id, 'status', 'revoked');
end;
$$;

-- El middleware necesita distinguir "aún no hay hogar" (esta cuenta creará el
-- primero) de "el hogar ya existe pero esta cuenta no es miembro" (necesita un
-- código de invitación). RLS impide a un no-miembro leer households, y sin este
-- dato el onboarding volvería a ofrecer crear un hogar que el trigger rechaza.
-- Solo revela un bit a una sesión ya autenticada, en un piloto que por diseño
-- tiene un único hogar: no expone ningún dato del hogar ni de sus miembros.
create function public.pilot_needs_invitation()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.household_members
    where user_id = actor_id and status = 'active'
  ) then
    return false;
  end if;

  return exists (select 1 from public.households);
end;
$$;

revoke all on function public.pilot_needs_invitation() from public, anon, authenticated;
grant execute on function public.pilot_needs_invitation() to authenticated;

-- El registro en servidor necesita el mismo bit ANTES de que exista sesión
-- alguna: si ya hay hogar, la segunda cuenta solo puede crearse con código.
-- `service_role` NO tiene SELECT sobre public.households (los permisos de
-- tabla están revocados a propósito y todo pasa por RPC), así que consultar la
-- tabla directamente desde el registro devolvía "permission denied" y, al
-- ignorarse ese error, el registro quedaba abierto sin código. Esta función
-- expone solo ese bit y solo al servidor.
create or replace function public.pilot_household_exists()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from public.households);
$$;

revoke all on function public.pilot_household_exists() from public, anon, authenticated;
grant execute on function public.pilot_household_exists() to service_role;

revoke all on function public.create_household_invitation(text) from public, anon, authenticated;
grant execute on function public.create_household_invitation(text) to authenticated;

revoke all on function public.redeem_invitation_for_new_member(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_invitation_for_new_member(text, uuid) to service_role;

revoke all on function public.redeem_invitation(text) from public, anon, authenticated;
grant execute on function public.redeem_invitation(text) to authenticated;
