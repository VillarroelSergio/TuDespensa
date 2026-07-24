-- Reclamar la clave antes de mutar el ítem hace que dos reintentos concurrentes
-- compartan el mismo resultado sin conceder UPDATE sobre idempotency_keys.
create or replace function public.poc_consume_pantry_item(
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
  claimed_key boolean;
begin
  select household_id
  into target_household_id
  from public.poc_pantry_items
  where id = target_item_id;

  if target_household_id is null then
    raise exception 'Item is unavailable or inaccessible'
      using errcode = 'insufficient_privilege';
  end if;

  stored_result := jsonb_build_object(
    'item_id', target_item_id,
    'version', expected_version + 1,
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
  ) on conflict do nothing
  returning result into stored_result;

  claimed_key := found;

  if not claimed_key then
    select result
    into stored_result
    from public.poc_idempotency_keys
    where household_id = target_household_id
      and user_id = (select auth.uid())
      and operation = 'consume_pantry_item'
      and idempotency_key = request_key;

    if stored_result is null then
      raise exception 'Idempotency result is unavailable'
        using errcode = 'serialization_failure';
    end if;

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

  return stored_result;
end;
$$;
