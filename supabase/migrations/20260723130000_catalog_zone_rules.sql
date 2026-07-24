-- Compra inteligente: al confirmar una compra, cada producto nuevo se
-- guardaba siempre en Despensa sin mirar qué tipo de alimento es. Se rellena
-- el catálogo (antes vacío) con productos estándar de un hogar español, cada
-- uno con su zona por defecto, y se usa esa zona al dar de alta. Cuando el
-- producto no está en el catálogo (no hay coincidencia de confianza), la
-- persona elige la zona a mano en la revisión de compra.

alter table public.catalog_foods drop constraint catalog_foods_category_check;
alter table public.catalog_foods add constraint catalog_foods_category_check
  check (category in ('produce', 'dairy', 'protein', 'bakery', 'frozen', 'dry', 'cleaning', 'other'));

alter table public.catalog_foods add column default_zone text not null default 'pantry'
  check (default_zone in ('fridge', 'freezer', 'pantry', 'cleaning'));

-- Catálogo base. La zona no siempre se deduce de la categoría (patata, cebolla,
-- ajo y plátano son 'produce' pero van en Despensa, no en el frigorífico), así
-- que se fija producto a producto en vez de con una regla única por categoría.
insert into public.catalog_foods (canonical_name, category, default_zone, consume_soon_after) values
  ('Leche', 'dairy', 'fridge', '7 days'),
  ('Yogur', 'dairy', 'fridge', '10 days'),
  ('Queso rallado', 'dairy', 'fridge', '5 days'),
  ('Queso curado', 'dairy', 'fridge', null),
  ('Mantequilla', 'dairy', 'fridge', '20 days'),
  ('Nata para cocinar', 'dairy', 'fridge', '5 days'),
  ('Huevos', 'protein', 'fridge', '21 days'),
  ('Pollo', 'protein', 'fridge', '2 days'),
  ('Carne picada', 'protein', 'fridge', '2 days'),
  ('Filetes de ternera', 'protein', 'fridge', '3 days'),
  ('Jamón cocido', 'protein', 'fridge', '5 days'),
  ('Jamón serrano', 'protein', 'fridge', '10 days'),
  ('Merluza', 'protein', 'fridge', '2 days'),
  ('Salmón', 'protein', 'fridge', '2 days'),
  ('Tofu', 'protein', 'fridge', '5 days'),
  ('Tomate', 'produce', 'fridge', '7 days'),
  ('Lechuga', 'produce', 'fridge', '5 days'),
  ('Zanahoria', 'produce', 'fridge', '14 days'),
  ('Pimiento', 'produce', 'fridge', '7 days'),
  ('Champiñones', 'produce', 'fridge', '5 days'),
  ('Fresas', 'produce', 'fridge', '4 days'),
  ('Uvas', 'produce', 'fridge', '7 days'),
  ('Patata', 'produce', 'pantry', null),
  ('Cebolla', 'produce', 'pantry', null),
  ('Ajo', 'produce', 'pantry', null),
  ('Calabaza', 'produce', 'pantry', null),
  ('Plátano', 'produce', 'pantry', null),
  ('Guisantes congelados', 'frozen', 'freezer', null),
  ('Pizza congelada', 'frozen', 'freezer', null),
  ('Helado', 'frozen', 'freezer', null),
  ('Croquetas congeladas', 'frozen', 'freezer', null),
  ('Pescado congelado', 'frozen', 'freezer', null),
  ('Patatas fritas congeladas', 'frozen', 'freezer', null),
  ('Verdura congelada', 'frozen', 'freezer', null),
  ('Pan', 'bakery', 'pantry', '3 days'),
  ('Pan de molde', 'bakery', 'pantry', '7 days'),
  ('Bollería', 'bakery', 'pantry', '4 days'),
  ('Arroz', 'dry', 'pantry', null),
  ('Pasta', 'dry', 'pantry', null),
  ('Garbanzos de bote', 'dry', 'pantry', null),
  ('Lentejas de bote', 'dry', 'pantry', null),
  ('Aceite de oliva', 'dry', 'pantry', null),
  ('Atún en lata', 'dry', 'pantry', null),
  ('Tomate frito', 'dry', 'pantry', null),
  ('Azúcar', 'dry', 'pantry', null),
  ('Sal', 'dry', 'pantry', null),
  ('Harina', 'dry', 'pantry', null),
  ('Galletas', 'dry', 'pantry', null),
  ('Café', 'dry', 'pantry', null),
  ('Cereales', 'dry', 'pantry', null),
  ('Lejía', 'cleaning', 'cleaning', null),
  ('Detergente de lavadora', 'cleaning', 'cleaning', null),
  ('Detergente lavavajillas', 'cleaning', 'cleaning', null),
  ('Papel higiénico', 'cleaning', 'cleaning', null),
  ('Papel de cocina', 'cleaning', 'cleaning', null),
  ('Bolsas de basura', 'cleaning', 'cleaning', null),
  ('Suavizante', 'cleaning', 'cleaning', null),
  ('Friegasuelos', 'cleaning', 'cleaning', null);

