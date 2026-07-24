-- Validación con el hogar fundador: "tomates" en la despensa y "tomate" al
-- comprar se registraban como alimentos distintos, así que confirmar la
-- compra nunca reponía el producto terminado. Se añade una coincidencia
-- aproximada (singular/plural, tildes, errores de tecleo) antes de crear un
-- alimento nuevo, reutilizada por alta directa en despensa y por compra.
create extension if not exists pg_trgm with schema extensions;

-- ponytail: similitud por trigramas con umbral fijo, no aprende de
-- confirmaciones ni pide desambiguar. Subir a un flujo de confirmación si
-- empiezan a aparecer falsos positivos entre alimentos distintos.
create function private.resolve_household_food(household_id_value uuid, food_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  normalized text := lower(trim(food_name));
  food_id_value uuid;
begin
  select id into food_id_value from public.household_foods
  where household_id = household_id_value and lower(name) = normalized;
  if food_id_value is not null then return food_id_value; end if;

  select food_id into food_id_value from public.household_food_aliases
  where household_id = household_id_value and lower(alias) = normalized;
  if food_id_value is not null then return food_id_value; end if;

  select id into food_id_value from public.household_foods
  where household_id = household_id_value
    and extensions.similarity(lower(name), normalized) > 0.4
  order by extensions.similarity(lower(name), normalized) desc
  limit 1;
  if food_id_value is not null then return food_id_value; end if;

  insert into public.household_foods (household_id, name) values (household_id_value, trim(food_name))
  on conflict do nothing;
  select id into food_id_value from public.household_foods
  where household_id = household_id_value and lower(name) = normalized;
  return food_id_value;
end;
$$;

revoke all on function private.resolve_household_food(uuid, text) from public, anon, authenticated;

create or replace function public.pantry_record_entry(zone text, food_name text, tracking_mode text, approximate_state text, quantity numeric, unit_code text, idempotency_key text)
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

create or replace function public.shopping_add_item(food_name text, item_source text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; food_id_value uuid; list_id_value uuid;
  item_row public.shopping_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if food_name is null or char_length(trim(food_name)) not between 1 and 120 or item_source not in ('manual', 'pantry') then
    raise exception 'Invalid shopping item' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  request_hash_value := private.pantry_request_hash('shopping_add_item', jsonb_build_object('food_name', lower(trim(food_name)), 'source', item_source));
  replay := private.pantry_claim(household_id_value, actor_id, 'shopping_add_item', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  food_id_value := private.resolve_household_food(household_id_value, food_name);
  insert into public.shopping_lists (household_id, status) values (household_id_value, 'active')
  on conflict (household_id, status) do update set updated_at = now() returning id into list_id_value;
  insert into public.shopping_items (household_id, shopping_list_id, food_id, source)
  values (household_id_value, list_id_value, food_id_value, item_source)
  on conflict (shopping_list_id, food_id) do update set is_purchased = false, source = excluded.source, version = public.shopping_items.version + 1, updated_at = now()
  returning * into item_row;
  result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'is_purchased', item_row.is_purchased);
  perform private.pantry_store_result(household_id_value, actor_id, 'shopping_add_item', idempotency_key, result);
  return result;
end;
$$;

revoke all on function public.pantry_record_entry(text, text, text, text, numeric, text, text), public.shopping_add_item(text, text, text) from public, anon, authenticated;
grant execute on function public.pantry_record_entry(text, text, text, text, numeric, text, text), public.shopping_add_item(text, text, text) to authenticated;
