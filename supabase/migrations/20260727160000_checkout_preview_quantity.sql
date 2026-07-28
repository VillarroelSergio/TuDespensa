-- Bug reportado: al importar un ticket con "6 unidades" de leche, la lista de
-- Compra ya guardaba bien esa cantidad (se ve tachada "6 uds." al marcarla
-- comprada), pero "Revisa tu compra" no la leía: el campo Unidades arrancaba
-- siempre en 1, y si la persona no lo volvía a escribir a mano, esa compra se
-- confirmaba con 1 y pisaba el 6 real. La cantidad ya guardada en el artículo
-- ahora viaja también en la vista previa, para que la pantalla la use como
-- valor inicial en vez de asumir 1 siempre.
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
    select si.id, si.food_id, si.version, si.quantity, hf.name,
      coalesce(hf.default_zone, catalog.default_zone) as default_zone
    from public.shopping_items si
    join public.household_foods hf on hf.id = si.food_id
    left join public.catalog_foods catalog on catalog.id = hf.catalog_food_id
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
      'action', case when existing.id is null then 'add' else 'restore' end,
      'suggested_zone', case when existing.id is null then item.default_zone end,
      'quantity', item.quantity
    );
  end loop;
  return lines;
end;
$$;