-- Alias: variantes reales que la gente escribe (marcas, formatos, adjetivos).
-- La similitud aproximada ya cubre plurales y erratas leves; esto cubre lo que
-- esa comparación no acerca lo suficiente.
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'leche entera', 'leche semidesnatada', 'leche desnatada', 'leche sin lactosa']) as alias
where cf.canonical_name = 'Leche';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'yogures', 'yogur natural', 'yogur griego', 'danone']) as alias
where cf.canonical_name = 'Yogur';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'queso para gratinar', 'queso rallado mozzarella']) as alias
where cf.canonical_name = 'Queso rallado';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'huevo', 'docena de huevos', 'huevos camperos']) as alias
where cf.canonical_name = 'Huevos';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'pechuga de pollo', 'muslos de pollo', 'contramuslos de pollo', 'pollo entero']) as alias
where cf.canonical_name = 'Pollo';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'carne picada de ternera', 'carne picada mixta']) as alias
where cf.canonical_name = 'Carne picada';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'jamón york', 'fiambre de jamón']) as alias
where cf.canonical_name = 'Jamón cocido';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'jamón ibérico']) as alias
where cf.canonical_name = 'Jamón serrano';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'filetes de merluza']) as alias
where cf.canonical_name = 'Merluza';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'tomates', 'tomate rama', 'tomate pera', 'tomate de ensalada']) as alias
where cf.canonical_name = 'Tomate';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'ensalada de bolsa', 'lechuga iceberg']) as alias
where cf.canonical_name = 'Lechuga';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'zanahorias', 'zanahoria baby']) as alias
where cf.canonical_name = 'Zanahoria';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'pimientos', 'pimiento rojo', 'pimiento verde']) as alias
where cf.canonical_name = 'Pimiento';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'champiñon', 'champis', 'setas']) as alias
where cf.canonical_name = 'Champiñones';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'patatas', 'patata para freír', 'patatas nuevas']) as alias
where cf.canonical_name = 'Patata';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'cebollas', 'cebolla dulce', 'cebolla morada']) as alias
where cf.canonical_name = 'Cebolla';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'ajos', 'cabeza de ajo']) as alias
where cf.canonical_name = 'Ajo';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'platano', 'platanos', 'plátanos', 'banana']) as alias
where cf.canonical_name = 'Plátano';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'guisantes', 'bolsa de guisantes']) as alias
where cf.canonical_name = 'Guisantes congelados';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'pizza', 'pizzas congeladas']) as alias
where cf.canonical_name = 'Pizza congelada';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'helados', 'tarrina de helado']) as alias
where cf.canonical_name = 'Helado';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'croquetas']) as alias
where cf.canonical_name = 'Croquetas congeladas';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'merluza congelada', 'pescado empanado', 'filetes de pescado congelado']) as alias
where cf.canonical_name = 'Pescado congelado';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'patatas fritas', 'patatas congeladas']) as alias
where cf.canonical_name = 'Patatas fritas congeladas';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'verduras congeladas', 'menestra congelada']) as alias
where cf.canonical_name = 'Verdura congelada';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'barra de pan', 'pan baguette']) as alias
where cf.canonical_name = 'Pan';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'pan de sandwich', 'pan bimbo']) as alias
where cf.canonical_name = 'Pan de molde';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'croissants', 'napolitanas']) as alias
where cf.canonical_name = 'Bollería';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'arroz redondo', 'arroz bomba', 'arroz basmati']) as alias
where cf.canonical_name = 'Arroz';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'macarrones', 'espaguetis', 'fideos', 'spaghetti']) as alias
where cf.canonical_name = 'Pasta';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'garbanzos', 'garbanzos cocidos', 'bote de garbanzos']) as alias
where cf.canonical_name = 'Garbanzos de bote';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'lentejas', 'lentejas cocidas', 'bote de lentejas']) as alias
where cf.canonical_name = 'Lentejas de bote';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'aceite', 'aceite virgen extra', 'aove']) as alias
where cf.canonical_name = 'Aceite de oliva';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'atún', 'atun', 'latas de atún']) as alias
where cf.canonical_name = 'Atún en lata';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'tomate triturado', 'salsa de tomate']) as alias
where cf.canonical_name = 'Tomate frito';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'azucar', 'azúcar blanco', 'azúcar moreno']) as alias
where cf.canonical_name = 'Azúcar';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'sal fina', 'sal gorda']) as alias
where cf.canonical_name = 'Sal';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'harina de trigo', 'harina integral']) as alias
where cf.canonical_name = 'Harina';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'galletas maría', 'galletas digestive']) as alias
where cf.canonical_name = 'Galletas';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'café molido', 'café en grano', 'cápsulas de café']) as alias
where cf.canonical_name = 'Café';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'cereales de desayuno', 'copos de avena']) as alias
where cf.canonical_name = 'Cereales';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'lejia', 'lejía normal']) as alias
where cf.canonical_name = 'Lejía';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'detergente para la ropa', 'detergente de ropa']) as alias
where cf.canonical_name = 'Detergente de lavadora';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'pastillas lavavajillas', 'detergente para platos']) as alias
where cf.canonical_name = 'Detergente lavavajillas';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'papel wc', 'rollos de papel higiénico']) as alias
where cf.canonical_name = 'Papel higiénico';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'rollo de cocina']) as alias
where cf.canonical_name = 'Papel de cocina';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'bolsas basura']) as alias
where cf.canonical_name = 'Bolsas de basura';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'suavizante para la ropa']) as alias
where cf.canonical_name = 'Suavizante';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'fregasuelos', 'limpiador de suelos']) as alias
where cf.canonical_name = 'Friegasuelos';

