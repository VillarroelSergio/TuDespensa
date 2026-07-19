-- Esquema real del vertical slice de onboarding. El POC poc_* se conserva intacto.

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  onboarding_status text not null default 'in_progress'
    check (onboarding_status in ('in_progress', 'completed')),
  baseline_confirmed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create unique index household_members_one_active_household_per_user_idx
  on public.household_members (user_id)
  where status = 'active';

create index household_members_active_household_idx
  on public.household_members (household_id)
  where status = 'active';

create table public.household_people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

create unique index household_people_name_ci_idx
  on public.household_people (household_id, lower(name));

create table public.pantry_locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('fridge', 'freezer', 'pantry')),
  created_at timestamptz not null default now(),
  unique (household_id, kind),
  unique (household_id, id)
);

create table public.household_foods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

create unique index household_foods_name_ci_idx
  on public.household_foods (household_id, lower(name));

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  location_id uuid not null,
  food_id uuid not null,
  tracking_mode text not null default 'approximate'
    check (tracking_mode = 'approximate'),
  presence boolean not null default true,
  quantity numeric check (quantity is null or quantity >= 0),
  version integer not null default 1 check (version > 0),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, location_id, food_id),
  unique (household_id, id),
  foreign key (household_id, location_id)
    references public.pantry_locations(household_id, id) on delete cascade,
  foreign key (household_id, food_id)
    references public.household_foods(household_id, id) on delete restrict
);

create index pantry_items_household_presence_idx
  on public.pantry_items (household_id, presence);

create table public.pantry_movements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_id uuid not null,
  movement_type text not null check (movement_type in ('entry', 'removal', 'correction')),
  actor uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (household_id, item_id)
    references public.pantry_items(household_id, id) on delete restrict
);

create index pantry_movements_household_created_idx
  on public.pantry_movements (household_id, created_at desc);

create table public.onboarding_progress (
  household_id uuid primary key references public.households(id) on delete cascade,
  global_state text not null default 'household_draft'
    check (
      global_state in (
        'household_draft',
        'inventory_in_progress',
        'awaiting_review',
        'confirming',
        'completed'
      )
    ),
  active_zone text check (active_zone is null or active_zone in ('fridge', 'freezer', 'pantry')),
  return_target text check (return_target is null or return_target = 'review'),
  updated_at timestamptz not null default now()
);

create table public.onboarding_zone_progress (
  household_id uuid not null references public.households(id) on delete cascade,
  zone text not null check (zone in ('fridge', 'freezer', 'pantry')),
  state text not null default 'not_started'
    check (
      state in (
        'not_started',
        'in_progress',
        'reviewed_nonempty',
        'reviewed_empty'
      )
    ),
  updated_at timestamptz not null default now(),
  primary key (household_id, zone)
);

create table public.idempotency_keys (
  household_id uuid not null references public.households(id) on delete cascade,
  actor uuid not null references auth.users(id) on delete cascade,
  operation text not null check (char_length(operation) between 1 and 80),
  key text not null check (char_length(key) between 8 and 120),
  request_hash text not null check (char_length(request_hash) = 64),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (household_id, actor, operation, key),
  unique (actor, operation, key)
);

create index idempotency_keys_household_created_idx
  on public.idempotency_keys (household_id, created_at desc);

create function private.is_active_household_member(
  target_household_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as member
    where member.household_id = target_household_id
      and member.user_id = target_user_id
      and member.status = 'active'
  );
$$;

create function private.is_household_owner(
  target_household_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as member
    where member.household_id = target_household_id
      and member.user_id = target_user_id
      and member.role = 'owner'
      and member.status = 'active'
  );
$$;

create function private.enforce_two_active_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_members integer;
  becoming_active boolean;
begin
  if tg_op = 'INSERT' then
    becoming_active := new.status = 'active';
  else
    becoming_active := new.status = 'active' and old.status <> 'active';
  end if;

  if becoming_active then
    perform 1
    from public.households
    where id = new.household_id
    for update;

    select count(*)
    into active_members
    from public.household_members
    where household_id = new.household_id
      and status = 'active';

    if active_members >= 2 then
      raise exception 'A household may have at most two active members'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_two_active_members_trigger
