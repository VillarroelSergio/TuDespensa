-- Fase 10: captura asistida de ticket. Las líneas revisadas por la persona se
-- añaden a la lista activa ya marcadas como compradas (un ticket registra lo que
-- YA se ha comprado), de modo que el cierre de compra existente (C2) las lleva a
-- la Despensa sin flujo nuevo. No hay OCR ni imagen aquí: la entrada es texto que
-- la persona pega y corrige antes de confirmar.

alter table public.shopping_items drop constraint shopping_items_source_check;
alter table public.shopping_items
  add constraint shopping_items_source_check
  check (source in ('manual', 'pantry', 'plan', 'ticket'));

-- `items`: [{ "name": "Tomate", "quantity": 500, "unit_code": "g" }, …]
-- Devuelve cuántos productos se han añadido de nuevo (los ya presentes no cuentan,
-- pero sí se marcan como comprados: el ticket confirma que están en casa).
create function public.shopping_add_ticket_items(items jsonb, idempotency_key text)
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

    insert into public.household_foods (household_id, name)
    values (household_id_value, food_name_value) on conflict do nothing;
    select id into food_id_value from public.household_foods
    where household_id = household_id_value and lower(name) = lower(food_name_value);

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

revoke all on function public.shopping_add_ticket_items(jsonb, text) from public, anon, authenticated;
grant execute on function public.shopping_add_ticket_items(jsonb, text) to authenticated;
