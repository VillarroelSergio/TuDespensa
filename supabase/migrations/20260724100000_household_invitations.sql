-- Invitaciones por correo: convierte a la segunda persona (hasta ahora solo un
-- nombre en household_people) en una cuenta real con acceso al mismo hogar.
-- El correo se envía desde la app reutilizando el enlace mágico; aquí solo vive
-- el estado de la invitación y el enlace seguro entre correo y hogar.

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);

-- Como mucho una invitación pendiente por correo y hogar; reenviar reutiliza la fila.
create unique index household_invitations_one_pending_per_email_idx
  on public.household_invitations (household_id, lower(email))
  where status = 'pending';

create index household_invitations_pending_email_idx
  on public.household_invitations (lower(email))
  where status = 'pending';

alter table public.household_invitations enable row level security;

-- El creador ve el estado de las invitaciones de su hogar (para reenviar/retirar).
-- La persona invitada consulta la suya vía RPC (get_my_pending_invitation),
-- porque su correo puede no coincidir aún con ninguna membresía.
create policy "Owners read household invitations"
on public.household_invitations for select to authenticated
using ((select private.is_household_owner(household_id)));

revoke all on table public.household_invitations from anon, authenticated;
grant select on public.household_invitations to authenticated;

alter publication supabase_realtime add table public.household_invitations;

-- Crea (o reactiva) una invitación pendiente. Solo el propietario del hogar,
-- que además debe tener sitio libre (máximo dos personas activas).
create function public.invite_household_member(target_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  household_name text;
  normalized_email text;
  active_members integer;
  invitation_row public.household_invitations;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;

  normalized_email := lower(trim(target_email));
  if normalized_email is null
     or normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(normalized_email) > 254 then
    raise exception 'Invalid email address' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value
  from public.household_members
  where user_id = actor_id and role = 'owner' and status = 'active';

  if household_id_value is null then
    raise exception 'Only the household owner can invite'
      using errcode = 'insufficient_privilege';
  end if;

  if normalized_email = lower((select email from auth.users where id = actor_id)) then
    raise exception 'You already belong to this household'
      using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into active_members
  from public.household_members
  where household_id = household_id_value and status = 'active';

  if active_members >= 2 then
    raise exception 'This household is already full'
      using errcode = 'check_violation';
  end if;

  -- ¿El correo ya pertenece (activo) a este hogar? Entonces no hace falta invitar.
  if exists (
    select 1
    from public.household_members as member
    join auth.users as invited_user on invited_user.id = member.user_id
    where member.household_id = household_id_value
      and member.status = 'active'
      and lower(invited_user.email) = normalized_email
  ) then
    raise exception 'That person is already in this household'
      using errcode = 'unique_violation';
  end if;

  select name into household_name from public.households where id = household_id_value;

  insert into public.household_invitations (household_id, email, invited_by)
  values (household_id_value, normalized_email, actor_id)
  on conflict (household_id, lower(email)) where status = 'pending'
  do update set invited_by = excluded.invited_by, updated_at = now()
  returning * into invitation_row;

  return jsonb_build_object(
    'invitation_id', invitation_row.id,
    'household_id', household_id_value,
    'household_name', household_name,
    'email', normalized_email
  );
end;
$$;

-- El propietario retira una invitación pendiente.
create function public.revoke_household_invitation(invitation_id uuid)
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
  set status = 'revoked', updated_at = now()
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

-- Devuelve la invitación pendiente del usuario actual (según su correo), con el
-- nombre del hogar y de quien invita, para mostrarla y permitir aceptarla.
create function public.get_my_pending_invitation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  result jsonb;
begin
  if actor_id is null then
    return null;
  end if;

  select lower(email) into actor_email from auth.users where id = actor_id;
  if actor_email is null then
    return null;
  end if;

  select jsonb_build_object(
    'invitation_id', invitation.id,
    'household_id', invitation.household_id,
    'household_name', household.name,
    'invited_by_name', coalesce(profile.display_name, 'una persona del hogar')
  )
  into result
  from public.household_invitations as invitation
  join public.households as household on household.id = invitation.household_id
  left join public.profiles as profile on profile.user_id = invitation.invited_by
  where invitation.status = 'pending'
    and lower(invitation.email) = actor_email
  order by invitation.created_at desc
  limit 1;

  return result;
end;
$$;

-- Aceptar la invitación: incorpora al usuario actual al hogar que le invitó.
-- Si ya pertenecía a otro hogar, se le cambia (se desactiva la membresía anterior;
-- los datos del hogar anterior se conservan pero dejan de serle accesibles).
-- ponytail: sin transferencia de propiedad ni migración de despensa previa;
-- añadir si el piloto lo pide.
create function public.accept_household_invitation(invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  invitation_row public.household_invitations;
  active_members integer;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;

  select lower(email) into actor_email from auth.users where id = actor_id;

  select * into invitation_row
  from public.household_invitations
  where id = accept_household_invitation.invitation_id
    and status = 'pending'
  for update;

  if invitation_row.id is null or lower(invitation_row.email) <> actor_email then
    raise exception 'Invitation is unavailable or does not match your account'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into active_members
  from public.household_members
  where household_id = invitation_row.household_id and status = 'active';

  if active_members >= 2
     and not exists (
       select 1 from public.household_members
       where household_id = invitation_row.household_id
         and user_id = actor_id and status = 'active'
     ) then
    raise exception 'This household is already full'
      using errcode = 'check_violation';
  end if;

  -- Cambiar de hogar: dejar inactiva cualquier membresía activa previa.
  update public.household_members
  set status = 'inactive', updated_at = now()
  where user_id = actor_id
    and status = 'active'
    and household_id <> invitation_row.household_id;

  insert into public.household_members (household_id, user_id, role, status)
  values (invitation_row.household_id, actor_id, 'member', 'active')
  on conflict (household_id, user_id)
  do update set status = 'active', updated_at = now();

  update public.household_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = actor_id, updated_at = now()
  where id = invitation_row.id;

  return jsonb_build_object(
    'household_id', invitation_row.household_id,
    'status', 'accepted'
  );
end;
$$;

revoke all on function
  public.invite_household_member(text),
  public.revoke_household_invitation(uuid),
  public.get_my_pending_invitation(),
  public.accept_household_invitation(uuid)
from public, anon, authenticated;

grant execute on function
  public.invite_household_member(text),
  public.revoke_household_invitation(uuid),
  public.get_my_pending_invitation(),
  public.accept_household_invitation(uuid)
to authenticated;
