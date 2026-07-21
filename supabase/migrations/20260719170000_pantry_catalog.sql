-- Fase 3, bloque 1: catálogo y despensa. Las mutaciones se encapsulan en RPCs.

create table public.catalog_foods (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null check (char_length(trim(canonical_name)) between 1 and 120),
  category text not null default 'other' check (category in ('produce', 'dairy', 'protein', 'bakery', 'frozen', 'dry', 'other')),
  consume_soon_after interval,
  created_at timestamptz not null default now()
);

create table public.food_aliases (
  id uuid primary key default gen_random_uuid(),
  catalog_food_id uuid not null references public.catalog_foods(id) on delete cascade,
  alias text not null check (char_length(trim(alias)) between 1 and 120),
  created_at timestamptz not null default now()
);

create unique index catalog_foods_canonical_name_ci_idx on public.catalog_foods (lower(canonical_name));
create unique index food_aliases_catalog_alias_ci_idx on public.food_aliases (catalog_food_id, lower(alias));

create table public.units (
  code text primary key check (code in ('unit', 'g', 'kg', 'ml', 'l')),
  family text not null check (family in ('units', 'mass', 'volume')),
  label text not null
);

insert into public.units (code, family, label) values
  ('unit', 'units', 'unidades'), ('g', 'mass', 'gramos'), ('kg', 'mass', 'kilogramos'),
  ('ml', 'volume', 'mililitros'), ('l', 'volume', 'litros')
on conflict (code) do nothing;

alter table public.household_foods
  add column catalog_food_id uuid references public.catalog_foods(id) on delete set null;

create table public.household_food_aliases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  food_id uuid not null,
  alias text not null check (char_length(trim(alias)) between 1 and 120),
  created_at timestamptz not null default now(),
  foreign key (household_id, food_id)
    references public.household_foods(household_id, id) on delete cascade
);

create unique index household_food_aliases_name_ci_idx on public.household_food_aliases (household_id, lower(alias));

alter table public.pantry_items
  drop constraint pantry_items_tracking_mode_check,
  add constraint pantry_items_tracking_mode_check check (tracking_mode in ('approximate', 'units', 'measure')),
  add column approximate_state text,
  add column unit_code text references public.units(code),
  add column entered_at timestamptz,
  add constraint pantry_items_approximate_state_check check (approximate_state is null or approximate_state in ('plenty', 'some', 'low', 'out')),
  add constraint pantry_items_tracking_shape_check check (
    (tracking_mode = 'approximate' and quantity is null and unit_code is null and approximate_state is not null)
    or (tracking_mode = 'units' and quantity is not null and quantity >= 0 and unit_code = 'unit' and approximate_state is null)
    or (tracking_mode = 'measure' and quantity is not null and quantity >= 0 and unit_code in ('g', 'kg', 'ml', 'l') and approximate_state is null)
  );

update public.pantry_items
set approximate_state = case when presence then 'some' else 'out' end,
    entered_at = coalesce(confirmed_at, created_at)
where approximate_state is null;

alter table public.pantry_items
  -- Onboarding RPCs insert presence-only rows; they map to an approximate 'some'.
  -- No NOT NULL here: units/measure modes require a null state (see shape check).
  alter column approximate_state set default 'some',
  alter column entered_at set not null,
  alter column entered_at set default now();

alter table public.pantry_movements
  drop constraint pantry_movements_movement_type_check,
  add column quantity_delta numeric,
  add column item_snapshot jsonb not null default '{}'::jsonb,
  add constraint pantry_movements_movement_type_check check (movement_type in ('entry', 'removal', 'correction', 'consumption', 'adjustment'));

create index pantry_items_household_updated_idx on public.pantry_items (household_id, updated_at desc);
create index household_food_aliases_household_food_idx on public.household_food_aliases (household_id, food_id);

create or replace view public.pantry_consume_soon
with (security_invoker = true) as
select
  item.id as pantry_item_id,
  item.household_id,
  item.food_id,
  item.entered_at,
  food.name as household_food_name,
  catalog.category,
  (catalog.consume_soon_after is not null and item.entered_at + catalog.consume_soon_after <= now()) as consume_soon
from public.pantry_items as item
join public.household_foods as food on food.id = item.food_id and food.household_id = item.household_id
left join public.catalog_foods as catalog on catalog.id = food.catalog_food_id
where item.presence;

alter table public.catalog_foods enable row level security;
alter table public.food_aliases enable row level security;
alter table public.units enable row level security;
alter table public.household_food_aliases enable row level security;

