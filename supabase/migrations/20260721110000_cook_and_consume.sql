-- Fase 8: cocinar y consumo asistido. Desde una comida planificada se marca como
-- cocinada y se descuentan de la despensa los ingredientes conocidos. La revisión
-- (P-cook) propone los descuentos; aquí solo se aplican los que la persona
-- confirmó o corrigió, con movimiento trazable y control optimista de versión.

-- Marca de cocinado sobre el hueco. No hay tabla nueva: una comida planificada se
-- cocina como mucho una vez, así que basta un sello temporal en la propia fila.
alter table public.planned_meals
  add column cooked_at timestamptz,
  add column cooked_by uuid;

-- `consumptions`: [{ item_id, version, tracking_mode, approximate_state, quantity,
-- unit_code }, …] — el ESTADO RESULTANTE de cada producto tras cocinar, tal y como
-- la persona lo confirmó o corrigió. Marca la comida como cocinada y aplica cada
-- descuento como movimiento `consumption`. Idempotente por lote (`pantry_claim`);
-- si algún producto cambió de versión (otro integrante) o la comida ya está
-- cocinada, aborta entero (CONFLICT) para no descontar a medias. Devuelve
-- { cooked, consumed }.
create function public.plan_cook_meal(
  meal_date_value date, meal_type_value text, consumptions jsonb, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  meal_row public.planned_meals;
  entry jsonb;
  item public.pantry_items;
  target_mode text; target_state text; target_qty numeric; target_unit text;
  consumed_delta numeric;
  consumed integer := 0;
  request_hash_value text;
  replay jsonb;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if meal_date_value is null or meal_type_value is null or meal_type_value not in ('lunch', 'dinner')
    or consumptions is null or jsonb_typeof(consumptions) <> 'array' then
    raise exception 'Invalid cook payload' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value
  from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;

  request_hash_value := private.pantry_request_hash('plan_cook_meal', jsonb_build_object(
    'meal_date', meal_date_value, 'meal_type', meal_type_value, 'consumptions', consumptions));
  replay := private.pantry_claim(
    household_id_value, actor_id, 'plan_cook_meal', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  -- El hueco debe seguir existiendo y no estar ya cocinado: si otro integrante lo
  -- cocinó o lo vació, recargamos en vez de descontar dos veces.
  select * into meal_row from public.planned_meals
  where household_id = household_id_value
    and meal_date = meal_date_value and meal_type = meal_type_value
  for update;
  if meal_row.id is null then
    raise exception 'Planned meal is gone' using errcode = 'serialization_failure';
  end if;
  if meal_row.cooked_at is not null then
    raise exception 'Planned meal was already cooked' using errcode = 'serialization_failure';
  end if;

  for entry in select * from jsonb_array_elements(consumptions) loop
    select * into item from public.pantry_items
    where id = (entry->>'item_id')::uuid and household_id = household_id_value
    for update;
    -- Debe existir y conservar la versión revisada; si no, alguien lo cambió.
    if item.id is null or item.version <> (entry->>'version')::integer then
      raise exception 'Pantry item changed during cooking' using errcode = 'serialization_failure';
    end if;

    target_mode := entry->>'tracking_mode';
    target_state := entry->>'approximate_state';
    target_qty := (entry->>'quantity')::numeric;
    target_unit := entry->>'unit_code';

    -- Cocinar no cambia la forma de medir un producto ni lo hace aparecer: el
    -- modo se conserva y una cantidad nunca sube (cocinar solo consume).
    if target_mode is distinct from item.tracking_mode then
      raise exception 'Cooking cannot change how an item is tracked' using errcode = 'check_violation';
    end if;
    if (target_mode = 'approximate' and (target_qty is not null or target_unit is not null or target_state not in ('plenty', 'some', 'low', 'out')))
       or (target_mode = 'units' and (target_qty is null or target_qty < 0 or target_unit <> 'unit' or target_state is not null))
       or (target_mode = 'measure' and (target_qty is null or target_qty < 0 or target_unit not in ('g', 'kg', 'ml', 'l') or target_state is not null)) then
      raise exception 'Invalid pantry tracking payload' using errcode = 'check_violation';
    end if;
    if target_qty is not null and item.quantity is not null and target_qty > item.quantity then
      raise exception 'Cooking cannot increase a quantity' using errcode = 'check_violation';
    end if;

    consumed_delta := case
      when target_qty is not null and item.quantity is not null then target_qty - item.quantity end;

    update public.pantry_items set
      tracking_mode = target_mode, approximate_state = target_state,
      quantity = target_qty, unit_code = target_unit,
      presence = case when target_mode = 'approximate' then target_state <> 'out' else target_qty > 0 end,
      version = version + 1, confirmed_at = now(), confirmed_by = actor_id, updated_at = now()
    where id = item.id returning * into item;

    insert into public.pantry_movements
      (household_id, item_id, movement_type, actor, quantity_delta, item_snapshot)
    values (household_id_value, item.id, 'consumption', actor_id, consumed_delta,
      jsonb_build_object('tracking_mode', item.tracking_mode, 'approximate_state', item.approximate_state,
        'quantity', item.quantity, 'unit_code', item.unit_code, 'version', item.version,
        'source', 'meal_cooked', 'recipe_id', meal_row.recipe_id));
    consumed := consumed + 1;
  end loop;

  update public.planned_meals
  set cooked_at = now(), cooked_by = actor_id, updated_at = now()
  where id = meal_row.id;

  result := jsonb_build_object('cooked', true, 'consumed', consumed);
  perform private.pantry_store_result(
    household_id_value, actor_id, 'plan_cook_meal', idempotency_key, result);
  return result;
end;
$$;

revoke all on function public.plan_cook_meal(date, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.plan_cook_meal(date, text, jsonb, text) to authenticated;
