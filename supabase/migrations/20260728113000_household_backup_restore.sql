-- Restauración conservadora: repone o actualiza las filas de la copia, pero
-- no elimina las que el hogar haya creado después. Así una copia equivocada no
-- puede vaciar silenciosamente la Despensa ni el recetario.
create or replace function public.household_restore_backup(snapshot jsonb, confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  backup_household_id uuid;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if confirmation <> 'RESTAURAR' then raise exception 'Confirmation is required' using errcode = 'invalid_parameter_value'; end if;
  if snapshot is null or snapshot->>'format' <> 'midespensa-backup' or snapshot->>'version' <> '1'
    or jsonb_typeof(snapshot->'data') <> 'object' then
    raise exception 'Invalid backup file' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value from public.household_members
  where user_id = actor_id and role = 'owner' and status = 'active';
  if household_id_value is null then raise exception 'Only the household owner can restore a backup' using errcode = 'insufficient_privilege'; end if;

  backup_household_id := nullif(snapshot->'data'->'households'->0->>'id', '')::uuid;
  if backup_household_id is null or backup_household_id <> household_id_value then
    raise exception 'This backup belongs to a different household' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.household_foods (id, household_id, name, catalog_food_id, created_at)
  select id, household_id_value, name, catalog_food_id, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'household_foods', '[]'::jsonb)) as entry(id uuid, household_id uuid, name text, catalog_food_id uuid, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set name = excluded.name, catalog_food_id = excluded.catalog_food_id;

  insert into public.pantry_locations (id, household_id, kind, created_at)
  select id, household_id_value, kind, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'pantry_locations', '[]'::jsonb)) as entry(id uuid, household_id uuid, kind text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set kind = excluded.kind;

  insert into public.household_food_aliases (id, household_id, food_id, alias, created_at)
  select id, household_id_value, food_id, alias, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'household_food_aliases', '[]'::jsonb)) as entry(id uuid, household_id uuid, food_id uuid, alias text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set food_id = excluded.food_id, alias = excluded.alias;

  insert into public.pantry_items (id, household_id, location_id, food_id, tracking_mode, presence, quantity, approximate_state, attention_state, unit_code, entered_at, version, confirmed_at, confirmed_by, removed_at, created_at, updated_at)
  select id, household_id_value, location_id, food_id, tracking_mode, presence, quantity, approximate_state, attention_state, unit_code, entered_at, version, confirmed_at, confirmed_by, removed_at, created_at, updated_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'pantry_items', '[]'::jsonb)) as entry(id uuid, household_id uuid, location_id uuid, food_id uuid, tracking_mode text, presence boolean, quantity numeric, approximate_state text, attention_state text, unit_code text, entered_at timestamptz, version integer, confirmed_at timestamptz, confirmed_by uuid, removed_at timestamptz, created_at timestamptz, updated_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set location_id = excluded.location_id, food_id = excluded.food_id, tracking_mode = excluded.tracking_mode, presence = excluded.presence, quantity = excluded.quantity, approximate_state = excluded.approximate_state, attention_state = excluded.attention_state, unit_code = excluded.unit_code, entered_at = excluded.entered_at, version = excluded.version, confirmed_at = excluded.confirmed_at, confirmed_by = excluded.confirmed_by, removed_at = excluded.removed_at, updated_at = excluded.updated_at;

  insert into public.shopping_lists (id, household_id, status, created_at, updated_at)
  select id, household_id_value, status, created_at, updated_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'shopping_lists', '[]'::jsonb)) as entry(id uuid, household_id uuid, status text, created_at timestamptz, updated_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set updated_at = excluded.updated_at;

  insert into public.shopping_items (id, household_id, shopping_list_id, food_id, source, is_purchased, version, quantity, unit_code, created_at, updated_at)
  select id, household_id_value, shopping_list_id, food_id, source, is_purchased, version, quantity, unit_code, created_at, updated_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'shopping_items', '[]'::jsonb)) as entry(id uuid, household_id uuid, shopping_list_id uuid, food_id uuid, source text, is_purchased boolean, version integer, quantity numeric, unit_code text, created_at timestamptz, updated_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set shopping_list_id = excluded.shopping_list_id, food_id = excluded.food_id, source = excluded.source, is_purchased = excluded.is_purchased, version = excluded.version, quantity = excluded.quantity, unit_code = excluded.unit_code, updated_at = excluded.updated_at;

  insert into public.recipes (id, household_id, title, dish_type, total_minutes, servings, status, source_url, origin, seed_key, seed_version, attribution, version, created_by, created_at, updated_at)
  select id, household_id_value, title, dish_type, total_minutes, servings, status, source_url, origin, seed_key, seed_version, attribution, version, created_by, created_at, updated_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipes', '[]'::jsonb)) as entry(id uuid, household_id uuid, title text, dish_type text, total_minutes integer, servings integer, status text, source_url text, origin text, seed_key text, seed_version integer, attribution text, version integer, created_by uuid, created_at timestamptz, updated_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set title = excluded.title, dish_type = excluded.dish_type, total_minutes = excluded.total_minutes, servings = excluded.servings, status = excluded.status, source_url = excluded.source_url, origin = excluded.origin, seed_key = excluded.seed_key, seed_version = excluded.seed_version, attribution = excluded.attribution, version = excluded.version, updated_at = excluded.updated_at;

  insert into public.recipe_ingredients (id, recipe_id, household_id, position, name, quantity, unit_code, created_at)
  select id, recipe_id, household_id_value, position, name, quantity, unit_code, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipe_ingredients', '[]'::jsonb)) as entry(id uuid, recipe_id uuid, household_id uuid, position integer, name text, quantity numeric, unit_code text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set position = excluded.position, name = excluded.name, quantity = excluded.quantity, unit_code = excluded.unit_code;

  insert into public.recipe_steps (id, recipe_id, household_id, position, instruction, created_at)
  select id, recipe_id, household_id_value, position, instruction, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipe_steps', '[]'::jsonb)) as entry(id uuid, recipe_id uuid, household_id uuid, position integer, instruction text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set position = excluded.position, instruction = excluded.instruction;

  insert into public.recipe_categories (id, household_id, dimension, name, created_at)
  select id, household_id_value, dimension, name, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipe_categories', '[]'::jsonb)) as entry(id uuid, household_id uuid, dimension text, name text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set dimension = excluded.dimension, name = excluded.name;

  insert into public.recipe_category_assignments (recipe_id, category_id, household_id, created_at)
  select recipe_id, category_id, household_id_value, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipe_category_assignments', '[]'::jsonb)) as entry(recipe_id uuid, category_id uuid, household_id uuid, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (recipe_id, category_id) do nothing;

  insert into public.recipe_preferences (recipe_id, household_id, user_id, is_favorite, rating, updated_at)
  select recipe_id, household_id_value, user_id, is_favorite, rating, updated_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipe_preferences', '[]'::jsonb)) as entry(recipe_id uuid, household_id uuid, user_id uuid, is_favorite boolean, rating integer, updated_at timestamptz)
  where household_id = backup_household_id
  on conflict (recipe_id, user_id) do update set is_favorite = excluded.is_favorite, rating = excluded.rating, updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.household_restore_backup(jsonb, text) from public, anon;
grant execute on function public.household_restore_backup(jsonb, text) to authenticated;
