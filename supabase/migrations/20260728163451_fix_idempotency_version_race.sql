-- Hotfix de estabilidad del piloto: tormenta de rollbacks en shopping_toggle_item
-- y pantry_adjust_item (~2.300 rollbacks/s, 260M+ rollbacks, 6M+ intentos de
-- insertar clave idempotente). Causa: estas RPC reclamaban (INSERT) la clave
-- idempotente ANTES de comprobar la versión optimista. Una petición con
-- versión obsoleta (doble clic, reintento, edición concurrente) insertaba la
-- clave, fallaba la comprobación de versión justo después y el RAISE abortaba
-- toda la transacción: la clave nunca llegaba a persistir, pero el INSERT +
-- rollback ya había generado WAL y bloqueado la fila. Con solicitudes
-- concurrentes repetidas esto se convierte en una tormenta de escritura sin
-- avance útil.
--
-- Corrección: reordenar a hash -> resultado idempotente previo (solo lectura,
-- sin insertar) -> validar acceso y versión -> reclamar/insertar la clave ->
-- mutar y guardar el resultado. Una versión obsoleta nunca llega a insertar
-- una clave. Un reintento genuino (misma clave, misma carga) se sirve desde
-- el resultado ya guardado aunque la versión actual haya avanzado por esa
-- misma mutación, sin pasar por la comprobación de versión.
--
-- Alcance: solo las RPC que reproducen el patrón defectuoso (reclaman antes
-- de comprobar versión): pantry_mutate (pantry_correct_item, pantry_adjust_item,
-- pantry_consume_item, pantry_mark_low, pantry_mark_out), shopping_toggle_item,
-- pantry_set_attention y shopping_remove_item. pantry_delete_item y
-- pantry_move_item ya comprueban versión antes de reclamar y no se tocan; las
-- RPC de lote (shopping_confirm_purchase y variantes, plan_cook_meal, ...) son
-- una acción explícita de un único clic, no reproducen la tormenta observada
-- y quedan fuera de este hotfix.

-- Consulta si ya existe un resultado idempotente para esta clave, sin
-- reclamarla (sin INSERT). Se llama antes de validar la versión para que un
-- reintento legítimo de una mutación ya aplicada se sirva desde aquí aunque
-- la versión actual ya haya avanzado por esa misma mutación.
create function private.pantry_peek_idempotent(
  household_id_value uuid, actor_id uuid, operation_name text, idempotency_key text, request_hash_value text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare stored_hash text; stored_result jsonb;
begin
  if idempotency_key is null or idempotency_key !~ '^[A-Za-z0-9._:-]{8,120}$' then
    raise exception 'Invalid idempotency key' using errcode = 'invalid_parameter_value';
  end if;
  select request_hash, result into stored_hash, stored_result from public.idempotency_keys
  where household_id = household_id_value and actor = actor_id and operation = operation_name and key = idempotency_key;
  if stored_hash is null then return null; end if;
  if stored_hash <> request_hash_value then
    raise exception 'Idempotency key was reused with a different request' using errcode = 'invalid_parameter_value';
  end if;
  return stored_result;
end;
$$;

revoke all on function private.pantry_peek_idempotent(uuid, uuid, text, text, text) from public;

create or replace function private.pantry_mutate(
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
  replay := private.pantry_peek_idempotent(item_row.household_id, actor_id, operation_name, idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  -- La versión se valida antes de reclamar: una petición obsoleta no debe
  -- insertar una clave que solo va a descartarse en el rollback.
  if item_row.version <> expected_version then raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure'; end if;
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
  if item_row.id is null then raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure'; end if;
  request_hash_value := private.pantry_request_hash('shopping_toggle_item', jsonb_build_object('item_id', item_id, 'version', version, 'purchased', purchased));
  replay := private.pantry_peek_idempotent(item_row.household_id, actor_id, 'shopping_toggle_item', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  if item_row.version <> version then raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure'; end if;
  replay := private.pantry_claim(item_row.household_id, actor_id, 'shopping_toggle_item', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  update public.shopping_items set is_purchased = purchased, version = item_row.version + 1, updated_at = now() where id = item_row.id returning * into item_row;
  result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'is_purchased', item_row.is_purchased);
  perform private.pantry_store_result(item_row.household_id, actor_id, 'shopping_toggle_item', idempotency_key, result);
  return result;
end;
$$;

create or replace function public.shopping_remove_item(item_id uuid, version integer, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); item_row public.shopping_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  select * into item_row from public.shopping_items where id = item_id and private.is_active_household_member(household_id, actor_id) for update;
  if item_row.id is null then raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure'; end if;
  request_hash_value := private.pantry_request_hash('shopping_remove_item', jsonb_build_object('item_id', item_id, 'version', version));
  replay := private.pantry_peek_idempotent(item_row.household_id, actor_id, 'shopping_remove_item', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  if item_row.version <> version then raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure'; end if;
  replay := private.pantry_claim(item_row.household_id, actor_id, 'shopping_remove_item', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  delete from public.shopping_items where id = item_row.id;
  result := jsonb_build_object('item_id', item_row.id, 'removed', true);
  perform private.pantry_store_result(item_row.household_id, actor_id, 'shopping_remove_item', idempotency_key, result);
  return result;
end;
$$;

create or replace function private.pantry_set_attention(
  item_id_value uuid,
  expected_version integer,
  attention_state_value text,
  idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  item_row public.pantry_items;
  request_hash_value text;
  replay jsonb;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if expected_version is null or expected_version < 1
     or attention_state_value not in ('none', 'low') then
    raise exception 'Invalid pantry attention payload' using errcode = 'invalid_parameter_value';
  end if;

  select * into item_row
  from public.pantry_items
  where id = item_id_value
    and private.is_active_household_member(household_id, actor_id)
  for update;
  if item_row.id is null then
    raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure';
  end if;

  request_hash_value := private.pantry_request_hash(
    'pantry_set_attention',
    jsonb_build_object('item_id', item_id_value, 'version', expected_version, 'attention_state', attention_state_value)
  );
  replay := private.pantry_peek_idempotent(item_row.household_id, actor_id, 'pantry_set_attention', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  if item_row.version <> expected_version then
    raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure';
  end if;
  replay := private.pantry_claim(item_row.household_id, actor_id, 'pantry_set_attention', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  update public.pantry_items
  set attention_state = attention_state_value,
      version = version + 1,
      confirmed_at = now(),
      confirmed_by = actor_id,
      updated_at = now()
  where id = item_row.id
  returning * into item_row;

  insert into public.pantry_movements (household_id, item_id, movement_type, actor, item_snapshot)
  values (
    item_row.household_id,
    item_row.id,
    'correction',
    actor_id,
    jsonb_build_object(
      'tracking_mode', item_row.tracking_mode,
      'approximate_state', item_row.approximate_state,
      'quantity', item_row.quantity,
      'unit_code', item_row.unit_code,
      'attention_state', item_row.attention_state,
      'version', item_row.version
    )
  );
  result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'presence', item_row.presence);
  perform private.pantry_store_result(item_row.household_id, actor_id, 'pantry_set_attention', idempotency_key, result);
  return result;
end;
$$;
