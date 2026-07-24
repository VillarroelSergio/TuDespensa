-- Validación con el hogar fundador: "+ Añadir producto" guardaba siempre en
-- Despensa sin preguntar la zona real, y no había forma de guardar productos
-- de limpieza. Se añade "cleaning" como cuarta zona, junto a las tres que ya
-- existen (Frigorífico/Congelador/Despensa); no toca la entrevista guiada de
-- alta de hogar (esa solo cubre alimentos perecederos).
alter table public.pantry_locations drop constraint pantry_locations_kind_check;
alter table public.pantry_locations
  add constraint pantry_locations_kind_check check (kind in ('fridge', 'freezer', 'pantry', 'cleaning'));

insert into public.pantry_locations (household_id, kind)
select h.id, 'cleaning' from public.households h
on conflict (household_id, kind) do nothing;

-- La entrevista guiada de alta de hogar (create_household_with_onboarding)
-- solo cubre alimentos perecederos (fridge/freezer/pantry) y no se toca aquí.
-- Un disparador añade la zona de limpieza a cualquier hogar nuevo sin
-- reescribir esa función.
create function private.pantry_ensure_cleaning_location()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pantry_locations (household_id, kind) values (new.id, 'cleaning')
  on conflict (household_id, kind) do nothing;
  return new;
end;
$$;

create trigger pantry_ensure_cleaning_location
after insert on public.households
for each row execute function private.pantry_ensure_cleaning_location();

create or replace function public.pantry_record_entry(zone text, food_name text, tracking_mode text, approximate_state text, quantity numeric, unit_code text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); household_id_value uuid; location_id_value uuid; food_id_value uuid; item_row public.pantry_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if zone not in ('fridge', 'freezer', 'pantry', 'cleaning') or food_name is null or char_length(trim(food_name)) not between 1 and 120 then raise exception 'Invalid pantry entry' using errcode = 'invalid_parameter_value'; end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  request_hash_value := private.pantry_request_hash('pantry_record_entry', jsonb_build_object('zone', zone, 'food_name', lower(trim(food_name)), 'tracking_mode', tracking_mode, 'state', approximate_state, 'quantity', quantity, 'unit', unit_code));
  replay := private.pantry_claim(household_id_value, actor_id, 'pantry_record_entry', idempotency_key, request_hash_value); if replay is not null then return replay; end if;
  if (tracking_mode = 'approximate' and (quantity is not null or unit_code is not null or approximate_state not in ('plenty', 'some', 'low', 'out')))
     or (tracking_mode = 'units' and (quantity is null or quantity < 0 or unit_code <> 'unit' or approximate_state is not null))
     or (tracking_mode = 'measure' and (quantity is null or quantity < 0 or unit_code not in ('g', 'kg', 'ml', 'l') or approximate_state is not null)) then raise exception 'Invalid pantry tracking payload' using errcode = 'check_violation'; end if;
  select id into location_id_value from public.pantry_locations where household_id = household_id_value and kind = zone;
  food_id_value := private.resolve_household_food(household_id_value, food_name);
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
