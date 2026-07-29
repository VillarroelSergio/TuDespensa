-- "aceite de oliva" se fusionaba con "aceite de girasol" ya en la despensa:
-- ambos comparten el prefijo "aceite de ", así que su similitud de trigramas
-- (0.417) superaba el umbral de 0.4 y el alta reutilizaba el alimento
-- equivocado en vez de crear uno nuevo (el usuario veía el mensaje de éxito
-- pero ningún producto nuevo aparecía). Subir el umbral a 0.6 sigue
-- detectando singular/plural y erratas de una letra (tomate/tomates 0.667,
-- patata/patatas 0.625, cebolla/cebola 0.667) sin fusionar nombres distintos
-- que solo comparten palabras comunes (aceite de oliva/girasol 0.417,
-- pimiento rojo/verde 0.45, salsa de tomate/soja 0.429).
create or replace function private.resolve_household_food(household_id_value uuid, food_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  normalized text := lower(trim(food_name));
  food_id_value uuid;
begin
  select id into food_id_value from public.household_foods
  where household_id = household_id_value and lower(name) = normalized;
  if food_id_value is not null then return food_id_value; end if;

  select food_id into food_id_value from public.household_food_aliases
  where household_id = household_id_value and lower(alias) = normalized;
  if food_id_value is not null then return food_id_value; end if;

  select id into food_id_value from public.household_foods
  where household_id = household_id_value
    and extensions.similarity(lower(name), normalized) > 0.6
  order by extensions.similarity(lower(name), normalized) desc
  limit 1;
  if food_id_value is not null then return food_id_value; end if;

  insert into public.household_foods (household_id, name) values (household_id_value, trim(food_name))
  on conflict do nothing;
  select id into food_id_value from public.household_foods
  where household_id = household_id_value and lower(name) = normalized;
  return food_id_value;
end;
$$;
