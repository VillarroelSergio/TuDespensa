-- Fase 7: cierre de compra. Los productos comprados se confirman en la despensa
-- (crear entrada o actualizar presencia/cantidad, con movimiento trazable) y
-- salen de la lista. La revisión C2 muestra antes qué cambiará.

-- Vista previa: por cada producto COMPRADO de la lista activa, qué pasará al
-- confirmar. Busca el alimento en la despensa (cualquier zona); si no está es un
-- alta, si está proyecta la cantidad resultante solo cuando las unidades miden
-- lo mismo (reutiliza los helpers de Fase 6).
create function public.shopping_checkout_preview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  list_id_value uuid;
  lines jsonb := '[]'::jsonb;
  item record;
  existing public.pantry_items;
  action_value text;
  result_qty numeric;
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
    select si.id, si.food_id, si.version, si.quantity, si.unit_code, hf.name
    from public.shopping_items si
    join public.household_foods hf on hf.id = si.food_id
    where si.shopping_list_id = list_id_value and si.is_purchased
    order by hf.name
  loop
    select * into existing from public.pantry_items
    where household_id = household_id_value and food_id = item.food_id
    order by presence desc, updated_at desc limit 1;

    if existing.id is null then
      action_value := 'add';
      result_qty := item.quantity;
    else
      action_value := 'update';
      if existing.quantity is not null and item.quantity is not null
        and private.unit_dimension(existing.unit_code) is not null
        and private.unit_dimension(existing.unit_code) = private.unit_dimension(item.unit_code)
      then
        result_qty := private.unit_from_base(
          private.unit_to_base(existing.quantity, existing.unit_code)
            + private.unit_to_base(item.quantity, item.unit_code),
          existing.unit_code);
      else
        -- Sin suma posible: solo se refresca la presencia, la cantidad no cambia.
        result_qty := existing.quantity;
      end if;
    end if;

    lines := lines || jsonb_build_object(
      'item_id', item.id,
      'version', item.version,
      'name', item.name,
      'action', action_value,
      'from_quantity', case when action_value = 'update' then existing.quantity end,
      'from_unit', case when action_value = 'update' then existing.unit_code end,
      'to_quantity', result_qty,
      'to_unit', case when action_value = 'update' then existing.unit_code else item.unit_code end
    );
  end loop;
  return lines;
end;
$$;

-- `item_versions`: [{ "item_id": uuid, "version": int }, …] los productos que la
-- persona revisó. Confirmar es idempotente y, si alguno cambió de versión o dejó
-- de estar comprado (otro integrante), aborta entero (CONFLICT) para recargar sin
-- aplicar a medias. Devuelve { confirmed }.
create function public.shopping_confirm_purchase(item_versions jsonb, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  list_id_value uuid;
  pantry_location_id uuid;
  entry jsonb;
  shop public.shopping_items;
  existing public.pantry_items;
  new_qty numeric;
  new_unit text;
  new_mode text;
  new_state text;
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
      -- Nuevo en la despensa: con cantidad si la compra la trae, si no presencia aprox.
      if shop.quantity is not null and shop.unit_code = 'unit' then
        new_mode := 'units'; new_qty := shop.quantity; new_unit := 'unit'; new_state := null;
      elsif shop.quantity is not null and shop.unit_code in ('g', 'kg', 'ml', 'l') then
        new_mode := 'measure'; new_qty := shop.quantity; new_unit := shop.unit_code; new_state := null;
      else
        new_mode := 'approximate'; new_qty := null; new_unit := null; new_state := 'some';
      end if;
      insert into public.pantry_items
        (household_id, location_id, food_id, tracking_mode, approximate_state,
         quantity, unit_code, presence, entered_at, confirmed_at, confirmed_by)
      values
        (household_id_value, pantry_location_id, shop.food_id, new_mode, new_state,
         new_qty, new_unit, true, now(), now(), actor_id)
      returning * into existing;
    elsif existing.tracking_mode in ('units', 'measure') and existing.quantity is not null
      and shop.quantity is not null
      and private.unit_dimension(existing.unit_code) is not null
      and private.unit_dimension(existing.unit_code) = private.unit_dimension(shop.unit_code)
    then
      -- Ambas miden lo mismo: sumamos.
      new_qty := private.unit_from_base(
        private.unit_to_base(existing.quantity, existing.unit_code)
          + private.unit_to_base(shop.quantity, shop.unit_code),
        existing.unit_code);
      update public.pantry_items
      set quantity = new_qty, presence = true, version = version + 1,
          confirmed_at = now(), confirmed_by = actor_id, updated_at = now()
      where id = existing.id returning * into existing;
    else
      -- Sin suma posible: solo presencia. Un aproximado 'out'/'low' vuelve a 'some';
      -- una medida conserva su cantidad.
      update public.pantry_items
      set presence = true,
          approximate_state = case when tracking_mode = 'approximate' then 'some' else approximate_state end,
          version = version + 1, confirmed_at = now(), confirmed_by = actor_id, updated_at = now()
      where id = existing.id returning * into existing;
    end if;

    insert into public.pantry_movements
      (household_id, item_id, movement_type, actor, quantity_delta, item_snapshot)
    values (household_id_value, existing.id, 'entry', actor_id, shop.quantity,
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

revoke all on function public.shopping_checkout_preview(),
  public.shopping_confirm_purchase(jsonb, text) from public, anon, authenticated;
grant execute on function public.shopping_checkout_preview(),
  public.shopping_confirm_purchase(jsonb, text) to authenticated;