before insert or update of status on public.household_members
for each row execute function private.enforce_two_active_members();

create function private.reject_pantry_movement_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Pantry movements are immutable'
    using errcode = 'object_not_in_prerequisite_state';
end;
$$;

create trigger reject_pantry_movement_mutation_trigger
before update or delete on public.pantry_movements
for each row execute function private.reject_pantry_movement_mutation();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_people enable row level security;
alter table public.pantry_locations enable row level security;
alter table public.household_foods enable row level security;
alter table public.pantry_items enable row level security;
alter table public.pantry_movements enable row level security;
alter table public.onboarding_progress enable row level security;
alter table public.onboarding_zone_progress enable row level security;
alter table public.idempotency_keys enable row level security;

create policy "Users read their profile"
on public.profiles for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users create their profile"
on public.profiles for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users update their profile"
on public.profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Active members read households"
on public.households for select to authenticated
using ((select private.is_active_household_member(id)));

create policy "Active members update households"
on public.households for update to authenticated
using ((select private.is_active_household_member(id)))
with check ((select private.is_active_household_member(id)));

create policy "Active members read memberships"
on public.household_members for select to authenticated
using ((select private.is_active_household_member(household_id)));

create policy "Owners create memberships"
on public.household_members for insert to authenticated
with check ((select private.is_household_owner(household_id)));

create policy "Owners update memberships"
on public.household_members for update to authenticated
using ((select private.is_household_owner(household_id)))
with check ((select private.is_household_owner(household_id)));

create policy "Owners delete memberships"
on public.household_members for delete to authenticated
using ((select private.is_household_owner(household_id)));

create policy "Active members manage household people"
on public.household_people for all to authenticated
using ((select private.is_active_household_member(household_id)))
with check ((select private.is_active_household_member(household_id)));

create policy "Active members manage pantry locations"
on public.pantry_locations for all to authenticated
using ((select private.is_active_household_member(household_id)))
with check ((select private.is_active_household_member(household_id)));

create policy "Active members manage household foods"
on public.household_foods for all to authenticated
using ((select private.is_active_household_member(household_id)))
with check ((select private.is_active_household_member(household_id)));

create policy "Active members manage pantry items"
on public.pantry_items for all to authenticated
using ((select private.is_active_household_member(household_id)))
with check ((select private.is_active_household_member(household_id)));

create policy "Active members read pantry movements"
on public.pantry_movements for select to authenticated
using ((select private.is_active_household_member(household_id)));

create policy "Active members create pantry movements"
on public.pantry_movements for insert to authenticated
with check (
  actor = (select auth.uid())
  and (select private.is_active_household_member(household_id))
);

create policy "Active members manage onboarding progress"
on public.onboarding_progress for all to authenticated
using ((select private.is_active_household_member(household_id)))
with check ((select private.is_active_household_member(household_id)));

create policy "Active members manage onboarding zones"
on public.onboarding_zone_progress for all to authenticated
using ((select private.is_active_household_member(household_id)))
with check ((select private.is_active_household_member(household_id)));

create policy "Actors manage their idempotency records"
on public.idempotency_keys for all to authenticated
using (
  actor = (select auth.uid())
  and (select private.is_active_household_member(household_id))
)
with check (
  actor = (select auth.uid())
  and (select private.is_active_household_member(household_id))
);

revoke all on table public.profiles,
                    public.households,
                    public.household_members,
                    public.household_people,
                    public.pantry_locations,
                    public.household_foods,
                    public.pantry_items,
                    public.pantry_movements,
                    public.onboarding_progress,
                    public.onboarding_zone_progress,
                    public.idempotency_keys
from anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.households to authenticated;
grant update (name) on public.households to authenticated;
grant select, insert, update, delete on public.household_members,
                                                public.household_people
