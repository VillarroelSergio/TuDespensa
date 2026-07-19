-- El resultado JSONB no puede ser nulo; comprobarlo evita depender de FOUND
-- después de SELECT ... FOR UPDATE en una función PL/pgSQL invocada por RPC.
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

  if stored_result is not null then
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
