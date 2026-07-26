-- C2 pide cuántas unidades físicas se han comprado antes de llevarlas a
-- Despensa. La lista conserva una única representación para el cierre: uds.
create or replace function public.shopping_set_purchase_quantities(item_quantities jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  list_id_value uuid;
  entry jsonb;
  shop public.shopping_items;
  updated_item record;
  result jsonb := '[]'::jsonb;
  requested_quantity numeric;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if item_quantities is null or jsonb_typeof(item_quantities) <> 'array'
    or jsonb_array_length(item_quantities) = 0 then
    raise exception 'Invalid purchase quantities payload' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value
  from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;
  select id into list_id_value from public.shopping_lists
  where household_id = household_id_value and status = 'active' limit 1;
  if list_id_value is null then
    raise exception 'No active shopping list' using errcode = 'serialization_failure';
  end if;

  for entry in select * from jsonb_array_elements(item_quantities) loop
    requested_quantity := (entry->>'quantity')::numeric;
    if requested_quantity is null or requested_quantity <= 0 then
      raise exception 'Purchase quantity must be greater than zero' using errcode = 'invalid_parameter_value';
    end if;
    select * into shop from public.shopping_items
    where id = (entry->>'item_id')::uuid
      and shopping_list_id = list_id_value
    for update;
    if shop.id is null or not shop.is_purchased
      or shop.version <> (entry->>'version')::integer then
      raise exception 'Shopping item changed during checkout' using errcode = 'serialization_failure';
    end if;
    update public.shopping_items
    set quantity = requested_quantity,
        unit_code = 'unit',
        version = version + 1
    where id = shop.id
    returning id, version into updated_item;
    result := result || jsonb_build_array(
      jsonb_build_object('item_id', updated_item.id, 'version', updated_item.version)
    );
  end loop;
  return jsonb_build_object('items', result);
end;
$$;

revoke all on function public.shopping_set_purchase_quantities(jsonb)
  from public, anon, authenticated;
grant execute on function public.shopping_set_purchase_quantities(jsonb)
  to authenticated;
