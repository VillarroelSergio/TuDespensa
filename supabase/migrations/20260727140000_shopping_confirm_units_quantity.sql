-- Hasta ahora, confirmar una compra siempre metía el producto en la despensa
-- marcado solo como "Algo" (tracking_mode 'approximate'), descartando las
-- unidades que la persona ajustó en "Revisa tu compra" (shopping_items.quantity,
-- ya guardadas por shopping_set_purchase_quantities). Sin esa cantidad exacta,
-- "cocinar" nunca podía restar del stock real: solo ofrecía bajar un peldaño
-- cualitativo (Algo → Queda poco). Ahora la compra pasa la cantidad comprada
-- a la despensa como unidades exactas, para que cocinar reste de ahí.
--
-- ponytail: unit_code siempre es 'unit' (shopping_set_purchase_quantities no
-- admite peso/volumen todavía), así que esto encaja bien con ingredientes de
-- receta contables (huevos, dientes de ajo, latas...). Un ingrediente en
-- gramos emparejado con un producto comprado "por unidades" (p. ej. una bolsa
-- de lentejas) seguirá dando un descuento aproximado, no una conversión real
-- peso↔bolsa: subir a que la compra también admita peso/volumen si eso da
-- descuentos confusos en la práctica.
create or replace function public.shopping_confirm_purchase(item_versions jsonb, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  list_id_value uuid;
  entry jsonb;
  shop public.shopping_items;
  existing public.pantry_items;
  entry_zone text;
  catalog_zone text;
  location_id_value uuid;
  purchased_quantity numeric;
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

    purchased_quantity := coalesce(shop.quantity, 1);

    if existing.id is null then
      entry_zone := nullif(entry->>'zone', '');
      if entry_zone is not null and entry_zone not in ('fridge', 'freezer', 'pantry', 'cleaning') then
        raise exception 'Invalid pantry zone' using errcode = 'invalid_parameter_value';
      end if;
      if entry_zone is not null then
        -- Elección a mano: se recuerda para la próxima compra de este producto.
        update public.household_foods set default_zone = entry_zone
        where id = shop.food_id and default_zone is distinct from entry_zone;
      else
        select coalesce(hf.default_zone, catalog.default_zone) into catalog_zone
        from public.household_foods as hf
        left join public.catalog_foods as catalog on catalog.id = hf.catalog_food_id
        where hf.id = shop.food_id;
        entry_zone := coalesce(catalog_zone, 'pantry');
      end if;
      select id into location_id_value from public.pantry_locations
      where household_id = household_id_value and kind = entry_zone;

      -- Nuevo en la despensa: unidades exactas, tal como se compraron.
      insert into public.pantry_items
        (household_id, location_id, food_id, tracking_mode, approximate_state,
         quantity, unit_code, presence, entered_at, confirmed_at, confirmed_by)
      values
        (household_id_value, location_id_value, shop.food_id, 'units', null,
         purchased_quantity, 'unit', true, now(), now(), actor_id)
      returning * into existing;
    else
      -- Ya existía: si ya se llevaba la cuenta por unidades, se suma lo comprado;
      -- si estaba en "Algo/Queda poco/Agotado" (o por peso), se sustituye por el
      -- conteo exacto de esta compra. La zona no cambia en una reposición.
      update public.pantry_items
      set tracking_mode = 'units',
          approximate_state = null,
          quantity = case
            when tracking_mode = 'units' then coalesce(quantity, 0) + purchased_quantity
            else purchased_quantity
          end,
          unit_code = 'unit',
          presence = true,
          version = version + 1, confirmed_at = now(), confirmed_by = actor_id, updated_at = now()
      where id = existing.id returning * into existing;
    end if;

    insert into public.pantry_movements
      (household_id, item_id, movement_type, actor, quantity_delta, item_snapshot)
    values (household_id_value, existing.id, 'entry', actor_id, purchased_quantity,
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
