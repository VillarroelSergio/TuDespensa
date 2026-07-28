-- Despensa: la tarjeta de producto ya no permite editar (nombre/zona) desde
-- que se simplificó su estado. Se repone el mecanismo de edición: renombrar
-- ya existe (pantry_rename_household_food), pero mover un producto entre
-- zonas (frigorífico/congelador/despensa/limpieza) no tenía RPC. Se añade
-- pantry_move_item siguiendo el mismo patrón de pantry_delete_item.
--
-- Si el destino ya tiene el mismo producto, se fusionan en vez de bloquear
-- el movimiento (el cliente avisa al usuario antes de llamar a este RPC).
-- Solo se fusiona si el modo de seguimiento y la unidad coinciden; si no,
-- se rechaza con un error claro en vez de mezclar cantidades incompatibles.

create function public.pantry_move_item(item_id uuid, version integer, zone text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  item_row public.pantry_items;
  dest_row public.pantry_items;
  location_id_value uuid;
  hash_value text;
  replay jsonb;
  result jsonb;
  merged_state text;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if zone not in ('fridge', 'freezer', 'pantry', 'cleaning') then raise exception 'Invalid zone' using errcode = 'invalid_parameter_value'; end if;
  select * into item_row from public.pantry_items
  where id = item_id and private.is_active_household_member(household_id, actor_id)
  for update;
  if item_row.id is null or item_row.removed_at is not null then raise exception 'Pantry item is unavailable' using errcode = 'serialization_failure'; end if;
  if item_row.version <> version then raise exception 'Pantry item changed' using errcode = 'serialization_failure'; end if;
  hash_value := private.pantry_request_hash('pantry_move_item', jsonb_build_object('item_id', item_id, 'version', version, 'zone', zone));
  replay := private.pantry_claim(item_row.household_id, actor_id, 'pantry_move_item', idempotency_key, hash_value);
  if replay is not null then return replay; end if;
  select id into location_id_value from public.pantry_locations where household_id = item_row.household_id and kind = zone;
  if location_id_value = item_row.location_id then
    result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'presence', item_row.presence, 'merged', false);
    perform private.pantry_store_result(item_row.household_id, actor_id, 'pantry_move_item', idempotency_key, result);
    return result;
  end if;
  select * into dest_row from public.pantry_items
  where household_id = item_row.household_id and location_id = location_id_value
    and food_id = item_row.food_id and removed_at is null
  for update;
  if dest_row.id is null then
    update public.pantry_items set location_id = location_id_value, version = item_row.version + 1, updated_at = now()
    where id = item_row.id returning * into item_row;
    insert into public.pantry_movements (household_id, item_id, movement_type, actor, item_snapshot)
    values (item_row.household_id, item_row.id, 'correction', actor_id, jsonb_build_object('location_id', item_row.location_id, 'version', item_row.version));
    result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'presence', item_row.presence, 'merged', false);
    perform private.pantry_store_result(item_row.household_id, actor_id, 'pantry_move_item', idempotency_key, result);
    return result;
  end if;
  if item_row.tracking_mode <> dest_row.tracking_mode
     or (item_row.tracking_mode <> 'approximate' and item_row.unit_code <> dest_row.unit_code) then
    raise exception 'No se pueden fusionar productos con unidades distintas' using errcode = 'unique_violation';
  end if;
  if item_row.tracking_mode = 'approximate' then
    merged_state := case
      when item_row.approximate_state = 'plenty' or dest_row.approximate_state = 'plenty' then 'plenty'
      when item_row.approximate_state = 'some' or dest_row.approximate_state = 'some' then 'some'
      when item_row.approximate_state = 'low' or dest_row.approximate_state = 'low' then 'low'
      else 'out'
    end;
    update public.pantry_items set approximate_state = merged_state, presence = merged_state <> 'out',
      version = version + 1, confirmed_at = now(), confirmed_by = actor_id, updated_at = now()
    where id = dest_row.id returning * into dest_row;
  else
    update public.pantry_items set quantity = quantity + item_row.quantity, presence = (quantity + item_row.quantity) > 0,
      version = version + 1, confirmed_at = now(), confirmed_by = actor_id, updated_at = now()
    where id = dest_row.id returning * into dest_row;
  end if;
  update public.pantry_items set removed_at = now(), version = item_row.version + 1, updated_at = now()
  where id = item_row.id returning * into item_row;
  insert into public.pantry_movements (household_id, item_id, movement_type, actor, item_snapshot)
  values (dest_row.household_id, dest_row.id, 'correction', actor_id, jsonb_build_object('merged_from', item_row.id, 'quantity', dest_row.quantity, 'approximate_state', dest_row.approximate_state, 'version', dest_row.version));
  insert into public.pantry_movements (household_id, item_id, movement_type, actor, item_snapshot)
  values (item_row.household_id, item_row.id, 'removal', actor_id, jsonb_build_object('merged_into', dest_row.id, 'version', item_row.version));
  result := jsonb_build_object('item_id', dest_row.id, 'version', dest_row.version, 'presence', dest_row.presence, 'merged', true);
  perform private.pantry_store_result(item_row.household_id, actor_id, 'pantry_move_item', idempotency_key, result);
  return result;
end;
$$;

revoke all on function public.pantry_move_item(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.pantry_move_item(uuid, integer, text, text) to authenticated;
