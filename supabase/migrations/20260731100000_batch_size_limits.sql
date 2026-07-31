-- Auditoría 2026-07-31 (M-1). Las RPC de lote comprobaban que llegara una
-- lista, pero no cuántos elementos traía. Cada elemento dispara además una
-- búsqueda difusa de alimento, así que una sola petición se convertía en tantas
-- resoluciones como elementos, todo dentro de una única transacción que
-- bloquea filas mientras dura. No hace falta mala fe: pegar un ticket muy largo
-- produce el mismo efecto.
--
-- El tope ya existe en las acciones de servidor, pero quien tenga la clave
-- anónima puede llamar a estas funciones directamente por PostgREST y saltarse
-- ese código. Aquí es donde el límite es de verdad.
--
-- Alcance: las dos funciones que multiplican por resolve_household_food. Las de
-- lote restantes (shopping_confirm_purchase, shopping_set_purchase_quantities,
-- plan_cook_meal) operan sobre filas que ya existen y están acotadas por el
-- propio hogar, así que su tamaño ya lo limita la lista de la compra.
--
-- Estas definiciones son copia literal de la versión vigente
-- (20260724110000_fix_shopping_zone_link.sql) con la guarda añadida: no
-- revierten ninguna corrección posterior.

create or replace function public.shopping_add_plan_items(items jsonb, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  list_id_value uuid;
  entry jsonb;
  food_name_value text;
  food_id_value uuid;
  quantity_value numeric;
  unit_value text;
  existing public.shopping_items;
  merged_quantity numeric;
  added integer := 0;
  request_hash_value text;
  replay jsonb;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'Invalid plan items' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(items) > 200 then
    raise exception 'Too many plan items in one request' using errcode = 'check_violation';
  end if;

  select household_id into household_id_value
  from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;

  request_hash_value := private.pantry_request_hash(
    'shopping_add_plan_items', jsonb_build_object('items', items)
  );
  replay := private.pantry_claim(
    household_id_value, actor_id, 'shopping_add_plan_items', idempotency_key, request_hash_value
  );
  if replay is not null then return replay; end if;

  insert into public.shopping_lists (household_id, status)
  values (household_id_value, 'active')
  on conflict (household_id, status) do update set updated_at = now()
  returning id into list_id_value;

  for entry in select * from jsonb_array_elements(items) loop
    food_name_value := trim(coalesce(entry->>'name', ''));
    -- Un nombre vacío o desmedido se ignora en vez de abortar la consolidación
    -- entera: el resto de ingredientes de la receta sí son utilizables.
    continue when char_length(food_name_value) not between 1 and 120;

    quantity_value := nullif(entry->>'quantity', '')::numeric;
    unit_value := nullif(entry->>'unit_code', '');
    if unit_value is not null and unit_value not in ('unit', 'g', 'kg', 'ml', 'l') then
      unit_value := null;
    end if;
    if quantity_value is null or quantity_value <= 0 or unit_value is null then
      quantity_value := null;
      unit_value := null;
    end if;

    food_id_value := private.resolve_household_food(household_id_value, food_name_value);

    select * into existing from public.shopping_items
    where shopping_list_id = list_id_value and food_id = food_id_value for update;

    if existing.id is null then
      insert into public.shopping_items
        (household_id, shopping_list_id, food_id, source, quantity, unit_code)
      values
        (household_id_value, list_id_value, food_id_value, 'plan', quantity_value, unit_value);
      added := added + 1;
    else
      -- Ya está en la lista: no se duplica, no se desmarca lo comprado y un
      -- producto manual conserva su origen. Solo se acumula la cantidad cuando
      -- las unidades miden lo mismo; si no, se deja sin cantidad antes que
      -- inventar una suma incorrecta.
      if existing.quantity is null or quantity_value is null
        or private.unit_dimension(existing.unit_code) is null
        or private.unit_dimension(existing.unit_code) <> private.unit_dimension(unit_value)
      then
        merged_quantity := null;
      else
        merged_quantity := private.unit_from_base(
          private.unit_to_base(existing.quantity, existing.unit_code)
            + private.unit_to_base(quantity_value, unit_value),
          existing.unit_code
        );
      end if;
      update public.shopping_items
      set quantity = merged_quantity,
          unit_code = case when merged_quantity is null then null else existing.unit_code end,
          updated_at = now()
      where id = existing.id;
    end if;
  end loop;

  result := jsonb_build_object('added', added);
  perform private.pantry_store_result(
    household_id_value, actor_id, 'shopping_add_plan_items', idempotency_key, result
  );
  return result;
end;
$$;

create or replace function public.shopping_add_ticket_items(items jsonb, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  list_id_value uuid;
  entry jsonb;
  food_name_value text;
  food_id_value uuid;
  quantity_value numeric;
  unit_value text;
  existing public.shopping_items;
  merged_quantity numeric;
  added integer := 0;
  request_hash_value text;
  replay jsonb;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'Invalid ticket items' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(items) > 200 then
    raise exception 'Too many ticket items in one request' using errcode = 'check_violation';
  end if;

  select household_id into household_id_value
  from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;

  request_hash_value := private.pantry_request_hash(
    'shopping_add_ticket_items', jsonb_build_object('items', items)
  );
  replay := private.pantry_claim(
    household_id_value, actor_id, 'shopping_add_ticket_items', idempotency_key, request_hash_value
  );
  if replay is not null then return replay; end if;

  insert into public.shopping_lists (household_id, status)
  values (household_id_value, 'active')
  on conflict (household_id, status) do update set updated_at = now()
  returning id into list_id_value;

  for entry in select * from jsonb_array_elements(items) loop
    food_name_value := trim(coalesce(entry->>'name', ''));
    -- Una línea vacía o desmedida se ignora en vez de abortar la importación
    -- entera: el resto del ticket sí es utilizable.
    continue when char_length(food_name_value) not between 1 and 120;

    quantity_value := nullif(entry->>'quantity', '')::numeric;
    unit_value := nullif(entry->>'unit_code', '');
    if unit_value is not null and unit_value not in ('unit', 'g', 'kg', 'ml', 'l') then
      unit_value := null;
    end if;
    if quantity_value is null or quantity_value <= 0 or unit_value is null then
      quantity_value := null;
      unit_value := null;
    end if;

    food_id_value := private.resolve_household_food(household_id_value, food_name_value);

    select * into existing from public.shopping_items
    where shopping_list_id = list_id_value and food_id = food_id_value for update;

    if existing.id is null then
      insert into public.shopping_items
        (household_id, shopping_list_id, food_id, source, is_purchased, quantity, unit_code)
      values
        (household_id_value, list_id_value, food_id_value, 'ticket', true, quantity_value, unit_value);
      added := added + 1;
    else
      -- Ya está en la lista: no se duplica y conserva su origen. El ticket lo
      -- marca como comprado. La cantidad solo se acumula si las unidades miden lo
      -- mismo; si no, se deja sin cantidad antes que inventar una suma incorrecta.
      if existing.quantity is null or quantity_value is null
        or private.unit_dimension(existing.unit_code) is null
        or private.unit_dimension(existing.unit_code) <> private.unit_dimension(unit_value)
      then
        merged_quantity := null;
      else
        merged_quantity := private.unit_from_base(
          private.unit_to_base(existing.quantity, existing.unit_code)
            + private.unit_to_base(quantity_value, unit_value),
          existing.unit_code
        );
      end if;
      update public.shopping_items
      set is_purchased = true,
          quantity = merged_quantity,
          unit_code = case when merged_quantity is null then null else existing.unit_code end,
          version = existing.version + 1,
          updated_at = now()
      where id = existing.id;
    end if;
  end loop;

  result := jsonb_build_object('added', added);
  perform private.pantry_store_result(
    household_id_value, actor_id, 'shopping_add_ticket_items', idempotency_key, result
  );
  return result;
end;
$$;
