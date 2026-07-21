-- Fase 3, bloque 2: la atención es independiente de la precisión del inventario.
alter table public.pantry_items
  add column attention_state text not null default 'none'
    check (attention_state in ('none', 'low'));

create function private.pantry_set_attention(
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
  replay := private.pantry_claim(item_row.household_id, actor_id, 'pantry_set_attention', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  if item_row.version <> expected_version then
    raise exception 'Item was changed, unavailable, or inaccessible' using errcode = 'serialization_failure';
  end if;

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

create function public.pantry_set_attention(
  item_id uuid,
  version integer,
  attention_state text,
  idempotency_key text
) returns jsonb language sql security definer set search_path = '' as $$
  select private.pantry_set_attention(item_id, version, attention_state, idempotency_key);
$$;

revoke all on function private.pantry_set_attention(uuid, integer, text, text) from public;
revoke all on function public.pantry_set_attention(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.pantry_set_attention(uuid, integer, text, text) to authenticated;
