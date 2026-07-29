-- El selector de recetas (Plan P2) hacía ~11 consultas separadas a Supabase
-- para sugerencias, recomendadas e índice de búsqueda (auditoría 2026-07-29).
-- Esta RPC agrupa esa misma lectura en un único viaje de red; el ranking
-- (`rankSuggestions`) sigue siendo TypeScript puro y no cambia.
create function public.plan_choose_recipe_options(week_start_value date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if week_start_value is null then raise exception 'Invalid week start' using errcode = 'invalid_parameter_value'; end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active';
  if household_id_value is null then
    return jsonb_build_object(
      'recipes', '[]'::jsonb, 'preferences', '[]'::jsonb, 'categoryAssignments', '[]'::jsonb,
      'plannedRecipeIds', '[]'::jsonb, 'pantry', '[]'::jsonb, 'catalog', '[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'dishType', r.dish_type, 'totalMinutes', r.total_minutes,
        'ingredients', coalesce((select jsonb_agg(ri.name) from public.recipe_ingredients ri where ri.recipe_id = r.id), '[]'::jsonb)
      ))
      from public.recipes r where r.household_id = household_id_value and r.status = 'ready'
    ), '[]'::jsonb),
    'preferences', coalesce((
      select jsonb_agg(jsonb_build_object('recipeId', p.recipe_id, 'isFavorite', p.is_favorite, 'rating', p.rating))
      from public.recipe_preferences p where p.household_id = household_id_value and p.user_id = actor_id
    ), '[]'::jsonb),
    'categoryAssignments', coalesce((
      select jsonb_agg(jsonb_build_object('recipeId', a.recipe_id, 'categoryName', c.name))
      from public.recipe_category_assignments a
      join public.recipe_categories c on c.id = a.category_id
      where a.household_id = household_id_value
    ), '[]'::jsonb),
    'plannedRecipeIds', coalesce((
      select jsonb_agg(m.recipe_id)
      from public.planned_meals m
      where m.household_id = household_id_value
        and m.meal_date between week_start_value and week_start_value + 6
    ), '[]'::jsonb),
    'pantry', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', f.name,
        'priority', (i.attention_state = 'low' or i.approximate_state = 'low' or coalesce(cs.consume_soon, false))
      ))
      from public.pantry_items i
      join public.household_foods f on f.id = i.food_id and f.household_id = i.household_id
      left join public.pantry_consume_soon cs on cs.pantry_item_id = i.id
      where i.household_id = household_id_value and i.presence
    ), '[]'::jsonb),
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'canonicalName', cf.canonical_name,
        'terms', jsonb_build_array(cf.canonical_name)
          || coalesce((select jsonb_agg(fa.alias) from public.food_aliases fa where fa.catalog_food_id = cf.id), '[]'::jsonb)
      ))
      from public.catalog_foods cf
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.plan_choose_recipe_options(date) from public, anon;
grant execute on function public.plan_choose_recipe_options(date) to authenticated;