to authenticated;
grant select on public.pantry_locations,
                public.household_foods,
                public.pantry_items,
                public.pantry_movements,
                public.onboarding_progress,
                public.onboarding_zone_progress,
                public.idempotency_keys
to authenticated;

create function public.create_household_with_onboarding(
  name text,
  people jsonb,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_name text;
  request_hash_value text;
  household_id_value uuid := gen_random_uuid();
  person_name text;
  stored_hash text;
  stored_result jsonb;
  claimed_key boolean;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;

  normalized_name := regexp_replace(trim(name), '\s+', ' ', 'g');
  if normalized_name is null or char_length(normalized_name) not between 1 and 80 then
    raise exception 'Invalid household name' using errcode = 'invalid_parameter_value';
  end if;

  if people is null or jsonb_typeof(people) <> 'array' or jsonb_array_length(people) > 10
     or exists (
       select 1 from jsonb_array_elements(people) as element(value)
       where jsonb_typeof(element.value) <> 'string'
     ) then
    raise exception 'People must be an array of at most ten names'
      using errcode = 'invalid_parameter_value';
  end if;

  if idempotency_key is null or idempotency_key !~ '^[A-Za-z0-9._:-]{8,120}$' then
    raise exception 'Invalid idempotency key' using errcode = 'invalid_parameter_value';
  end if;

  request_hash_value := encode(
    extensions.digest(convert_to(normalized_name || '|' || people::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select request_hash, result
  into stored_hash, stored_result
  from public.idempotency_keys
  where actor = actor_id
    and operation = 'create_household_with_onboarding'
    and key = idempotency_key;

  if stored_result is not null then
    if stored_hash <> request_hash_value then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = 'invalid_parameter_value';
    end if;
    return stored_result;
  end if;

  if exists (
    select 1 from public.household_members
    where user_id = actor_id and status = 'active'
  ) then
    raise exception 'The user already belongs to an active household'
      using errcode = 'unique_violation';
  end if;

  insert into public.households (id, name, created_by)
  values (household_id_value, normalized_name, actor_id);

  stored_result := jsonb_build_object(
    'household_id', household_id_value,
    'global_state', 'inventory_in_progress'
  );

  insert into public.idempotency_keys (
    household_id, actor, operation, key, request_hash, result
  ) values (
    household_id_value,
    actor_id,
    'create_household_with_onboarding',
    idempotency_key,
    request_hash_value,
    stored_result
  ) on conflict do nothing
  returning true into claimed_key;

  if not coalesce(claimed_key, false) then
    delete from public.households where id = household_id_value;
    select request_hash, result
    into stored_hash, stored_result
    from public.idempotency_keys
    where actor = actor_id
      and operation = 'create_household_with_onboarding'
      and key = idempotency_key;

    if stored_result is null or stored_hash <> request_hash_value then
      raise exception 'Idempotency result is unavailable'
        using errcode = 'serialization_failure';
    end if;
    return stored_result;
  end if;

  insert into public.household_members (household_id, user_id, role, status)
  values (household_id_value, actor_id, 'owner', 'active');

  for person_name in
    select regexp_replace(trim(value), '\s+', ' ', 'g')
    from jsonb_array_elements_text(people)
  loop
    if char_length(person_name) not between 1 and 80 then
      raise exception 'Invalid person name' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.household_people (household_id, name)
    values (household_id_value, person_name);
  end loop;

  insert into public.pantry_locations (household_id, kind)
  values
    (household_id_value, 'fridge'),
    (household_id_value, 'freezer'),
    (household_id_value, 'pantry');

  insert into public.onboarding_progress (household_id, global_state, active_zone)
  values (household_id_value, 'inventory_in_progress', 'fridge');

  insert into public.onboarding_zone_progress (household_id, zone)
  values
    (household_id_value, 'fridge'),
    (household_id_value, 'freezer'),
    (household_id_value, 'pantry');

  return stored_result;
exception
  when unique_violation then
    if sqlerrm like '%household_people_name_ci_idx%' then
      raise exception 'People must not contain duplicate names'
        using errcode = 'invalid_parameter_value';
    end if;
    raise;
end;
$$;

create function public.onboarding_add_pantry_item(
  zone text,
  food_name text,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  location_id_value uuid;
  food_id_value uuid;
  item_row public.pantry_items;
  normalized_food_name text;
  request_hash_value text;
  stored_hash text;
  stored_result jsonb;
  claimed_key boolean;
  duplicate_item boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if zone is null or zone not in ('fridge', 'freezer', 'pantry') then
    raise exception 'Invalid pantry zone' using errcode = 'invalid_parameter_value';
  end if;
  if idempotency_key is null or idempotency_key !~ '^[A-Za-z0-9._:-]{8,120}$' then
    raise exception 'Invalid idempotency key' using errcode = 'invalid_parameter_value';
  end if;

  normalized_food_name := regexp_replace(trim(food_name), '\s+', ' ', 'g');
  if normalized_food_name is null or char_length(normalized_food_name) not between 1 and 120 then
    raise exception 'Invalid food name' using errcode = 'invalid_parameter_value';
  end if;

  select household_id
  into household_id_value
  from public.household_members
  where user_id = actor_id and status = 'active';

  if household_id_value is null then
    raise exception 'Active household membership is required'
      using errcode = 'insufficient_privilege';
  end if;

  select id into location_id_value
  from public.pantry_locations
  where household_id = household_id_value and kind = zone;

  request_hash_value := encode(
    extensions.digest(
      convert_to(zone || '|' || lower(normalized_food_name), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.idempotency_keys (
    household_id, actor, operation, key, request_hash, result
  ) values (
    household_id_value,
    actor_id,
    'onboarding_add_pantry_item',
    idempotency_key,
    request_hash_value,
    '{}'::jsonb
  ) on conflict do nothing
  returning true into claimed_key;

  if not coalesce(claimed_key, false) then
    select request_hash, result
    into stored_hash, stored_result
    from public.idempotency_keys
    where actor = actor_id
      and operation = 'onboarding_add_pantry_item'
      and key = idempotency_key;

    if stored_result is null or stored_hash <> request_hash_value then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = 'invalid_parameter_value';
    end if;
    return stored_result;
  end if;

  insert into public.household_foods (household_id, name)
  values (household_id_value, normalized_food_name)
  on conflict do nothing;

  select id into food_id_value
  from public.household_foods
  where household_id = household_id_value
    and lower(name) = lower(normalized_food_name);

  select * into item_row
  from public.pantry_items
  where household_id = household_id_value
    and location_id = location_id_value
    and food_id = food_id_value
  for update;

  if item_row.id is not null and item_row.presence then
    duplicate_item := true;
  elsif item_row.id is not null then
    update public.pantry_items
    set presence = true,
        quantity = null,
        version = version + 1,
        confirmed_at = now(),
        confirmed_by = actor_id,
        updated_at = now()
    where id = item_row.id
    returning * into item_row;
  else
    insert into public.pantry_items (
      household_id, location_id, food_id, presence, confirmed_at, confirmed_by
    ) values (
      household_id_value, location_id_value, food_id_value, true, now(), actor_id
    ) returning * into item_row;
  end if;

  if not duplicate_item then
    insert into public.pantry_movements (household_id, item_id, movement_type, actor)
    values (household_id_value, item_row.id, 'entry', actor_id);

    update public.onboarding_zone_progress
    set state = 'in_progress', updated_at = now()
    where household_id = household_id_value
      and onboarding_zone_progress.zone = onboarding_add_pantry_item.zone;

    update public.onboarding_progress
    set global_state = 'inventory_in_progress', active_zone = zone, updated_at = now()
    where household_id = household_id_value;
  end if;

  stored_result := jsonb_build_object(
    'item_id', item_row.id,
    'version', item_row.version,
    'duplicate', duplicate_item,
    'presence', item_row.presence
  );

  update public.idempotency_keys
  set result = stored_result
  where household_id = household_id_value
    and actor = actor_id
    and operation = 'onboarding_add_pantry_item'
    and key = idempotency_key;

  return stored_result;
end;
$$;

create function public.onboarding_remove_pantry_item(
  item_id uuid,
  version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  item_row public.pantry_items;
  location_kind text;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;

  update public.pantry_items as item
  set presence = false,
      quantity = null,
      version = item.version + 1,
      confirmed_at = now(),
      confirmed_by = actor_id,
      updated_at = now()
  where item.id = item_id
    and item.version = onboarding_remove_pantry_item.version
    and item.presence
    and private.is_active_household_member(item.household_id, actor_id)
  returning item.* into item_row;

  if item_row.id is null then
    raise exception 'Item was changed, unavailable, or inaccessible'
      using errcode = 'serialization_failure';
  end if;

  insert into public.pantry_movements (household_id, item_id, movement_type, actor)
  values (item_row.household_id, item_row.id, 'removal', actor_id);

  select kind into location_kind
  from public.pantry_locations
  where id = item_row.location_id and household_id = item_row.household_id;

  if not exists (
    select 1 from public.pantry_items
    where household_id = item_row.household_id
      and location_id = item_row.location_id
      and presence
  ) then
    update public.onboarding_zone_progress
    set state = 'in_progress', updated_at = now()
    where household_id = item_row.household_id
      and zone = location_kind
      and state in ('reviewed_nonempty', 'reviewed_empty');
  end if;

  return jsonb_build_object(
    'item_id', item_row.id,
    'version', item_row.version,
    'presence', item_row.presence
  );
end;
$$;

create function public.onboarding_set_zone_state(
  zone text,
  state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  current_state text;
  present_items integer;
  reviewed_zones integer;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if zone is null or state is null
     or zone not in ('fridge', 'freezer', 'pantry')
     or state not in ('not_started', 'in_progress', 'reviewed_nonempty', 'reviewed_empty') then
    raise exception 'Invalid zone state' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value
  from public.household_members
  where user_id = actor_id and status = 'active';

  if household_id_value is null then
    raise exception 'Active household membership is required'
      using errcode = 'insufficient_privilege';
  end if;

  select onboarding_zone_progress.state into current_state
  from public.onboarding_zone_progress
  where household_id = household_id_value
    and onboarding_zone_progress.zone = onboarding_set_zone_state.zone
  for update;

  if current_state is null then
    raise exception 'Onboarding zone is unavailable' using errcode = 'invalid_parameter_value';
  end if;

  if state <> current_state and not (
    (current_state = 'not_started' and state = 'in_progress')
    or (current_state = 'in_progress' and state in ('reviewed_nonempty', 'reviewed_empty'))
    or (current_state in ('reviewed_nonempty', 'reviewed_empty') and state = 'in_progress')
  ) then
    raise exception 'Invalid onboarding zone transition'
      using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into present_items
  from public.pantry_items as item
  join public.pantry_locations as location
    on location.household_id = item.household_id and location.id = item.location_id
  where item.household_id = household_id_value
    and location.kind = zone
    and item.presence;

  if state = 'reviewed_nonempty' and present_items = 0 then
    raise exception 'A nonempty zone must contain at least one item'
      using errcode = 'check_violation';
  elsif state = 'reviewed_empty' and present_items > 0 then
    raise exception 'An empty zone cannot contain present items'
      using errcode = 'check_violation';
  end if;

  update public.onboarding_zone_progress
  set state = onboarding_set_zone_state.state, updated_at = now()
  where household_id = household_id_value
    and onboarding_zone_progress.zone = onboarding_set_zone_state.zone;

  select count(*) into reviewed_zones
  from public.onboarding_zone_progress
  where household_id = household_id_value
    and onboarding_zone_progress.state in ('reviewed_nonempty', 'reviewed_empty');

  update public.onboarding_progress
  set global_state = case when reviewed_zones = 3 then 'awaiting_review' else 'inventory_in_progress' end,
      active_zone = case when reviewed_zones = 3 then null else zone end,
      updated_at = now()
  where household_id = household_id_value;

  return jsonb_build_object(
    'household_id', household_id_value,
    'zone', zone,
    'state', state,
    'global_state', case when reviewed_zones = 3 then 'awaiting_review' else 'inventory_in_progress' end
  );
end;
$$;

create function public.confirm_baseline(idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  request_hash_value text;
  stored_hash text;
  stored_result jsonb;
  claimed_key boolean;
  reviewed_zones integer;
  confirmed_at_value timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if idempotency_key is null or idempotency_key !~ '^[A-Za-z0-9._:-]{8,120}$' then
    raise exception 'Invalid idempotency key' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value
  from public.household_members
  where user_id = actor_id and status = 'active';

  if household_id_value is null then
    raise exception 'Active household membership is required'
      using errcode = 'insufficient_privilege';
  end if;

  request_hash_value := encode(
    extensions.digest(convert_to('confirm_baseline', 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.idempotency_keys (
    household_id, actor, operation, key, request_hash, result
  ) values (
    household_id_value,
    actor_id,
    'confirm_baseline',
    idempotency_key,
    request_hash_value,
    '{}'::jsonb
  ) on conflict do nothing
  returning true into claimed_key;

  if not coalesce(claimed_key, false) then
    select request_hash, result
    into stored_hash, stored_result
    from public.idempotency_keys
    where actor = actor_id
      and operation = 'confirm_baseline'
      and key = idempotency_key;

    if stored_result is null or stored_hash <> request_hash_value then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = 'invalid_parameter_value';
    end if;
    return stored_result;
  end if;

  select count(*) into reviewed_zones
  from public.onboarding_zone_progress
  where household_id = household_id_value
    and state in ('reviewed_nonempty', 'reviewed_empty');

  if reviewed_zones <> 3 then
    raise exception 'All pantry zones must be reviewed before confirmation'
      using errcode = 'check_violation';
  end if;

  update public.onboarding_progress
  set global_state = 'confirming', updated_at = now()
  where household_id = household_id_value;

  confirmed_at_value := clock_timestamp();

  update public.households
  set onboarding_status = 'completed',
      baseline_confirmed_at = confirmed_at_value,
      updated_at = confirmed_at_value
  where id = household_id_value;

  update public.onboarding_progress
  set global_state = 'completed',
      active_zone = null,
      return_target = null,
      updated_at = confirmed_at_value
  where household_id = household_id_value;

  stored_result := jsonb_build_object(
    'household_id', household_id_value,
    'global_state', 'completed',
    'baseline_confirmed_at', confirmed_at_value
  );

  update public.idempotency_keys
  set result = stored_result
  where household_id = household_id_value
    and actor = actor_id
    and operation = 'confirm_baseline'
    and key = idempotency_key;

  return stored_result;
end;
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;

revoke all on function private.is_active_household_member(uuid, uuid),
                       private.is_household_owner(uuid, uuid),
                       private.enforce_two_active_members(),
                       private.reject_pantry_movement_mutation()
from public;

grant execute on function private.is_active_household_member(uuid, uuid),
                          private.is_household_owner(uuid, uuid)
to authenticated;

revoke all on function public.create_household_with_onboarding(text, jsonb, text),
                       public.onboarding_add_pantry_item(text, text, text),
                       public.onboarding_remove_pantry_item(uuid, integer),
                       public.onboarding_set_zone_state(text, text),
                       public.confirm_baseline(text)
from public, anon, authenticated;

grant execute on function public.create_household_with_onboarding(text, jsonb, text),
                          public.onboarding_add_pantry_item(text, text, text),
                          public.onboarding_remove_pantry_item(uuid, integer),
                          public.onboarding_set_zone_state(text, text),
                          public.confirm_baseline(text)
to authenticated;

alter publication supabase_realtime add table public.pantry_items;
alter publication supabase_realtime add table public.onboarding_progress;
