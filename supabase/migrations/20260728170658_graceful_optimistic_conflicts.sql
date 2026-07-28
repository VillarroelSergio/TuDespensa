-- Evita que un cliente antiguo convierta un conflicto optimista esperado en
-- una excepción y rollback. La respuesta no revela si el ítem existe ni a qué
-- hogar pertenece: el cliente actual la transforma en AppError(CONFLICT) y
-- recarga; un cliente anterior deja de reintentar la operación fallida.
create function private.pantry_conflict_result()
returns jsonb language sql immutable security definer set search_path = '' as $$
  select jsonb_build_object('status', 'conflict')
$$;

revoke all on function private.pantry_conflict_result() from public;

create or replace function private.pantry_mutate(
  item_id_value uuid, expected_version integer, tracking_mode_value text, approximate_state_value text,
  quantity_value numeric, unit_code_value text, operation_name text, movement_name text, idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); item_row public.pantry_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if expected_version is null or expected_version < 1 then raise exception 'Invalid version' using errcode = 'invalid_parameter_value'; end if;
  select * into item_row from public.pantry_items where id = item_id_value and private.is_active_household_member(household_id, actor_id) for update;
  if item_row.id is null then return private.pantry_conflict_result(); end if;
  request_hash_value := private.pantry_request_hash(operation_name, jsonb_build_object('item_id', item_id_value, 'version', expected_version, 'tracking_mode', tracking_mode_value, 'state', approximate_state_value, 'quantity', quantity_value, 'unit', unit_code_value));
  replay := private.pantry_peek_idempotent(item_row.household_id, actor_id, operation_name, idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  if item_row.version <> expected_version then return private.pantry_conflict_result(); end if;
  if (tracking_mode_value = 'approximate' and (quantity_value is not null or unit_code_value is not null or approximate_state_value not in ('plenty', 'some', 'low', 'out')))
     or (tracking_mode_value = 'units' and (quantity_value is null or quantity_value < 0 or unit_code_value <> 'unit' or approximate_state_value is not null))
     or (tracking_mode_value = 'measure' and (quantity_value is null or quantity_value < 0 or unit_code_value not in ('g', 'kg', 'ml', 'l') or approximate_state_value is not null)) then
    raise exception 'Invalid pantry tracking payload' using errcode = 'check_violation';
  end if;
  replay := private.pantry_claim(item_row.household_id, actor_id, operation_name, idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
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

create or replace function public.shopping_toggle_item(item_id uuid, version integer, purchased boolean, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); item_row public.shopping_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  select * into item_row from public.shopping_items where id = item_id and private.is_active_household_member(household_id, actor_id) for update;
  if item_row.id is null then return private.pantry_conflict_result(); end if;
  request_hash_value := private.pantry_request_hash('shopping_toggle_item', jsonb_build_object('item_id', item_id, 'version', version, 'purchased', purchased));
  replay := private.pantry_peek_idempotent(item_row.household_id, actor_id, 'shopping_toggle_item', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  if item_row.version <> version then return private.pantry_conflict_result(); end if;
  replay := private.pantry_claim(item_row.household_id, actor_id, 'shopping_toggle_item', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  update public.shopping_items set is_purchased = purchased, version = item_row.version + 1, updated_at = now() where id = item_row.id returning * into item_row;
  result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'is_purchased', item_row.is_purchased);
  perform private.pantry_store_result(item_row.household_id, actor_id, 'shopping_toggle_item', idempotency_key, result);
  return result;
end;
$$;
