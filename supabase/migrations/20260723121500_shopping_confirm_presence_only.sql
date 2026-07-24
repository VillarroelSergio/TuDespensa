-- Validación con el hogar fundador: confirmar la compra copiaba las
-- cantidades exactas de la receta a la despensa (p. ej. "400 g", "2 uds."),
-- pero la despensa solo necesita saber qué hay y qué no. La compra sigue
-- guardando cantidades (son útiles para planificar, p. ej. "12 huevos"); solo
-- deja de proyectarlas sobre la despensa al confirmar.
create or replace function public.shopping_checkout_preview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  list_id_value uuid;
  lines jsonb := '[]'::jsonb;
  item record;
  existing public.pantry_items;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  select household_id into household_id_value
  from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then return lines; end if;

  select id into list_id_value from public.shopping_lists
  where household_id = household_id_value and status = 'active' limit 1;
  if list_id_value is null then return lines; end if;

  for item in
    select si.id, si.food_id, si.version, hf.name
    from public.shopping_items si
    join public.household_foods hf on hf.id = si.food_id
    where si.shopping_list_id = list_id_value and si.is_purchased
    order by hf.name
  loop
    select * into existing from public.pantry_items
    where household_id = household_id_value and food_id = item.food_id
    order by presence desc, updated_at desc limit 1;

    lines := lines || jsonb_build_object(
      'item_id', item.id,
      'version', item.version,
      'name', item.name,
      'action', case when existing.id is null then 'add' else 'restore' end
    );
  end loop;
  return lines;
end;
$$;

create or replace function public.shopping_confirm_purchase(item_versions jsonb, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  list_id_value uuid;
  pantry_location_id uuid;
  entry jsonb;
  shop public.shopping_items;
  existing public.pantry_items;
  confirmed integer := 0;
  request_hash_value text;
  replay jsonb;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if item_versions is null or jsonb_typeof(item_versions) <> 'array'
    or jsonb_array_length(item_versions) = 0 then
    raise exception 'Invalid checkout payload' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value
  from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;

  request_hash_value := private.pantry_request_hash(
    'shopping_confirm_purchase', jsonb_build_object('items', item_versions));
  replay := private.pantry_claim(
    household_id_value, actor_id, 'shopping_confirm_purchase', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  select id into list_id_value from public.shopping_lists
  where household_id = household_id_value and status = 'active' limit 1;
  if list_id_value is null then
    raise exception 'No active shopping list' using errcode = 'serialization_failure';
  end if;

  select id into pantry_location_id from public.pantry_locations
  where household_id = household_id_value and kind = 'pantry';

  for entry in select * from jsonb_array_elements(item_versions) loop
    select * into shop from public.shopping_items
    where id = (entry->>'item_id')::uuid and shopping_list_id = list_id_value for update;
    -- Debe seguir comprado y con la versión revisada; si no, alguien lo cambió.
    if shop.id is null or not shop.is_purchased
      or shop.version <> (entry->>'version')::integer then
      raise exception 'Shopping item changed during checkout' using errcode = 'serialization_failure';
    end if;

    select * into existing from public.pantry_items
    where household_id = household_id_value and food_id = shop.food_id
    order by presence desc, updated_at desc limit 1 for update;

    if existing.id is null then
      -- Nuevo en la despensa: solo presencia, sin cantidad (la compra la
      -- conserva por su cuenta, no se traslada).
      insert into public.pantry_items
        (household_id, location_id, food_id, tracking_mode, approximate_state,
         quantity, unit_code, presence, entered_at, confirmed_at, confirmed_by)
      values
        (household_id_value, pantry_location_id, shop.food_id, 'approximate', 'some',
         null, null, true, now(), now(), actor_id)
      returning * into existing;
    else
      -- Ya existía (aunque estuviera "se terminó" o "queda poco"): se limita a
      -- refrescar la presencia, nunca a cargar una cantidad.
      update public.pantry_items
      set tracking_mode = 'approximate', approximate_state = 'some', presence = true,
          version = version + 1, confirmed_at = now(), confirmed_by = actor_id, updated_at = now()
      where id = existing.id returning * into existing;
    end if;

    insert into public.pantry_movements
      (household_id, item_id, movement_type, actor, quantity_delta, item_snapshot)
    values (household_id_value, existing.id, 'entry', actor_id, null,
      jsonb_build_object('tracking_mode', existing.tracking_mode, 'approximate_state',
        existing.approximate_state, 'quantity', existing.quantity, 'unit_code', existing.unit_code,
        'version', existing.version, 'source', 'shopping_checkout'));

    delete from public.shopping_items where id = shop.id;
    confirmed := confirmed + 1;
  end loop;

  result := jsonb_build_object('confirmed', confirmed);
  perform private.pantry_store_result(
    household_id_value, actor_id, 'shopping_confirm_purchase', idempotency_key, result);
  return result;
end;
$$;