create policy "Authenticated users read catalog foods" on public.catalog_foods for select to authenticated using (true);
create policy "Authenticated users read food aliases" on public.food_aliases for select to authenticated using (true);
create policy "Authenticated users read units" on public.units for select to authenticated using (true);
create policy "Active members read household food aliases" on public.household_food_aliases for select to authenticated using ((select private.is_active_household_member(household_id)));

drop policy "Active members manage household foods" on public.household_foods;
drop policy "Active members manage pantry items" on public.pantry_items;
drop policy "Active members create pantry movements" on public.pantry_movements;
create policy "Active members read household foods" on public.household_foods for select to authenticated using ((select private.is_active_household_member(household_id)));
create policy "Active members read pantry items" on public.pantry_items for select to authenticated using ((select private.is_active_household_member(household_id)));

create function private.pantry_request_hash(operation_name text, payload jsonb)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(operation_name || ':' || payload::text, 'UTF8'), 'sha256'), 'hex');
$$;

create function private.pantry_claim(
  household_id_value uuid, actor_id uuid, operation_name text, idempotency_key text, request_hash_value text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare claimed boolean; stored_hash text; stored_result jsonb;
begin
  if idempotency_key is null or idempotency_key !~ '^[A-Za-z0-9._:-]{8,120}$' then
    raise exception 'Invalid idempotency key' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.idempotency_keys (household_id, actor, operation, key, request_hash, result)
  values (household_id_value, actor_id, operation_name, idempotency_key, request_hash_value, '{}'::jsonb)
  on conflict do nothing returning true into claimed;
  if coalesce(claimed, false) then return null; end if;
  select request_hash, result into stored_hash, stored_result from public.idempotency_keys
  where actor = actor_id and operation = operation_name and key = idempotency_key;
  if stored_hash <> request_hash_value then
    raise exception 'Idempotency key was reused with a different request' using errcode = 'invalid_parameter_value';
  end if;
  return stored_result;
end;
$$;

create function private.pantry_store_result(household_id_value uuid, actor_id uuid, operation_name text, idempotency_key text, value jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.idempotency_keys set result = value where household_id = household_id_value and actor = actor_id and operation = operation_name and key = idempotency_key;
$$;

create function private.pantry_mutate(
  item_id_value uuid, expected_version integer, tracking_mode_value text, approximate_state_value text,
  quantity_value numeric, unit_code_value text, operation_name text, movement_name text, idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); item_row public.pantry_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if expected_version is null or expected_version < 1 then raise exception 'Invalid version' using errcode = 'invalid_parameter_value'; end if;
  select * into item_row from public.pantry_items where id = item_id_value and private.is_active_household_member(household_id, actor_id) for update;
  if item_row.id is null then raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure'; end if;
  request_hash_value := private.pantry_request_hash(operation_name, jsonb_build_object('item_id', item_id_value, 'version', expected_version, 'tracking_mode', tracking_mode_value, 'state', approximate_state_value, 'quantity', quantity_value, 'unit', unit_code_value));
  -- Replay must precede the version check: a retry of an applied mutation sees
  -- the already-incremented version and would otherwise fail instead of replaying.
  replay := private.pantry_claim(item_row.household_id, actor_id, operation_name, idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  if item_row.version <> expected_version then raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure'; end if;
  if (tracking_mode_value = 'approximate' and (quantity_value is not null or unit_code_value is not null or approximate_state_value not in ('plenty', 'some', 'low', 'out')))
     or (tracking_mode_value = 'units' and (quantity_value is null or quantity_value < 0 or unit_code_value <> 'unit' or approximate_state_value is not null))
     or (tracking_mode_value = 'measure' and (quantity_value is null or quantity_value < 0 or unit_code_value not in ('g', 'kg', 'ml', 'l') or approximate_state_value is not null)) then
    raise exception 'Invalid pantry tracking payload' using errcode = 'check_violation';
  end if;
  update public.pantry_items set tracking_mode = tracking_mode_value, approximate_state = approximate_state_value,
    quantity = quantity_value, unit_code = unit_code_value,
    presence = case when tracking_mode_value = 'approximate' then approximate_state_value <> 'out' else quantity_value > 0 end,
    version = version + 1, confirmed_at = now(), confirmed_by = actor_id, updated_at = now()
  where id = item_row.id returning * into item_row;
  insert into public.pantry_movements (household_id, item_id, movement_type, actor, quantity_delta, item_snapshot)
  values (item_row.household_id, item_row.id, movement_name, actor_id, quantity_value, jsonb_build_object('tracking_mode', item_row.tracking_mode, 'approximate_state', item_row.approximate_state, 'quantity', item_row.quantity, 'unit_code', item_row.unit_code, 'version', item_row.version));
  result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'presence', item_row.presence);
  perform private.pantry_store_result(item_row.household_id, actor_id, operation_name, idempotency_key, result);
  return result;
end;
$$;

create function public.pantry_record_entry(zone text, food_name text, tracking_mode text, approximate_state text, quantity numeric, unit_code text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); household_id_value uuid; location_id_value uuid; food_id_value uuid; item_row public.pantry_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if zone not in ('fridge', 'freezer', 'pantry') or food_name is null or char_length(trim(food_name)) not between 1 and 120 then raise exception 'Invalid pantry entry' using errcode = 'invalid_parameter_value'; end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  request_hash_value := private.pantry_request_hash('pantry_record_entry', jsonb_build_object('zone', zone, 'food_name', lower(trim(food_name)), 'tracking_mode', tracking_mode, 'state', approximate_state, 'quantity', quantity, 'unit', unit_code));
  replay := private.pantry_claim(household_id_value, actor_id, 'pantry_record_entry', idempotency_key, request_hash_value); if replay is not null then return replay; end if;
  if (tracking_mode = 'approximate' and (quantity is not null or unit_code is not null or approximate_state not in ('plenty', 'some', 'low', 'out')))
     or (tracking_mode = 'units' and (quantity is null or quantity < 0 or unit_code <> 'unit' or approximate_state is not null))
     or (tracking_mode = 'measure' and (quantity is null or quantity < 0 or unit_code not in ('g', 'kg', 'ml', 'l') or approximate_state is not null)) then raise exception 'Invalid pantry tracking payload' using errcode = 'check_violation'; end if;
  select id into location_id_value from public.pantry_locations where household_id = household_id_value and kind = zone;
  insert into public.household_foods (household_id, name) values (household_id_value, trim(food_name)) on conflict do nothing;
  select id into food_id_value from public.household_foods where household_id = household_id_value and lower(name) = lower(trim(food_name));
  select * into item_row from public.pantry_items where household_id = household_id_value and location_id = location_id_value and food_id = food_id_value for update;
  if item_row.id is null then
    insert into public.pantry_items (household_id, location_id, food_id, tracking_mode, approximate_state, quantity, unit_code, presence, entered_at, confirmed_at, confirmed_by)
    values (household_id_value, location_id_value, food_id_value, tracking_mode, approximate_state, quantity, unit_code, case when tracking_mode = 'approximate' then approximate_state <> 'out' else quantity > 0 end, now(), now(), actor_id) returning * into item_row;
  else
    update public.pantry_items set tracking_mode = pantry_record_entry.tracking_mode, approximate_state = pantry_record_entry.approximate_state, quantity = pantry_record_entry.quantity, unit_code = pantry_record_entry.unit_code, presence = case when pantry_record_entry.tracking_mode = 'approximate' then pantry_record_entry.approximate_state <> 'out' else pantry_record_entry.quantity > 0 end, entered_at = now(), version = version + 1, confirmed_at = now(), confirmed_by = actor_id, updated_at = now() where id = item_row.id returning * into item_row;
  end if;
  insert into public.pantry_movements (household_id, item_id, movement_type, actor, quantity_delta, item_snapshot) values (household_id_value, item_row.id, 'entry', actor_id, quantity, jsonb_build_object('tracking_mode', item_row.tracking_mode, 'approximate_state', item_row.approximate_state, 'quantity', item_row.quantity, 'unit_code', item_row.unit_code, 'version', item_row.version));
  result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'presence', item_row.presence);
  perform private.pantry_store_result(household_id_value, actor_id, 'pantry_record_entry', idempotency_key, result); return result;
end;
$$;

create function public.pantry_correct_item(item_id uuid, version integer, tracking_mode text, approximate_state text, quantity numeric, unit_code text, idempotency_key text) returns jsonb language sql security definer set search_path = '' as $$ select private.pantry_mutate(item_id, version, tracking_mode, approximate_state, quantity, unit_code, 'pantry_correct_item', 'correction', idempotency_key); $$;
create function public.pantry_adjust_item(item_id uuid, version integer, tracking_mode text, approximate_state text, quantity numeric, unit_code text, idempotency_key text) returns jsonb language sql security definer set search_path = '' as $$ select private.pantry_mutate(item_id, version, tracking_mode, approximate_state, quantity, unit_code, 'pantry_adjust_item', 'adjustment', idempotency_key); $$;
create function public.pantry_consume_item(item_id uuid, version integer, tracking_mode text, approximate_state text, quantity numeric, unit_code text, idempotency_key text) returns jsonb language sql security definer set search_path = '' as $$ select private.pantry_mutate(item_id, version, tracking_mode, approximate_state, quantity, unit_code, 'pantry_consume_item', 'consumption', idempotency_key); $$;
create function public.pantry_mark_low(item_id uuid, version integer, idempotency_key text) returns jsonb language sql security definer set search_path = '' as $$ select private.pantry_mutate(item_id, version, 'approximate', 'low', null, null, 'pantry_mark_low', 'consumption', idempotency_key); $$;
create function public.pantry_mark_out(item_id uuid, version integer, idempotency_key text) returns jsonb language sql security definer set search_path = '' as $$ select private.pantry_mutate(item_id, version, 'approximate', 'out', null, null, 'pantry_mark_out', 'consumption', idempotency_key); $$;

create function public.pantry_rename_household_food(food_id uuid, name text, idempotency_key text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); food_row public.household_foods; hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if name is null or char_length(trim(name)) not between 1 and 120 then raise exception 'Invalid food name' using errcode = 'invalid_parameter_value'; end if;
  select * into food_row from public.household_foods where id = food_id and private.is_active_household_member(household_id, actor_id) for update;
  if food_row.id is null then raise exception 'Food is unavailable or inaccessible' using errcode = 'serialization_failure'; end if;
  hash_value := private.pantry_request_hash('pantry_rename_household_food', jsonb_build_object('food_id', food_id, 'name', lower(trim(name)))); replay := private.pantry_claim(food_row.household_id, actor_id, 'pantry_rename_household_food', idempotency_key, hash_value); if replay is not null then return replay; end if;
  update public.household_foods set name = trim(name) where id = food_id; result := jsonb_build_object('food_id', food_id, 'name', trim(name)); perform private.pantry_store_result(food_row.household_id, actor_id, 'pantry_rename_household_food', idempotency_key, result); return result;
end;
$$;

create function public.pantry_add_household_food_alias(food_id uuid, alias text, idempotency_key text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); food_row public.household_foods; hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if alias is null or char_length(trim(alias)) not between 1 and 120 then raise exception 'Invalid food alias' using errcode = 'invalid_parameter_value'; end if;
  select * into food_row from public.household_foods where id = food_id and private.is_active_household_member(household_id, actor_id) for update;
  if food_row.id is null then raise exception 'Food is unavailable or inaccessible' using errcode = 'serialization_failure'; end if;
  hash_value := private.pantry_request_hash('pantry_add_household_food_alias', jsonb_build_object('food_id', food_id, 'alias', lower(trim(alias)))); replay := private.pantry_claim(food_row.household_id, actor_id, 'pantry_add_household_food_alias', idempotency_key, hash_value); if replay is not null then return replay; end if;
  insert into public.household_food_aliases (household_id, food_id, alias) values (food_row.household_id, food_id, trim(alias)) on conflict (household_id, lower(alias)) do nothing;
  result := jsonb_build_object('food_id', food_id, 'alias', trim(alias)); perform private.pantry_store_result(food_row.household_id, actor_id, 'pantry_add_household_food_alias', idempotency_key, result); return result;
end;
$$;

revoke all on public.catalog_foods, public.food_aliases, public.units, public.household_food_aliases,
  public.household_foods, public.pantry_items, public.pantry_movements from anon, authenticated;
grant select on public.catalog_foods, public.food_aliases, public.units, public.household_food_aliases, public.household_foods, public.pantry_items, public.pantry_movements, public.pantry_consume_soon to authenticated;
revoke all on function private.pantry_request_hash(text, jsonb), private.pantry_claim(uuid, uuid, text, text, text), private.pantry_store_result(uuid, uuid, text, text, jsonb), private.pantry_mutate(uuid, integer, text, text, numeric, text, text, text, text) from public;
revoke all on function public.pantry_record_entry(text, text, text, text, numeric, text, text), public.pantry_correct_item(uuid, integer, text, text, numeric, text, text), public.pantry_adjust_item(uuid, integer, text, text, numeric, text, text), public.pantry_consume_item(uuid, integer, text, text, numeric, text, text), public.pantry_mark_low(uuid, integer, text), public.pantry_mark_out(uuid, integer, text), public.pantry_rename_household_food(uuid, text, text), public.pantry_add_household_food_alias(uuid, text, text) from public, anon, authenticated;
grant execute on function public.pantry_record_entry(text, text, text, text, numeric, text, text), public.pantry_correct_item(uuid, integer, text, text, numeric, text, text), public.pantry_adjust_item(uuid, integer, text, text, numeric, text, text), public.pantry_consume_item(uuid, integer, text, text, numeric, text, text), public.pantry_mark_low(uuid, integer, text), public.pantry_mark_out(uuid, integer, text), public.pantry_rename_household_food(uuid, text, text), public.pantry_add_household_food_alias(uuid, text, text) to authenticated;

alter publication supabase_realtime add table public.household_foods;
alter publication supabase_realtime add table public.pantry_movements;
