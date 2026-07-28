-- La instantánea se construye dentro de una única sentencia SQL: aunque el
-- otro integrante actualice la aplicación a la vez, las tablas incluidas ven
-- el mismo punto de la base de datos. No escribe ni registra ningún dato.
create or replace function public.household_export_backup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  household_row public.households;
  data_value jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;

  select household_id into household_id_value
  from public.household_members
  where user_id = actor_id and status = 'active';
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;

  select * into household_row from public.households where id = household_id_value;

  select jsonb_build_object(
    'households', jsonb_build_array(to_jsonb(household_row)),
    'household_people', coalesce((select jsonb_agg(to_jsonb(entry)) from public.household_people as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'pantry_locations', coalesce((select jsonb_agg(to_jsonb(entry)) from public.pantry_locations as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'household_foods', coalesce((select jsonb_agg(to_jsonb(entry)) from public.household_foods as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'household_food_aliases', coalesce((select jsonb_agg(to_jsonb(entry)) from public.household_food_aliases as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'pantry_items', coalesce((select jsonb_agg(to_jsonb(entry)) from public.pantry_items as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'pantry_movements', coalesce((select jsonb_agg(to_jsonb(entry) order by entry.created_at) from public.pantry_movements as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'shopping_lists', coalesce((select jsonb_agg(to_jsonb(entry)) from public.shopping_lists as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'shopping_items', coalesce((select jsonb_agg(to_jsonb(entry)) from public.shopping_items as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'recipes', coalesce((select jsonb_agg(to_jsonb(entry)) from public.recipes as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'recipe_ingredients', coalesce((select jsonb_agg(to_jsonb(entry) order by entry.recipe_id, entry.position) from public.recipe_ingredients as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'recipe_steps', coalesce((select jsonb_agg(to_jsonb(entry) order by entry.recipe_id, entry.position) from public.recipe_steps as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'recipe_categories', coalesce((select jsonb_agg(to_jsonb(entry)) from public.recipe_categories as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'recipe_category_assignments', coalesce((select jsonb_agg(to_jsonb(entry)) from public.recipe_category_assignments as entry where entry.household_id = household_id_value), '[]'::jsonb),
    'recipe_preferences', coalesce((select jsonb_agg(to_jsonb(entry)) from public.recipe_preferences as entry where entry.household_id = household_id_value), '[]'::jsonb)
  ) into data_value;

  return jsonb_build_object(
    'format', 'midespensa-backup',
    'version', 1,
    'generatedAt', now(),
    'household', jsonb_build_object('name', household_row.name),
    'counts', jsonb_build_object(
      'recipes', jsonb_array_length(data_value->'recipes'),
      'shoppingItems', jsonb_array_length(data_value->'shopping_items'),
      'pantryItems', jsonb_array_length(data_value->'pantry_items')
    ),
    'data', data_value
  );
end;
$$;

revoke all on function public.household_export_backup() from public, anon;
grant execute on function public.household_export_backup() to authenticated;