-- Resuelve un nombre escrito contra el catálogo: exacto, alias, o similitud
-- aproximada (mismo umbral que ya se usa entre alimentos de la casa). Null si
-- no hay ninguna coincidencia razonable: ese producto se queda sin categoría y
-- la zona se pedirá a mano.
create function private.resolve_catalog_food(food_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  normalized text := lower(trim(food_name));
  catalog_id uuid;
begin
  select id into catalog_id from public.catalog_foods
  where lower(canonical_name) = normalized;
  if catalog_id is not null then return catalog_id; end if;

  select catalog_food_id into catalog_id from public.food_aliases
  where lower(alias) = normalized;
  if catalog_id is not null then return catalog_id; end if;

  select id into catalog_id from public.catalog_foods
  where extensions.similarity(lower(canonical_name), normalized) > 0.4
  order by extensions.similarity(lower(canonical_name), normalized) desc
  limit 1;
  if catalog_id is not null then return catalog_id; end if;

  select catalog_food_id into catalog_id from public.food_aliases
  where extensions.similarity(lower(alias), normalized) > 0.4
  order by extensions.similarity(lower(alias), normalized) desc
  limit 1;
  return catalog_id;
end;
$$;

revoke all on function private.resolve_catalog_food(text) from public, anon, authenticated;

-- Igual que antes, pero ahora también intenta enlazar el alimento de la casa
-- con el catálogo (al crearlo, o a posteriori si ya existía sin enlazar).
create or replace function private.resolve_household_food(household_id_value uuid, food_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  normalized text := lower(trim(food_name));
  food_id_value uuid;
begin
  select id into food_id_value from public.household_foods
  where household_id = household_id_value and lower(name) = normalized;
  if food_id_value is not null then
    update public.household_foods set catalog_food_id = private.resolve_catalog_food(food_name)
    where id = food_id_value and catalog_food_id is null;
    return food_id_value;
  end if;

  select food_id into food_id_value from public.household_food_aliases
  where household_id = household_id_value and lower(alias) = normalized;
  if food_id_value is not null then
    update public.household_foods set catalog_food_id = private.resolve_catalog_food(food_name)
    where id = food_id_value and catalog_food_id is null;
    return food_id_value;
  end if;

  select id into food_id_value from public.household_foods
  where household_id = household_id_value
    and extensions.similarity(lower(name), normalized) > 0.4
  order by extensions.similarity(lower(name), normalized) desc
  limit 1;
  if food_id_value is not null then
    update public.household_foods set catalog_food_id = private.resolve_catalog_food(food_name)
    where id = food_id_value and catalog_food_id is null;
    return food_id_value;
  end if;

  insert into public.household_foods (household_id, name, catalog_food_id)
  values (household_id_value, trim(food_name), private.resolve_catalog_food(food_name))
  on conflict do nothing;
  select id into food_id_value from public.household_foods
  where household_id = household_id_value and lower(name) = normalized;
  return food_id_value;
end;
$$;

-- Revisión de compra: además de qué pasará (alta/restaurar), dice a qué zona
-- iría un alta según el catálogo. Sin coincidencia de catálogo, va null y la
-- pantalla debe pedir la zona a mano.
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
    select si.id, si.food_id, si.version, hf.name, catalog.default_zone
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
      'suggested_zone', case when existing.id is null then item.default_zone end
    );
  end loop;
  return lines;
end;
$$;

-- Confirmar compra: un alta usa, por orden, la zona elegida a mano en la
-- revisión > la que sugiere el catálogo > Despensa si no hay ninguna pista.
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

    if existing.id is null then
      entry_zone := nullif(entry->>'zone', '');
      if entry_zone is not null and entry_zone not in ('fridge', 'freezer', 'pantry', 'cleaning') then
        raise exception 'Invalid pantry zone' using errcode = 'invalid_parameter_value';
      end if;
      if entry_zone is null then
        select catalog.default_zone into catalog_zone
        from public.household_foods as food
        left join public.catalog_foods as catalog on catalog.id = food.catalog_food_id
        where food.id = shop.food_id;
        entry_zone := coalesce(catalog_zone, 'pantry');
      end if;
      select id into location_id_value from public.pantry_locations
      where household_id = household_id_value and kind = entry_zone;

      -- Nuevo en la despensa: solo presencia, sin cantidad (la compra la
      -- conserva por su cuenta, no se traslada).
      insert into public.pantry_items
        (household_id, location_id, food_id, tracking_mode, approximate_state,
         quantity, unit_code, presence, entered_at, confirmed_at, confirmed_by)
      values
        (household_id_value, location_id_value, shop.food_id, 'approximate', 'some',
         null, null, true, now(), now(), actor_id)
      returning * into existing;
    else
      -- Ya existía (aunque estuviera "se terminó" o "queda poco"): se limita a
      -- refrescar la presencia, nunca a cargar una cantidad ni cambiar de zona.
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

revoke all on function public.shopping_checkout_preview(),
  public.shopping_confirm_purchase(jsonb, text) from public, anon, authenticated;
grant execute on function public.shopping_checkout_preview(),
  public.shopping_confirm_purchase(jsonb, text) to authenticated;
