-- POC de seguridad y colaboración para TuDespensa Development.
-- Solo contiene entidades sintéticas y se elimina con la migración del MVP real.

create table public.poc_households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.poc_household_members (
  household_id uuid not null references public.poc_households(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'member')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index poc_household_members_user_id_idx
  on public.poc_household_members (user_id)
  where active;

create table public.poc_pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.poc_households(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 120),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create index poc_pantry_items_household_id_idx
  on public.poc_pantry_items (household_id);

create table public.poc_idempotency_keys (
  household_id uuid not null references public.poc_households(id) on delete cascade,
  user_id uuid not null,
  operation text not null check (operation = 'consume_pantry_item'),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id, operation, idempotency_key)
);

create function public.poc_enforce_two_active_members()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  active_members integer;
begin
  if new.active and (tg_op = 'INSERT' or old.active is false) then
    perform 1
    from public.poc_households
    where id = new.household_id
    for update;

    select count(*)
    into active_members
    from public.poc_household_members
    where household_id = new.household_id
      and active;

    if active_members >= 2 then
      raise exception 'A household may have at most two active members'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger poc_enforce_two_active_members_trigger
before insert or update of active on public.poc_household_members
for each row execute function public.poc_enforce_two_active_members();

create function public.poc_is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.poc_household_members as member
    where member.household_id = target_household_id
      and member.user_id = (select auth.uid())
      and member.active
  );
$$;

alter table public.poc_households enable row level security;
alter table public.poc_household_members enable row level security;
alter table public.poc_pantry_items enable row level security;
alter table public.poc_idempotency_keys enable row level security;

create policy "POC members read their household"
on public.poc_households
for select to authenticated
using (public.poc_is_household_member(id));

create policy "POC members read their membership"
on public.poc_household_members
for select to authenticated
using (user_id = (select auth.uid()) and active);

create policy "POC members read shared pantry"
on public.poc_pantry_items
for select to authenticated
using (public.poc_is_household_member(household_id));

create policy "POC members add shared pantry items"
on public.poc_pantry_items
for insert to authenticated
with check (public.poc_is_household_member(household_id));

create policy "POC members update shared pantry items"
on public.poc_pantry_items
for update to authenticated
using (public.poc_is_household_member(household_id))
with check (public.poc_is_household_member(household_id));

create policy "POC members read their idempotency results"
on public.poc_idempotency_keys
for select to authenticated
using (
  user_id = (select auth.uid())
  and public.poc_is_household_member(household_id)
);

create policy "POC members create their idempotency results"
on public.poc_idempotency_keys
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.poc_is_household_member(household_id)
);

revoke all on table public.poc_households,
                    public.poc_household_members,
                    public.poc_pantry_items,
                    public.poc_idempotency_keys
from anon, authenticated;

grant select on public.poc_households,
                public.poc_household_members
to authenticated;

grant select, insert, update on public.poc_pantry_items,
                              public.poc_idempotency_keys
to authenticated;

create function public.poc_update_pantry_item(
  target_item_id uuid,
  expected_version integer,
  next_label text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  updated_item public.poc_pantry_items;
begin
  update public.poc_pantry_items
  set label = next_label,
      version = version + 1,
      updated_at = now()
  where id = target_item_id
    and version = expected_version
  returning * into updated_item;

  if not found then
    raise exception 'Item was changed, unavailable, or inaccessible'
      using errcode = 'serialization_failure';
  end if;

  return jsonb_build_object(
    'item_id', updated_item.id,
    'version', updated_item.version,
    'label', updated_item.label
  );
end;
$$;

create function public.poc_consume_pantry_item(
  target_item_id uuid,
  expected_version integer,
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_household_id uuid;
  stored_result jsonb;
  updated_item public.poc_pantry_items;
begin
  select household_id
  into target_household_id
  from public.poc_pantry_items
  where id = target_item_id;

  if target_household_id is null then
    raise exception 'Item is unavailable or inaccessible'
      using errcode = 'insufficient_privilege';
  end if;

  select result
  into stored_result
  from public.poc_idempotency_keys
  where household_id = target_household_id
    and user_id = (select auth.uid())
    and operation = 'consume_pantry_item'
    and idempotency_key = request_key
  for update;

  if found then
    return stored_result;
  end if;

  update public.poc_pantry_items
  set version = version + 1,
      updated_at = now()
  where id = target_item_id
    and version = expected_version
  returning * into updated_item;

  if not found then
    raise exception 'Item was changed, unavailable, or inaccessible'
      using errcode = 'serialization_failure';
  end if;

  stored_result := jsonb_build_object(
    'item_id', updated_item.id,
    'version', updated_item.version,
    'operation', 'consume_pantry_item'
  );

  insert into public.poc_idempotency_keys (
    household_id,
    user_id,
    operation,
    idempotency_key,
    result
  ) values (
    target_household_id,
    (select auth.uid()),
    'consume_pantry_item',
    request_key,
    stored_result
  );

  return stored_result;
end;
$$;

revoke all on function public.poc_enforce_two_active_members() from public;
revoke all on function public.poc_is_household_member(uuid) from public;
revoke all on function public.poc_update_pantry_item(uuid, integer, text) from public;
revoke all on function public.poc_consume_pantry_item(uuid, integer, text) from public;

grant execute on function public.poc_is_household_member(uuid),
                          public.poc_update_pantry_item(uuid, integer, text),
                          public.poc_consume_pantry_item(uuid, integer, text)
to authenticated;

alter publication supabase_realtime add table public.poc_pantry_items;
