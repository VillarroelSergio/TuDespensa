-- La carga de catálogo debe poder obtener la categoría que acaba de crear.
-- `ON CONFLICT DO NOTHING` seguido de un SELECT no garantizaba el id en el
-- contexto de la función SECURITY DEFINER ya desplegada. El UPSERT devuelve
-- el id tanto al insertar como al reutilizar la categoría del hogar.
create or replace function private.recipes_seed_one(
  household_id_value uuid, actor_id uuid, seed_key_value text, seed_version_value integer,
  title text, dish_type text, total_minutes integer, servings integer,
  ingredients jsonb, steps jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  new_recipe_id uuid;
  category_id_value uuid;
begin
  if exists (
    select 1
    from public.recipes
    where household_id = household_id_value and seed_key = seed_key_value
  ) then
    return false;
  end if;

  insert into public.recipes (
    household_id, title, dish_type, total_minutes, servings, created_by,
    origin, seed_key, seed_version, attribution
  )
  values (
    household_id_value, title, dish_type, total_minutes, servings, actor_id,
    'seed', seed_key_value, seed_version_value,
    'Recetas base del proyecto MiDespensa'
  )
  returning id into new_recipe_id;

  insert into public.recipe_ingredients (
    recipe_id, household_id, position, name, quantity, unit_code
  )
  select
    new_recipe_id,
    household_id_value,
    (e.ord - 1)::int,
    trim(e.value->>'name'),
    nullif(e.value->>'quantity', '')::numeric,
    nullif(e.value->>'unit_code', '')
  from jsonb_array_elements(ingredients) with ordinality as e(value, ord);

  insert into public.recipe_steps (recipe_id, household_id, position, instruction)
  select new_recipe_id, household_id_value, (s.ord - 1)::int, trim(s.value)
  from jsonb_array_elements_text(steps) with ordinality as s(value, ord);

  insert into public.recipe_categories (household_id, dimension, name)
  values (household_id_value, 'mediterranean', 'Mediterránea')
  on conflict (household_id, dimension, lower(name)) do update
  set name = excluded.name
  returning id into category_id_value;

  insert into public.recipe_category_assignments (
    recipe_id, category_id, household_id
  )
  values (new_recipe_id, category_id_value, household_id_value)
  on conflict do nothing;

  return true;
end;
$$;
