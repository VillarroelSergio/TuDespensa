-- Auditoría 2026-07-31 (B-4). Decenas de funciones resolvían el hogar activo
-- con `select household_id into household_id_value ... status = 'active'` sin
-- `limit 1`. Si esa consulta devolviera más de una fila, PL/pgSQL se queda con
-- una cualquiera SIN AVISAR: no hay error, solo un hogar elegido al azar.
--
-- Hoy no ocurre porque lo impide un índice único
-- (household_members_one_active_household_per_user_idx: como mucho un hogar
-- activo por persona). El problema era la dependencia implícita: el día que ese
-- índice se relajara —por ejemplo, para permitir varios hogares— el fallo sería
-- silencioso y casi imposible de rastrear. Con `limit 1` la elección es
-- explícita y deja de depender de una garantía escrita en otro fichero.
--
-- Fichero GENERADO a partir de pg_get_functiondef sobre la base ya migrada, así
-- que cada función conserva su versión vigente y no revierte ninguna corrección
-- anterior. Funciones afectadas: 19.

CREATE OR REPLACE FUNCTION public.claim_household_person(person_id uuid, person_name text, idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  normalized_name text;
  person_row public.household_people;
  request_hash_value text;
  replay jsonb;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;

  select household_id into household_id_value
  from public.household_members where user_id = actor_id and status = 'active'
  limit 1;
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;

  if (person_id is null) = (person_name is null) then
    raise exception 'Provide exactly one of person_id or person_name'
      using errcode = 'invalid_parameter_value';
  end if;

  request_hash_value := private.pantry_request_hash(
    'claim_household_person', jsonb_build_object('person_id', person_id, 'person_name', person_name));
  replay := private.pantry_claim(household_id_value, actor_id, 'claim_household_person', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  if person_id is not null then
    select * into person_row from public.household_people
    where id = person_id and household_id = household_id_value and linked_user_id is null
    for update;
    if person_row.id is null then
      raise exception 'That name is not available to claim' using errcode = 'serialization_failure';
    end if;
    update public.household_people set linked_user_id = actor_id where id = person_row.id
    returning * into person_row;
  else
    normalized_name := regexp_replace(trim(person_name), '\s+', ' ', 'g');
    if char_length(normalized_name) not between 1 and 80 then
      raise exception 'Invalid person name' using errcode = 'invalid_parameter_value';
    end if;

    -- Si el nombre escrito coincide con uno ya dado de alta (sin reclamar),
    -- se reclama ese en vez de crear un duplicado.
    select * into person_row from public.household_people
    where household_id = household_id_value and lower(name) = lower(normalized_name)
    for update;

    if person_row.id is not null then
      if person_row.linked_user_id is not null then
        raise exception 'That name is already claimed' using errcode = 'unique_violation';
      end if;
      update public.household_people set linked_user_id = actor_id where id = person_row.id
      returning * into person_row;
    else
      insert into public.household_people (household_id, name, linked_user_id)
      values (household_id_value, normalized_name, actor_id)
      returning * into person_row;
    end if;
  end if;

  result := jsonb_build_object('person_id', person_row.id, 'name', person_row.name);
  perform private.pantry_store_result(household_id_value, actor_id, 'claim_household_person', idempotency_key, result);
  return result;
exception
  when unique_violation then
    if sqlerrm like '%household_people_linked_user_idx%' then
      raise exception 'You already claimed a name in this household'
        using errcode = 'unique_violation';
    end if;
    raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_baseline(idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  request_hash_value text;
  stored_hash text;
  stored_result jsonb;
  claimed_key boolean;
  reviewed_zones integer;
  confirmed_at_value timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if idempotency_key is null or idempotency_key !~ '^[A-Za-z0-9._:-]{8,120}$' then
    raise exception 'Invalid idempotency key' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value
  from public.household_members
  where user_id = actor_id and status = 'active'
  limit 1;

  if household_id_value is null then
    raise exception 'Active household membership is required'
      using errcode = 'insufficient_privilege';
  end if;

  request_hash_value := encode(
    extensions.digest(convert_to('confirm_baseline', 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.idempotency_keys (
    household_id, actor, operation, key, request_hash, result
  ) values (
    household_id_value,
    actor_id,
    'confirm_baseline',
    idempotency_key,
    request_hash_value,
    '{}'::jsonb
  ) on conflict do nothing
  returning true into claimed_key;

  if not coalesce(claimed_key, false) then
    select request_hash, result
    into stored_hash, stored_result
    from public.idempotency_keys
    where actor = actor_id
      and operation = 'confirm_baseline'
      and key = idempotency_key;

    if stored_result is null or stored_hash <> request_hash_value then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = 'invalid_parameter_value';
    end if;
    return stored_result;
  end if;

  select count(*) into reviewed_zones
  from public.onboarding_zone_progress
  where household_id = household_id_value
    and state in ('reviewed_nonempty', 'reviewed_empty');

  if reviewed_zones <> 3 then
    raise exception 'All pantry zones must be reviewed before confirmation'
      using errcode = 'check_violation';
  end if;

  update public.onboarding_progress
  set global_state = 'confirming', updated_at = now()
  where household_id = household_id_value;

  confirmed_at_value := clock_timestamp();

  update public.households
  set onboarding_status = 'completed',
      baseline_confirmed_at = confirmed_at_value,
      updated_at = confirmed_at_value
  where id = household_id_value;

  update public.onboarding_progress
  set global_state = 'completed',
      active_zone = null,
      return_target = null,
      updated_at = confirmed_at_value
  where household_id = household_id_value;

  stored_result := jsonb_build_object(
    'household_id', household_id_value,
    'global_state', 'completed',
    'baseline_confirmed_at', confirmed_at_value
  );

  update public.idempotency_keys
  set result = stored_result
  where household_id = household_id_value
    and actor = actor_id
    and operation = 'confirm_baseline'
    and key = idempotency_key;

  return stored_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_household_invitation(code_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  submitted_code_hash text := code_hash;
  household_id_value uuid;
  active_members integer;
  invitation_row public.household_invitations;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;

  if submitted_code_hash is null or submitted_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation code hash' using errcode = 'invalid_parameter_value';
  end if;

  select member.household_id into household_id_value
  from public.household_members as member
  where member.user_id = actor_id and member.role = 'owner' and member.status = 'active'
  limit 1;

  if household_id_value is null then
    raise exception 'Only the household owner can invite'
      using errcode = 'insufficient_privilege';
  end if;

  -- Bloquea la fila del hogar para serializar con altas y otras invitaciones.
  perform 1
  from public.households
  where id = household_id_value
  for update;

  select count(*) into active_members
  from public.household_members
  where household_id = household_id_value and status = 'active';

  if active_members >= 2 then
    raise exception 'This household is already full'
      using errcode = 'check_violation';
  end if;

  -- Generar un código nuevo invalida cualquier invitación pendiente previa.
  update public.household_invitations
  set status = 'revoked', updated_at = now()
  where household_id = household_id_value and status = 'pending';

  insert into public.household_invitations
    (household_id, invited_by, status, code_hash, email, expires_at)
  values
    (household_id_value, actor_id, 'pending', submitted_code_hash, null, now() + interval '7 days')
  returning * into invitation_row;

  return jsonb_build_object(
    'invitation_id', invitation_row.id,
    'expires_at', invitation_row.expires_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.household_export_backup()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where user_id = actor_id and status = 'active'
  limit 1;
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
$function$;

CREATE OR REPLACE FUNCTION public.household_restore_backup(snapshot jsonb, confirmation text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where user_id = actor_id and role = 'owner' and status = 'active'
  limit 1;
  if household_id_value is null then raise exception 'Only the household owner can restore a backup' using errcode = 'insufficient_privilege'; end if;

  backup_household_id := nullif(snapshot->'data'->'households'->0->>'id', '')::uuid;
  if backup_household_id is null or backup_household_id <> household_id_value then
    raise exception 'This backup belongs to a different household' using errcode = 'invalid_parameter_value';
  end if;

  -- A partir de aquí, cada `do update` lleva su propio filtro de hogar: si el
  -- id de la fila resulta ser de otro hogar, el conflicto no actualiza nada en
  -- vez de reescribir datos ajenos.
  insert into public.household_foods (id, household_id, name, catalog_food_id, created_at)
  select id, household_id_value, name, catalog_food_id, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'household_foods', '[]'::jsonb)) as entry(id uuid, household_id uuid, name text, catalog_food_id uuid, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set name = excluded.name, catalog_food_id = excluded.catalog_food_id
  where public.household_foods.household_id = household_id_value;

  insert into public.pantry_locations (id, household_id, kind, created_at)
  select id, household_id_value, kind, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'pantry_locations', '[]'::jsonb)) as entry(id uuid, household_id uuid, kind text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set kind = excluded.kind
  where public.pantry_locations.household_id = household_id_value;

  insert into public.household_food_aliases (id, household_id, food_id, alias, created_at)
  select id, household_id_value, food_id, alias, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'household_food_aliases', '[]'::jsonb)) as entry(id uuid, household_id uuid, food_id uuid, alias text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set food_id = excluded.food_id, alias = excluded.alias
  where public.household_food_aliases.household_id = household_id_value;

  -- `version`, `confirmed_by` y `confirmed_at` NO se toman del fichero: quien
  -- restaura los controlaría y `version` es lo que sostiene el bloqueo
  -- optimista entre las dos personas del hogar.
  insert into public.pantry_items (id, household_id, location_id, food_id, tracking_mode, presence, quantity, approximate_state, attention_state, unit_code, entered_at, version, confirmed_at, confirmed_by, removed_at, created_at, updated_at)
  select id, household_id_value, location_id, food_id, tracking_mode, presence, quantity, approximate_state, attention_state, unit_code, entered_at, 1, now(), actor_id, removed_at, created_at, now()
  from jsonb_to_recordset(coalesce(snapshot->'data'->'pantry_items', '[]'::jsonb)) as entry(id uuid, household_id uuid, location_id uuid, food_id uuid, tracking_mode text, presence boolean, quantity numeric, approximate_state text, attention_state text, unit_code text, entered_at timestamptz, removed_at timestamptz, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set location_id = excluded.location_id, food_id = excluded.food_id, tracking_mode = excluded.tracking_mode, presence = excluded.presence, quantity = excluded.quantity, approximate_state = excluded.approximate_state, attention_state = excluded.attention_state, unit_code = excluded.unit_code, entered_at = excluded.entered_at, version = public.pantry_items.version + 1, confirmed_at = now(), confirmed_by = actor_id, removed_at = excluded.removed_at, updated_at = now()
  where public.pantry_items.household_id = household_id_value;

  insert into public.shopping_lists (id, household_id, status, created_at, updated_at)
  select id, household_id_value, status, created_at, updated_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'shopping_lists', '[]'::jsonb)) as entry(id uuid, household_id uuid, status text, created_at timestamptz, updated_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set updated_at = excluded.updated_at
  where public.shopping_lists.household_id = household_id_value;

  insert into public.shopping_items (id, household_id, shopping_list_id, food_id, source, is_purchased, version, quantity, unit_code, created_at, updated_at)
  select id, household_id_value, shopping_list_id, food_id, source, is_purchased, 1, quantity, unit_code, created_at, now()
  from jsonb_to_recordset(coalesce(snapshot->'data'->'shopping_items', '[]'::jsonb)) as entry(id uuid, household_id uuid, shopping_list_id uuid, food_id uuid, source text, is_purchased boolean, quantity numeric, unit_code text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set shopping_list_id = excluded.shopping_list_id, food_id = excluded.food_id, source = excluded.source, is_purchased = excluded.is_purchased, version = public.shopping_items.version + 1, quantity = excluded.quantity, unit_code = excluded.unit_code, updated_at = now()
  where public.shopping_items.household_id = household_id_value;

  insert into public.recipes (id, household_id, title, dish_type, total_minutes, servings, status, source_url, origin, seed_key, seed_version, attribution, version, created_by, created_at, updated_at)
  select id, household_id_value, title, dish_type, total_minutes, servings, status, source_url, origin, seed_key, seed_version, attribution, 1, actor_id, created_at, now()
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipes', '[]'::jsonb)) as entry(id uuid, household_id uuid, title text, dish_type text, total_minutes integer, servings integer, status text, source_url text, origin text, seed_key text, seed_version integer, attribution text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set title = excluded.title, dish_type = excluded.dish_type, total_minutes = excluded.total_minutes, servings = excluded.servings, status = excluded.status, source_url = excluded.source_url, origin = excluded.origin, seed_key = excluded.seed_key, seed_version = excluded.seed_version, attribution = excluded.attribution, version = public.recipes.version + 1, updated_at = now()
  where public.recipes.household_id = household_id_value;

  insert into public.recipe_ingredients (id, recipe_id, household_id, position, name, quantity, unit_code, created_at)
  select id, recipe_id, household_id_value, position, name, quantity, unit_code, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipe_ingredients', '[]'::jsonb)) as entry(id uuid, recipe_id uuid, household_id uuid, position integer, name text, quantity numeric, unit_code text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set position = excluded.position, name = excluded.name, quantity = excluded.quantity, unit_code = excluded.unit_code
  where public.recipe_ingredients.household_id = household_id_value;

  insert into public.recipe_steps (id, recipe_id, household_id, position, instruction, created_at)
  select id, recipe_id, household_id_value, position, instruction, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipe_steps', '[]'::jsonb)) as entry(id uuid, recipe_id uuid, household_id uuid, position integer, instruction text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set position = excluded.position, instruction = excluded.instruction
  where public.recipe_steps.household_id = household_id_value;

  insert into public.recipe_categories (id, household_id, dimension, name, created_at)
  select id, household_id_value, dimension, name, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipe_categories', '[]'::jsonb)) as entry(id uuid, household_id uuid, dimension text, name text, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (id) do update set dimension = excluded.dimension, name = excluded.name
  where public.recipe_categories.household_id = household_id_value;

  insert into public.recipe_category_assignments (recipe_id, category_id, household_id, created_at)
  select recipe_id, category_id, household_id_value, created_at
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipe_category_assignments', '[]'::jsonb)) as entry(recipe_id uuid, category_id uuid, household_id uuid, created_at timestamptz)
  where household_id = backup_household_id
  on conflict (recipe_id, category_id) do nothing;

  -- `user_id` sale de quien restaura, no del fichero: si no, se podrían
  -- escribir las preferencias a nombre de la otra persona del hogar.
  insert into public.recipe_preferences (recipe_id, household_id, user_id, is_favorite, rating, updated_at)
  select recipe_id, household_id_value, actor_id, is_favorite, rating, now()
  from jsonb_to_recordset(coalesce(snapshot->'data'->'recipe_preferences', '[]'::jsonb)) as entry(recipe_id uuid, household_id uuid, user_id uuid, is_favorite boolean, rating integer)
  where household_id = backup_household_id and user_id = actor_id
  on conflict (recipe_id, user_id) do update set is_favorite = excluded.is_favorite, rating = excluded.rating, updated_at = now()
  where public.recipe_preferences.household_id = household_id_value;
end;
$function$;

CREATE OR REPLACE FUNCTION public.onboarding_add_pantry_item(zone text, food_name text, idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  location_id_value uuid;
  food_id_value uuid;
  item_row public.pantry_items;
  normalized_food_name text;
  request_hash_value text;
  stored_hash text;
  stored_result jsonb;
  claimed_key boolean;
  duplicate_item boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if zone is null or zone not in ('fridge', 'freezer', 'pantry') then
    raise exception 'Invalid pantry zone' using errcode = 'invalid_parameter_value';
  end if;
  if idempotency_key is null or idempotency_key !~ '^[A-Za-z0-9._:-]{8,120}$' then
    raise exception 'Invalid idempotency key' using errcode = 'invalid_parameter_value';
  end if;

  normalized_food_name := regexp_replace(trim(food_name), '\s+', ' ', 'g');
  if normalized_food_name is null or char_length(normalized_food_name) not between 1 and 120 then
    raise exception 'Invalid food name' using errcode = 'invalid_parameter_value';
  end if;

  select household_id
  into household_id_value
  from public.household_members
  where user_id = actor_id and status = 'active'
  limit 1;

  if household_id_value is null then
    raise exception 'Active household membership is required'
      using errcode = 'insufficient_privilege';
  end if;

  select id into location_id_value
  from public.pantry_locations
  where household_id = household_id_value and kind = zone;

  request_hash_value := encode(
    extensions.digest(
      convert_to(zone || '|' || lower(normalized_food_name), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.idempotency_keys (
    household_id, actor, operation, key, request_hash, result
  ) values (
    household_id_value,
    actor_id,
    'onboarding_add_pantry_item',
    idempotency_key,
    request_hash_value,
    '{}'::jsonb
  ) on conflict do nothing
  returning true into claimed_key;

  if not coalesce(claimed_key, false) then
    select request_hash, result
    into stored_hash, stored_result
    from public.idempotency_keys
    where actor = actor_id
      and operation = 'onboarding_add_pantry_item'
      and key = idempotency_key;

    if stored_result is null or stored_hash <> request_hash_value then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = 'invalid_parameter_value';
    end if;
    return stored_result;
  end if;

  insert into public.household_foods (household_id, name)
  values (household_id_value, normalized_food_name)
  on conflict do nothing;

  select id into food_id_value
  from public.household_foods
  where household_id = household_id_value
    and lower(name) = lower(normalized_food_name);

  select * into item_row
  from public.pantry_items
  where household_id = household_id_value
    and location_id = location_id_value
    and food_id = food_id_value
  for update;

  if item_row.id is not null and item_row.presence then
    duplicate_item := true;
  elsif item_row.id is not null then
    update public.pantry_items
    set presence = true,
        quantity = null,
        version = version + 1,
        confirmed_at = now(),
        confirmed_by = actor_id,
        updated_at = now()
    where id = item_row.id
    returning * into item_row;
  else
    insert into public.pantry_items (
      household_id, location_id, food_id, presence, confirmed_at, confirmed_by
    ) values (
      household_id_value, location_id_value, food_id_value, true, now(), actor_id
    ) returning * into item_row;
  end if;

  if not duplicate_item then
    insert into public.pantry_movements (household_id, item_id, movement_type, actor)
    values (household_id_value, item_row.id, 'entry', actor_id);

    update public.onboarding_zone_progress
    set state = 'in_progress', updated_at = now()
    where household_id = household_id_value
      and onboarding_zone_progress.zone = onboarding_add_pantry_item.zone;

    update public.onboarding_progress
    set global_state = 'inventory_in_progress', active_zone = zone, updated_at = now()
    where household_id = household_id_value;
  end if;

  stored_result := jsonb_build_object(
    'item_id', item_row.id,
    'version', item_row.version,
    'duplicate', duplicate_item,
    'presence', item_row.presence
  );

  update public.idempotency_keys
  set result = stored_result
  where household_id = household_id_value
    and actor = actor_id
    and operation = 'onboarding_add_pantry_item'
    and key = idempotency_key;

  return stored_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.onboarding_set_zone_state(zone text, state text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  current_state text;
  present_items integer;
  reviewed_zones integer;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if zone is null or state is null
     or zone not in ('fridge', 'freezer', 'pantry')
     or state not in ('not_started', 'in_progress', 'reviewed_nonempty', 'reviewed_empty') then
    raise exception 'Invalid zone state' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value
  from public.household_members
  where user_id = actor_id and status = 'active'
  limit 1;

  if household_id_value is null then
    raise exception 'Active household membership is required'
      using errcode = 'insufficient_privilege';
  end if;

  select onboarding_zone_progress.state into current_state
  from public.onboarding_zone_progress
  where household_id = household_id_value
    and onboarding_zone_progress.zone = onboarding_set_zone_state.zone
  for update;

  if current_state is null then
    raise exception 'Onboarding zone is unavailable' using errcode = 'invalid_parameter_value';
  end if;

  if state <> current_state and not (
    (current_state = 'not_started' and state = 'in_progress')
    or (current_state = 'in_progress' and state in ('reviewed_nonempty', 'reviewed_empty'))
    or (current_state in ('reviewed_nonempty', 'reviewed_empty') and state = 'in_progress')
  ) then
    raise exception 'Invalid onboarding zone transition'
      using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into present_items
  from public.pantry_items as item
  join public.pantry_locations as location
    on location.household_id = item.household_id and location.id = item.location_id
  where item.household_id = household_id_value
    and location.kind = zone
    and item.presence;

  if state = 'reviewed_nonempty' and present_items = 0 then
    raise exception 'A nonempty zone must contain at least one item'
      using errcode = 'check_violation';
  elsif state = 'reviewed_empty' and present_items > 0 then
    raise exception 'An empty zone cannot contain present items'
      using errcode = 'check_violation';
  end if;

  update public.onboarding_zone_progress
  set state = onboarding_set_zone_state.state, updated_at = now()
  where household_id = household_id_value
    and onboarding_zone_progress.zone = onboarding_set_zone_state.zone;

  select count(*) into reviewed_zones
  from public.onboarding_zone_progress
  where household_id = household_id_value
    and onboarding_zone_progress.state in ('reviewed_nonempty', 'reviewed_empty');

  update public.onboarding_progress
  set global_state = case when reviewed_zones = 3 then 'awaiting_review' else 'inventory_in_progress' end,
      active_zone = case when reviewed_zones = 3 then null else zone end,
      updated_at = now()
  where household_id = household_id_value;

  return jsonb_build_object(
    'household_id', household_id_value,
    'zone', zone,
    'state', state,
    'global_state', case when reviewed_zones = 3 then 'awaiting_review' else 'inventory_in_progress' end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.pantry_record_entry(zone text, food_name text, tracking_mode text, approximate_state text, quantity numeric, unit_code text, idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor_id uuid := auth.uid(); household_id_value uuid; location_id_value uuid; food_id_value uuid; item_row public.pantry_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if zone not in ('fridge', 'freezer', 'pantry', 'cleaning') or food_name is null or char_length(trim(food_name)) not between 1 and 120 then raise exception 'Invalid pantry entry' using errcode = 'invalid_parameter_value'; end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active'
  limit 1;
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  request_hash_value := private.pantry_request_hash('pantry_record_entry', jsonb_build_object('zone', zone, 'food_name', lower(trim(food_name)), 'tracking_mode', tracking_mode, 'state', approximate_state, 'quantity', quantity, 'unit', unit_code));
  replay := private.pantry_claim(household_id_value, actor_id, 'pantry_record_entry', idempotency_key, request_hash_value); if replay is not null then return replay; end if;
  if (tracking_mode = 'approximate' and (quantity is not null or unit_code is not null or approximate_state not in ('plenty', 'some', 'low', 'out')))
     or (tracking_mode = 'units' and (quantity is null or quantity < 0 or unit_code <> 'unit' or approximate_state is not null))
     or (tracking_mode = 'measure' and (quantity is null or quantity < 0 or unit_code not in ('g', 'kg', 'ml', 'l') or approximate_state is not null)) then raise exception 'Invalid pantry tracking payload' using errcode = 'check_violation'; end if;
  select id into location_id_value from public.pantry_locations where household_id = household_id_value and kind = zone;
  food_id_value := private.resolve_household_food(household_id_value, food_name);
  select * into item_row from public.pantry_items where household_id = household_id_value and location_id = location_id_value and food_id = food_id_value for update;
  if item_row.id is null then
    insert into public.pantry_items (household_id, location_id, food_id, tracking_mode, approximate_state, quantity, unit_code, presence, entered_at, confirmed_at, confirmed_by)
    values (household_id_value, location_id_value, food_id_value, tracking_mode, approximate_state, quantity, unit_code, case when tracking_mode = 'approximate' then approximate_state <> 'out' else quantity > 0 end, now(), now(), actor_id) returning * into item_row;
  else
    update public.pantry_items set tracking_mode = pantry_record_entry.tracking_mode, approximate_state = pantry_record_entry.approximate_state, quantity = pantry_record_entry.quantity, unit_code = pantry_record_entry.unit_code, presence = case when pantry_record_entry.tracking_mode = 'approximate' then pantry_record_entry.approximate_state <> 'out' else pantry_record_entry.quantity > 0 end, entered_at = now(), version = version + 1, confirmed_at = now(), confirmed_by = actor_id, updated_at = now() where id = item_row.id returning * into item_row;
  end if;
  insert into public.pantry_movements (household_id, item_id, movement_type, actor, quantity_delta, item_snapshot) values (household_id_value, item_row.id, 'entry', actor_id, quantity, jsonb_build_object('tracking_mode', item_row.tracking_mode, 'approximate_state', item_row.approximate_state, 'quantity', item_row.quantity, 'unit_code', item_row.unit_code, 'version', item_row.version));
  result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'presence', item_row.presence);
  perform private.pantry_store_result(household_id_value, actor_id, 'pantry_record_entry', idempotency_key, result); return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.plan_choose_recipe_options(week_start_value date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if week_start_value is null then raise exception 'Invalid week start' using errcode = 'invalid_parameter_value'; end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active'
  limit 1;
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
$function$;

CREATE OR REPLACE FUNCTION public.plan_clear_meal(meal_date_value date, meal_type_value text, idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; removed integer;
  request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if meal_date_value is null or meal_type_value is null or meal_type_value not in ('lunch', 'dinner') then
    raise exception 'Invalid planned meal' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active'
  limit 1;
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;

  request_hash_value := private.pantry_request_hash('plan_clear_meal', jsonb_build_object('meal_date', meal_date_value, 'meal_type', meal_type_value));
  replay := private.pantry_claim(household_id_value, actor_id, 'plan_clear_meal', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  delete from public.planned_meals
  where household_id = household_id_value
    and meal_date = meal_date_value
    and meal_type = meal_type_value;
  get diagnostics removed = row_count;

  result := jsonb_build_object('removed', removed);
  perform private.pantry_store_result(household_id_value, actor_id, 'plan_clear_meal', idempotency_key, result);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.plan_cook_meal(meal_date_value date, meal_type_value text, consumptions jsonb, idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  meal_row public.planned_meals;
  entry jsonb;
  item public.pantry_items;
  target_mode text; target_state text; target_qty numeric; target_unit text;
  consumed_delta numeric;
  consumed integer := 0;
  request_hash_value text;
  replay jsonb;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  if meal_date_value is null or meal_type_value is null or meal_type_value not in ('lunch', 'dinner')
    or consumptions is null or jsonb_typeof(consumptions) <> 'array' then
    raise exception 'Invalid cook payload' using errcode = 'invalid_parameter_value';
  end if;

  select household_id into household_id_value
  from public.household_members where user_id = actor_id and status = 'active'
  limit 1;
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;

  request_hash_value := private.pantry_request_hash('plan_cook_meal', jsonb_build_object(
    'meal_date', meal_date_value, 'meal_type', meal_type_value, 'consumptions', consumptions));
  replay := private.pantry_claim(
    household_id_value, actor_id, 'plan_cook_meal', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  -- El hueco debe seguir existiendo y no estar ya cocinado: si otro integrante lo
  -- cocinó o lo vació, recargamos en vez de descontar dos veces.
  select * into meal_row from public.planned_meals
  where household_id = household_id_value
    and meal_date = meal_date_value and meal_type = meal_type_value
  for update;
  if meal_row.id is null then
    raise exception 'Planned meal is gone' using errcode = 'serialization_failure';
  end if;
  if meal_row.cooked_at is not null then
    raise exception 'Planned meal was already cooked' using errcode = 'serialization_failure';
  end if;

  for entry in select * from jsonb_array_elements(consumptions) loop
    select * into item from public.pantry_items
    where id = (entry->>'item_id')::uuid and household_id = household_id_value
    for update;
    -- Debe existir y conservar la versión revisada; si no, alguien lo cambió.
    if item.id is null or item.version <> (entry->>'version')::integer then
      raise exception 'Pantry item changed during cooking' using errcode = 'serialization_failure';
    end if;

    target_mode := entry->>'tracking_mode';
    target_state := entry->>'approximate_state';
    target_qty := (entry->>'quantity')::numeric;
    target_unit := entry->>'unit_code';

    -- Cocinar no cambia la forma de medir un producto ni lo hace aparecer: el
    -- modo se conserva y una cantidad nunca sube (cocinar solo consume).
    if target_mode is distinct from item.tracking_mode then
      raise exception 'Cooking cannot change how an item is tracked' using errcode = 'check_violation';
    end if;
    if (target_mode = 'approximate' and (target_qty is not null or target_unit is not null or target_state not in ('plenty', 'some', 'low', 'out')))
       or (target_mode = 'units' and (target_qty is null or target_qty < 0 or target_unit <> 'unit' or target_state is not null))
       or (target_mode = 'measure' and (target_qty is null or target_qty < 0 or target_unit not in ('g', 'kg', 'ml', 'l') or target_state is not null)) then
      raise exception 'Invalid pantry tracking payload' using errcode = 'check_violation';
    end if;
    if target_qty is not null and item.quantity is not null and target_qty > item.quantity then
      raise exception 'Cooking cannot increase a quantity' using errcode = 'check_violation';
    end if;

    consumed_delta := case
      when target_qty is not null and item.quantity is not null then target_qty - item.quantity end;

    update public.pantry_items set
      tracking_mode = target_mode, approximate_state = target_state,
      quantity = target_qty, unit_code = target_unit,
      presence = case when target_mode = 'approximate' then target_state <> 'out' else target_qty > 0 end,
      version = version + 1, confirmed_at = now(), confirmed_by = actor_id, updated_at = now()
    where id = item.id returning * into item;

    insert into public.pantry_movements
      (household_id, item_id, movement_type, actor, quantity_delta, item_snapshot)
    values (household_id_value, item.id, 'consumption', actor_id, consumed_delta,
      jsonb_build_object('tracking_mode', item.tracking_mode, 'approximate_state', item.approximate_state,
        'quantity', item.quantity, 'unit_code', item.unit_code, 'version', item.version,
        'source', 'meal_cooked', 'recipe_id', meal_row.recipe_id));
    consumed := consumed + 1;
  end loop;

  update public.planned_meals
  set cooked_at = now(), cooked_by = actor_id, updated_at = now()
  where id = meal_row.id;

  result := jsonb_build_object('cooked', true, 'consumed', consumed);
  perform private.pantry_store_result(
    household_id_value, actor_id, 'plan_cook_meal', idempotency_key, result);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.plan_set_meal(meal_date_value date, meal_type_value text, recipe_id_value uuid, servings_value integer, idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; week_start date;
  plan_id uuid; meal_row public.planned_meals;
  request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if meal_date_value is null or meal_type_value is null or meal_type_value not in ('lunch', 'dinner')
     or (servings_value is not null and (servings_value < 1 or servings_value > 99)) then
    raise exception 'Invalid planned meal' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active'
  limit 1;
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  -- La receta debe pertenecer al hogar: evita planificar recetas ajenas.
  if not exists (select 1 from public.recipes where id = recipe_id_value and household_id = household_id_value) then
    raise exception 'Recipe not found in household' using errcode = 'invalid_parameter_value';
  end if;

  request_hash_value := private.pantry_request_hash('plan_set_meal', jsonb_build_object('meal_date', meal_date_value, 'meal_type', meal_type_value, 'recipe_id', recipe_id_value, 'servings', servings_value));
  replay := private.pantry_claim(household_id_value, actor_id, 'plan_set_meal', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;

  week_start := (date_trunc('week', meal_date_value::timestamp))::date;
  insert into public.meal_plans (household_id, week_start_date, created_by)
  values (household_id_value, week_start, actor_id)
  on conflict (household_id, week_start_date) do update set week_start_date = excluded.week_start_date
  returning id into plan_id;

  insert into public.planned_meals (meal_plan_id, household_id, meal_date, meal_type, recipe_id, servings, created_by)
  values (plan_id, household_id_value, meal_date_value, meal_type_value, recipe_id_value, servings_value, actor_id)
  on conflict (household_id, meal_date, meal_type) do update
    set recipe_id = excluded.recipe_id, servings = excluded.servings,
        meal_plan_id = excluded.meal_plan_id, updated_at = now()
  returning * into meal_row;

  result := jsonb_build_object('planned_meal_id', meal_row.id, 'meal_date', meal_row.meal_date, 'meal_type', meal_row.meal_type);
  perform private.pantry_store_result(household_id_value, actor_id, 'plan_set_meal', idempotency_key, result);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recipes_capture_link(source_url text, idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; recipe_row public.recipes;
  request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if source_url is null or source_url !~ '^https?://' or char_length(source_url) > 2048 then
    raise exception 'Invalid link' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active'
  limit 1;
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  request_hash_value := private.pantry_request_hash('recipes_capture_link', jsonb_build_object('source_url', source_url));
  replay := private.pantry_claim(household_id_value, actor_id, 'recipes_capture_link', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  insert into public.recipes (household_id, title, status, source_url, created_by)
  values (household_id_value, 'Receta pendiente', 'pending', source_url, actor_id)
  returning * into recipe_row;
  result := jsonb_build_object('recipe_id', recipe_row.id, 'version', recipe_row.version);
  perform private.pantry_store_result(household_id_value, actor_id, 'recipes_capture_link', idempotency_key, result);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recipes_create_recipe(title text, dish_type text, total_minutes integer, servings integer, idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; recipe_row public.recipes;
  request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if title is null or char_length(trim(title)) not between 1 and 160
     or (dish_type is not null and dish_type not in ('breakfast', 'starter', 'main', 'side', 'dessert', 'drink', 'other'))
     or (total_minutes is not null and (total_minutes < 0 or total_minutes > 1440))
     or (servings is not null and (servings < 1 or servings > 99)) then
    raise exception 'Invalid recipe' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active'
  limit 1;
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  request_hash_value := private.pantry_request_hash('recipes_create_recipe', jsonb_build_object('title', lower(trim(title)), 'dish_type', dish_type, 'total_minutes', total_minutes, 'servings', servings));
  replay := private.pantry_claim(household_id_value, actor_id, 'recipes_create_recipe', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  insert into public.recipes (household_id, title, dish_type, total_minutes, servings, created_by)
  values (household_id_value, trim(title), dish_type, total_minutes, servings, actor_id)
  returning * into recipe_row;
  result := jsonb_build_object('recipe_id', recipe_row.id, 'version', recipe_row.version);
  perform private.pantry_store_result(household_id_value, actor_id, 'recipes_create_recipe', idempotency_key, result);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recipes_load_seed(idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  request_hash_value text;
  replay jsonb;
  result jsonb;
  loaded integer := 0;
  item jsonb;
  recipe_id_value uuid;
  catalog jsonb := convert_from(decode('W3sia2V5IjoiYmFzZS12Mi0wMDEiLCJ0aXRsZSI6IkdhenBhY2hvIGFuZGFsdXoiLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MTUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA4MDAgZyB0b21hdGUgbWFkdXJvIn0seyJuYW1lIjoiMS8yIHBlcGlubyJ9LHsibmFtZSI6IjEvMiBwaW1pZW50byB2ZXJkZSJ9LHsibmFtZSI6IjEvNCBjZWJvbGxhIn0seyJuYW1lIjoiYWNlaXRlIGRlIG9saXZhIiwicXVhbnRpdHkiOjQwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6InZpbmFncmUgZGUgSmVyZXoiLCJxdWFudGl0eSI6MTUsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoicGFuIGRlbCBkw61hIGFudGVyaW9yIiwicXVhbnRpdHkiOjQwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoic2FsIHkgYWd1YSBmcsOtYSJ9XSwic3RlcHMiOlsiKiBUcm9jZWEgdmVyZHVyYXMgeSBwYW4uIiwiVHJpdHVyYSBjb24gYWNlaXRlLCB2aW5hZ3JlIHkgc2FsIGhhc3RhIGZpbm87IGFqdXN0YSBjb24gYWd1YS4iLCJFbmZyw61hIGFsIG1lbm9zIDMwIG1pbi4iXX0seyJrZXkiOiJiYXNlLXYyLTAwMiIsInRpdGxlIjoiU2FsbW9yZWpvIGNvcmRvYsOpcyBjb24gaHVldm8geSBqYW3Ds24iLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MjAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA3NTAgZyB0b21hdGUgbWFkdXJvIn0seyJuYW1lIjoicGFuIGJsYW5jbyIsInF1YW50aXR5IjoxMTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgZGllbnRlIGRlIGFqbyJ9LHsibmFtZSI6ImFjZWl0ZSBkZSBvbGl2YSIsInF1YW50aXR5Ijo2MCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJ2aW5hZ3JlIiwicXVhbnRpdHkiOjE1LCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6Imh1ZXZvcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiamFtw7NuIHNlcnJhbm8geSBzYWwiLCJxdWFudGl0eSI6NDAsInVuaXRfY29kZSI6ImcifV0sInN0ZXBzIjpbIiogVHJpdHVyYSB0b21hdGUsIHBhbiwgYWpvLCBzYWwgeSB2aW5hZ3JlLiIsIkHDsWFkZSBhY2VpdGUgZW4gaGlsbyBoYXN0YSBjcmVtb3NvLiIsIkVuZnLDrWEgeSBzaXJ2ZSBjb24gaHVldm8gY29jaWRvIHkgamFtw7NuIHBpY2Fkb3MuIl19LHsia2V5IjoiYmFzZS12Mi0wMDMiLCJ0aXRsZSI6IlBpc3RvIG1hbmNoZWdvIGNvbiBodWV2byBjdWFqYWRvIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjQ1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMSBjYWxhYmFjw61uIn0seyJuYW1lIjoiYmVyZW5qZW5hIHBlcXVlw7FhIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6InBpbWllbnRvIHJvam8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InRvbWF0ZSB0cml0dXJhZG8iLCJxdWFudGl0eSI6NDAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiaHVldm9zIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUiLCJxdWFudGl0eSI6MjUsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoic2FsIn1dLCJzdGVwcyI6WyIqIFNvZnLDrWUgY2Vib2xsYSB5IHBpbWllbnRvLiIsIkHDsWFkZSBiZXJlbmplbmEgeSBjYWxhYmFjw61uIGVuIGRhZG9zLCBjb2NpbmEgMTIgbWluLiIsIkluY29ycG9yYSB0b21hdGUgeSByZWR1Y2U7IGFicmUgZG9zIGh1ZWNvcywgY3VhamEgbG9zIGh1ZXZvcyB0YXBhZG9zLiJdfSx7ImtleSI6ImJhc2UtdjItMDA0IiwidGl0bGUiOiJFc2NhbGl2YWRhIGRlIHZlcmR1cmFzIGFsIGhvcm5vIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjUwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMSBiZXJlbmplbmEifSx7Im5hbWUiOiJwaW1pZW50byByb2pvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJjZWJvbGxhIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ0b21hdGVzIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJkaWVudGUgZGUgYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUiLCJxdWFudGl0eSI6MjUsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoic2FsIHkgdmluYWdyZSJ9XSwic3RlcHMiOlsiKiBBc2EgdmVyZHVyYXMgZW50ZXJhcyBhIDIwMCDCsEMgY29uIGFjZWl0ZSB5IHNhbCAzNeKAkzQwIG1pbi4iLCJUYXBhIDEwIG1pbiwgcGVsYSB5IGNvcnRhIGVuIHRpcmFzLiIsIkFsacOxYSBjb24gYWpvLCBhY2VpdGUgeSB1bmFzIGdvdGFzIGRlIHZpbmFncmUuIl19LHsia2V5IjoiYmFzZS12Mi0wMDUiLCJ0aXRsZSI6Ik1lbmVzdHJhIGRlIHZlcmR1cmFzIHNhbHRlYWRhIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjMwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMjAwIGcganVkw61hcyB2ZXJkZXMifSx7Im5hbWUiOiJndWlzYW50ZXMiLCJxdWFudGl0eSI6MTUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiemFuYWhvcmlhcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWxjYWNob2ZhcyBjb25nZWxhZGFzIiwicXVhbnRpdHkiOjE1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImRpZW50ZSBkZSBham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSIsInF1YW50aXR5IjoyMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJzYWwifV0sInN0ZXBzIjpbIiogQ3VlY2UgbyBjb2NpbmEgYWwgdmFwb3IgbGFzIHZlcmR1cmFzIGhhc3RhIHRpZXJuYXMuIiwiRG9yYSBham8gbGFtaW5hZG8gZW4gYWNlaXRlLiIsIlNhbHRlYSB0b2RvIDPigJM0IG1pbiB5IGFqdXN0YSBkZSBzYWwuIl19LHsia2V5IjoiYmFzZS12Mi0wMDYiLCJ0aXRsZSI6IkNyZW1hIGRlIGNhbGFiYWPDrW4geSBwdWVycm8iLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MzAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAyIGNhbGFiYWNpbmVzIn0seyJuYW1lIjoicHVlcnJvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJwYXRhdGEgcGVxdWXDsWEiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGRvIGRlIHZlcmR1cmFzIiwicXVhbnRpdHkiOjcwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJhY2VpdGUiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiY3VjaGFyYWRhcyBkZSB5b2d1ciBuYXR1cmFsIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJzYWwifV0sInN0ZXBzIjpbIiogUmVob2dhIHB1ZXJybyB5IHBhdGF0YS4iLCJBw7FhZGUgY2FsYWJhY8OtbiwgY3VicmUgY29uIGNhbGRvIHkgY3VlY2UgMjAgbWluLiIsIlRyaXR1cmEsIGHDsWFkZSB5b2d1ciB5IGFqdXN0YSB0ZXh0dXJhIGNvbiBjYWxkby4iXX0seyJrZXkiOiJiYXNlLXYyLTAwNyIsInRpdGxlIjoiQ3JlbWEgZGUgY2FsYWJhemEgY29uIGdhcmJhbnpvcyBhbCBob3JubyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjozNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDUwMCBnIGNhbGFiYXphIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJwYXRhdGEgcGVxdWXDsWEiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGRvIiwicXVhbnRpdHkiOjYwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJnYXJiYW56b3MgY29jaWRvcyIsInF1YW50aXR5IjoyMDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhY2VpdGUiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoicGltZW50w7NuIGR1bGNlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEFzYSBnYXJiYW56b3MgZXNjdXJyaWRvcyBjb24gYWNlaXRlIHkgcGltZW50w7NuIGEgMjAwIMKwQyBkdXJhbnRlIDE1IG1pbi4iLCJDdWVjZSBjYWxhYmF6YSwgY2Vib2xsYSB5IHBhdGF0YSBjb24gY2FsZG8uIiwiVHJpdHVyYSB5IHNpcnZlIGNvbiBnYXJiYW56b3MgY3J1amllbnRlcy4iXX0seyJrZXkiOiJiYXNlLXYyLTAwOCIsInRpdGxlIjoiU29wYSBkZSB0b21hdGUgeSBhbGJhaGFjYSIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjozMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDcwMCBnIHRvbWF0ZSBtYWR1cm8ifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImRpZW50ZSBkZSBham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGRvIGRlIHZlcmR1cmFzIiwicXVhbnRpdHkiOjUwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJwYW4iLCJxdWFudGl0eSI6NDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhbGJhaGFjYSJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCIsInF1YW50aXR5IjoyMCwidW5pdF9jb2RlIjoibWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBjZWJvbGxhIHkgYWpvLiIsIkHDsWFkZSB0b21hdGUsIGNhbGRvIHkgcGFuOyBjdWVjZSAyMCBtaW4uIiwiVHJpdHVyYSwgcmVjdGlmaWNhIGRlIHNhbCB5IHRlcm1pbmEgY29uIGFsYmFoYWNhLiJdfSx7ImtleSI6ImJhc2UtdjItMDA5IiwidGl0bGUiOiJCZXJlbmplbmFzIHJlbGxlbmFzIGRlIHZlcmR1cmFzIHkgdG9tYXRlIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjUwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMiBiZXJlbmplbmFzIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiIxLzIgY2FsYWJhY8OtbiJ9LHsibmFtZSI6IjEvMiBwaW1pZW50byByb2pvIn0seyJuYW1lIjoidG9tYXRlIHRyaXR1cmFkbyIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJxdWVzbyByYWxsYWRvIiwicXVhbnRpdHkiOjYwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYWNlaXRlIiwicXVhbnRpdHkiOjIwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6InNhbCJ9XSwic3RlcHMiOlsiKiBBc2EgYmVyZW5qZW5hcyBwYXJ0aWRhcyAyMCBtaW4gYSAyMDAgwrBDLiIsIlZhY8OtYSBwYXJ0ZSBkZSBsYSBwdWxwYSB5IHNvZnLDrWVsYSBjb24gY2Vib2xsYSwgY2FsYWJhY8OtbiB5IHBpbWllbnRvLiIsIk1lemNsYSB0b21hdGUsIHJlbGxlbmEsIGN1YnJlIGNvbiBxdWVzbyB5IGdyYXRpbmEgMTAgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDEwIiwidGl0bGUiOiJDYWxhYmFjaW5lcyByZWxsZW5vcyBkZSBhcnJveiBpbnRlZ3JhbCB5IHZlcmR1cmFzIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjUwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMiBjYWxhYmFjaW5lcyBncmFuZGVzIn0seyJuYW1lIjoiYXJyb3ogaW50ZWdyYWwgY29jaWRvIiwicXVhbnRpdHkiOjEyMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiemFuYWhvcmlhIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ0b21hdGUiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InF1ZXNvIHJhbGxhZG8iLCJxdWFudGl0eSI6NTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn1dLCJzdGVwcyI6WyIqIEhvcm5lYSBjYWxhYmFjaW5lcyBwYXJ0aWRvcyAyMCBtaW4gYSAyMDAgwrBDLiIsIlNvZnLDrWUgY2Vib2xsYSB5IHphbmFob3JpYSwgYcOxYWRlIHB1bHBhIGRlIGNhbGFiYWPDrW4sIHRvbWF0ZSB5IGFycm96LiIsIlJlbGxlbmEsIGN1YnJlIGNvbiBxdWVzbyB5IGdyYXRpbmEgOCBtaW4uIl19LHsia2V5IjoiYmFzZS12Mi0wMTEiLCJ0aXRsZSI6IkFsY2FjaG9mYXMgc2FsdGVhZGFzIGNvbiBham8geSBsaW3Ds24iLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MjUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA2IGFsY2FjaG9mYXMgbyAzMDAgZyBjb25nZWxhZGFzIn0seyJuYW1lIjoiZGllbnRlcyBkZSBham8iLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBsaW3Ds24ifSx7Im5hbWUiOiJhY2VpdGUiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoicGVyZWppbCB5IHNhbCJ9XSwic3RlcHMiOlsiKiBMaW1waWEgYWxjYWNob2ZhcyB5IGN1w6ljZWxhcyAxMCBtaW4gc2kgc29uIGZyZXNjYXMuIiwiRG9yYSBham8gZW4gYWNlaXRlLCBhw7FhZGUgYWxjYWNob2ZhcyB5IHNhbHRlYSA1IG1pbi4iLCJUZXJtaW5hIGNvbiBsaW3Ds24geSBwZXJlamlsLiJdfSx7ImtleSI6ImJhc2UtdjItMDEyIiwidGl0bGUiOiJKdWTDrWFzIHZlcmRlcyBjb24gcGF0YXRhLCBodWV2byB5IHBpbWVudMOzbiIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjozMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDMwMCBnIGp1ZMOtYXMgdmVyZGVzIn0seyJuYW1lIjoicGF0YXRhcyBwZXF1ZcOxYXMiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6Imh1ZXZvcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiZGllbnRlIGRlIGFqbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWNlaXRlIiwicXVhbnRpdHkiOjIwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6IjEvMiBjdWNoYXJhZGl0YSBwaW1lbnTDs24gZHVsY2UgeSBzYWwifV0sInN0ZXBzIjpbIiogQ3VlY2UganVkw61hcyB5IHBhdGF0YSBlbiBkYWRvcyBoYXN0YSB0aWVybmFzOyBjdWVjZSBsb3MgaHVldm9zIGFwYXJ0ZS4iLCJEb3JhIGFqbywgYXBhZ2EgZnVlZ28geSBhw7FhZGUgcGltZW50w7NuLiIsIk1lemNsYSBjb24gdmVyZHVyYXMgeSBzaXJ2ZSBjb24gaHVldm8uIl19LHsia2V5IjoiYmFzZS12Mi0wMTMiLCJ0aXRsZSI6IkNvbGlmbG9yIGFsIGhvcm5vIGNvbiBwaW1lbnTDs24geSB5b2d1ciIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjozNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDEgY29saWZsb3IgcGVxdWXDsWEifSx7Im5hbWUiOiJhY2VpdGUiLCJxdWFudGl0eSI6MjUsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiY3VjaGFyYWRpdGEgcGltZW50w7NuIGR1bGNlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJzYWwifSx7Im5hbWUiOiJ5b2d1ciBuYXR1cmFsIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgbGltw7NuIHkgcGVyZWppbCJ9XSwic3RlcHMiOlsiKiBTZXBhcmEgcmFtaWxsZXRlcywgbWV6Y2xhIGNvbiBhY2VpdGUsIHBpbWVudMOzbiB5IHNhbC4iLCJBc2EgMjUgbWluIGEgMjEwIMKwQy4iLCJNZXpjbGEgeW9ndXIgY29uIGxpbcOzbiB5IHNpcnZlIHBvciBlbmNpbWEgY29uIHBlcmVqaWwuIl19LHsia2V5IjoiYmFzZS12Mi0wMTQiLCJ0aXRsZSI6IkJyw7Njb2xpIGNvbiBham8sIGxpbcOzbiB5IGFsbWVuZHJhcyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjoyMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDEgYnLDs2NvbGkifSx7Im5hbWUiOiJkaWVudGVzIGRlIGFqbyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWxtZW5kcmFzIGxhbWluYWRhcyIsInF1YW50aXR5IjoyNSwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFjZWl0ZSIsInF1YW50aXR5IjoyMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiIxLzIgbGltw7NuIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEN1ZWNlIGJyw7Njb2xpIGFsIHZhcG9yIDbigJM4IG1pbi4iLCJEb3JhIGFqbyB5IGFsbWVuZHJhcyBlbiBhY2VpdGUuIiwiTWV6Y2xhIGNvbiBicsOzY29saSB5IHRlcm1pbmEgY29uIGxpbcOzbi4iXX0seyJrZXkiOiJiYXNlLXYyLTAxNSIsInRpdGxlIjoiRXNwaW5hY2FzIGNvbiBwYXNhcyB5IHBpw7FvbmVzIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjE1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMzUwIGcgZXNwaW5hY2FzIGZyZXNjYXMifSx7Im5hbWUiOiJwYXNhcyIsInF1YW50aXR5IjoyNSwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6InBpw7FvbmVzIiwicXVhbnRpdHkiOjIwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiZGllbnRlIGRlIGFqbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIiwicXVhbnRpdHkiOjIwLCJ1bml0X2NvZGUiOiJtbCJ9XSwic3RlcHMiOlsiKiBIaWRyYXRhIHBhc2FzIGVuIGFndWEgY2FsaWVudGUuIiwiRG9yYSBham8sIHBpw7FvbmVzIHkgcGFzYXMuIiwiQcOxYWRlIGVzcGluYWNhcyBwb3IgdGFuZGFzLCBzYWx0ZWEgaGFzdGEgcXVlIGJhamVuIHkgc2FsYSBhbCBmaW5hbC4iXX0seyJrZXkiOiJiYXNlLXYyLTAxNiIsInRpdGxlIjoiQWNlbGdhcyByZWhvZ2FkYXMgY29uIHBhdGF0YSB5IGdhcmJhbnpvcyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjozNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQwMCBnIGFjZWxnYXMifSx7Im5hbWUiOiJwYXRhdGEiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImdhcmJhbnpvcyBjb2NpZG9zIiwicXVhbnRpdHkiOjIwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImRpZW50ZXMgZGUgYWpvIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoicGltZW50w7NuIGR1bGNlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEN1ZWNlIGFjZWxnYXMgeSBwYXRhdGEuIiwiRG9yYSBham8gY29uIHBpbWVudMOzbiBmdWVyYSBkZWwgZnVlZ28uIiwiQcOxYWRlIGdhcmJhbnpvcywgYWNlbGdhcyB5IHBhdGF0YTsgcmVob2dhIDUgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDE3IiwidGl0bGUiOiJUb21hdGVzIGFzYWRvcyBjb24gcXVlc28gZnJlc2NvIHkgb3LDqWdhbm8iLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MzAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0IHRvbWF0ZXMgbWVkaWFub3MifSx7Im5hbWUiOiJxdWVzbyBmcmVzY28iLCJxdWFudGl0eSI6MTUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiZGllbnRlIGRlIGFqbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoib3LDqWdhbm8ifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn1dLCJzdGVwcyI6WyIqIENvcnRhIHRvbWF0ZXMsIGFsacOxYSBjb24gYWpvLCBhY2VpdGUsIG9yw6lnYW5vIHkgc2FsLiIsIkhvcm5lYSAyMCBtaW4gYSAyMDAgwrBDLiIsIkHDsWFkZSBxdWVzbyBmcmVzY28gZGVzbWVudXphZG8gYWwgc2VydmlyLiJdfSx7ImtleSI6ImJhc2UtdjItMDE4IiwidGl0bGUiOiJDaGFtcGnDsW9uZXMgYWwgYWppbGxvIGNvbiBwZXJlamlsIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjE1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMzUwIGcgY2hhbXBpw7FvbmVzIn0seyJuYW1lIjoiZGllbnRlcyBkZSBham8iLCJxdWFudGl0eSI6MywidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InBlcmVqaWwifSx7Im5hbWUiOiJhY2VpdGUiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoidmlubyBibGFuY28geSBzYWwiLCJxdWFudGl0eSI6MzAsInVuaXRfY29kZSI6Im1sIn1dLCJzdGVwcyI6WyIqIFNhbHRlYSBjaGFtcGnDsW9uZXMgYSBmdWVnbyBhbHRvIGhhc3RhIHF1ZSBwaWVyZGFuIGFndWEuIiwiQcOxYWRlIGFqbywgdmlubyB5IHNhbDsgZGVqYSBldmFwb3Jhci4iLCJUZXJtaW5hIGNvbiBwZXJlamlsLiJdfSx7ImtleSI6ImJhc2UtdjItMDE5IiwidGl0bGUiOiJFc3DDoXJyYWdvcyB0cmlndWVyb3MgY29uIGh1ZXZvIHBvY2jDqSIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjoyMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDEgbWFub2pvIGRlIGVzcMOhcnJhZ29zIn0seyJuYW1lIjoiaHVldm9zIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJkaWVudGUgZGUgYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUiLCJxdWFudGl0eSI6MTUsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoidmluYWdyZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTYWx0ZWEgZXNww6FycmFnb3MgY29uIGFqbyBoYXN0YSB0aWVybm9zLiIsIkhpZXJ2ZSBhZ3VhIGNvbiB1bmFzIGdvdGFzIGRlIHZpbmFncmUgeSBlc2NhbGZhIGxvcyBodWV2b3MgMyBtaW4uIiwiU2lydmUgc29icmUgZXNww6FycmFnb3MgY29uIHNhbC4iXX0seyJrZXkiOiJiYXNlLXYyLTAyMCIsInRpdGxlIjoiU29wYSBqdWxpYW5hIGRlIHZlcmR1cmFzIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjM1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMSBwdWVycm8ifSx7Im5hbWUiOiJ6YW5haG9yaWFzIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzQgY29sIn0seyJuYW1lIjoicGF0YXRhIHBlcXVlw7FhIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJyYW1hIGRlIGFwaW8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGRvIGRlIHZlcmR1cmFzIiwicXVhbnRpdHkiOjgwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn1dLCJzdGVwcyI6WyIqIENvcnRhIHZlcmR1cmFzIGVuIHRpcmFzIGZpbmFzLiIsIlJlaG9nYSBwdWVycm8geSBhcGlvLCBhw7FhZGUgZWwgcmVzdG8geSBjYWxkby4iLCJDdWVjZSAyNSBtaW4gaGFzdGEgcXVlIHRvZG8gZXN0w6kgdGllcm5vLiJdfSx7ImtleSI6ImJhc2UtdjItMDIxIiwidGl0bGUiOiJMZW50ZWphcyBwYXJkaW5hcyBlc3RvZmFkYXMgY29uIHZlcmR1cmFzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjUwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMTgwIGcgbGVudGVqYXMgcGFyZGluYXMifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6InphbmFob3JpYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIHBpbWllbnRvIHZlcmRlIn0seyJuYW1lIjoidG9tYXRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJwYXRhdGEgcGVxdWXDsWEiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGRvIiwicXVhbnRpdHkiOjcwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJsYXVyZWwifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogUmVob2dhIGNlYm9sbGEsIHphbmFob3JpYSB5IHBpbWllbnRvLiIsIkHDsWFkZSB0b21hdGUsIGxlbnRlamFzLCBwYXRhdGEsIGxhdXJlbCB5IGNhbGRvLiIsIkN1ZWNlIHRhcGFkbyBoYXN0YSB0aWVybmFzIHkgYWp1c3RhIGRlIHNhbC4iXX0seyJrZXkiOiJiYXNlLXYyLTAyMiIsInRpdGxlIjoiTGVudGVqYXMgY29uIGNhbGFiYXphIHkgZXNwaW5hY2FzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQ1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMTgwIGcgbGVudGVqYXMifSx7Im5hbWUiOiJjYWxhYmF6YSIsInF1YW50aXR5IjozMDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJlc3BpbmFjYXMiLCJxdWFudGl0eSI6MTUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJkaWVudGUgYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJjYWxkbyIsInF1YW50aXR5Ijo3MDAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIFJlaG9nYSBjZWJvbGxhIHkgYWpvLiIsIkHDsWFkZSBsZW50ZWphcywgY2FsYWJhemEgeSBjYWxkbzsgY3VlY2UgMzUgbWluLiIsIkluY29ycG9yYSBlc3BpbmFjYXMgbG9zIMO6bHRpbW9zIDMgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDIzIiwidGl0bGUiOiJMZW50ZWphcyBiZWx1Z2EgY29uIHZlcmR1cmFzIGFzYWRhcyB5IGxpbcOzbiIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0NSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDE4MCBnIGxlbnRlamFzIGJlbHVnYSJ9LHsibmFtZSI6ImNhbGFiYWPDrW4iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InBpbWllbnRvIHJvam8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNlYm9sbGEiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBsaW3Ds24ifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwiLCJxdWFudGl0eSI6MjUsInVuaXRfY29kZSI6Im1sIn1dLCJzdGVwcyI6WyIqIEN1ZWNlIGxlbnRlamFzIGhhc3RhIHRpZXJuYXMuIiwiQXNhIHZlcmR1cmFzIGVuIGRhZG9zIGNvbiBhY2VpdGUgeSBzYWwgMjUgbWluIGEgMjAwIMKwQy4iLCJNZXpjbGEgeSBhbGnDsWEgY29uIGxpbcOzbi4iXX0seyJrZXkiOiJiYXNlLXYyLTAyNCIsInRpdGxlIjoiR2FyYmFuem9zIGNvbiBlc3BpbmFjYXMgeSBjb21pbm8iLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MjUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0MDAgZyBnYXJiYW56b3MgY29jaWRvcyJ9LHsibmFtZSI6ImVzcGluYWNhcyIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImFqb3MiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InRvbWF0ZSB0cml0dXJhZG8iLCJxdWFudGl0eSI6MjAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGN1Y2hhcmFkaXRhIGNvbWlubyJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEgeSBham8uIiwiQcOxYWRlIHRvbWF0ZSB5IGNvbWlubywgcmVkdWNlIDUgbWluLiIsIkluY29ycG9yYSBnYXJiYW56b3MgeSBlc3BpbmFjYXMsIGNvY2luYSBoYXN0YSBxdWUgZXN0YXMgYmFqZW4uIl19LHsia2V5IjoiYmFzZS12Mi0wMjUiLCJ0aXRsZSI6IkdhcmJhbnpvcyBndWlzYWRvcyBjb24gYWNlbGdhcyIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjozMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQwMCBnIGdhcmJhbnpvcyBjb2NpZG9zIn0seyJuYW1lIjoiYWNlbGdhcyIsInF1YW50aXR5IjozMDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6InphbmFob3JpYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiZGllbnRlIGFqbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiY2FsZG8iLCJxdWFudGl0eSI6NDUwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImFjZWl0ZSJ9LHsibmFtZSI6InBpbWVudMOzbiBkdWxjZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBSZWhvZ2EgY2Vib2xsYSwgemFuYWhvcmlhIHkgYWpvOyBhw7FhZGUgcGltZW50w7NuIGZ1ZXJhIGRlbCBmdWVnby4iLCJJbmNvcnBvcmEgZ2FyYmFuem9zLCBhY2VsZ2FzIHkgY2FsZG8uIiwiQ3VlY2UgMTUgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDI2IiwidGl0bGUiOiJQb3RhamUgZGUgZ2FyYmFuem9zIGNvbiBiYWNhbGFvIHkgZXNwaW5hY2FzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogNDAwIGcgZ2FyYmFuem9zIGNvY2lkb3MifSx7Im5hbWUiOiJiYWNhbGFvIGRlc2FsYWRvIiwicXVhbnRpdHkiOjE4MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImVzcGluYWNhcyIsInF1YW50aXR5IjoxNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImFqb3MiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGRvIiwicXVhbnRpdHkiOjQ1MCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJwaW1lbnTDs24gZHVsY2UifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBjZWJvbGxhIHkgYWpvIGNvbiBwaW1lbnTDs24gZHVsY2UuIiwiQcOxYWRlIGdhcmJhbnpvcywgZXNwaW5hY2FzIHkgY2FsZG8uIiwiSW5jb3Jwb3JhIGJhY2FsYW8gbG9zIMO6bHRpbW9zIDUgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDI3IiwidGl0bGUiOiJFbnNhbGFkYSB0ZW1wbGFkYSBkZSBnYXJiYW56b3MsIHBpbWllbnRvIHkgYXTDum4iLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MjAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0MDAgZyBnYXJiYW56b3MgY29jaWRvcyJ9LHsibmFtZSI6InBpbWllbnRvIHJvam8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoibGF0YSBkZSBhdMO6biIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoidG9tYXRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUifSx7Im5hbWUiOiJ2aW5hZ3JlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEFzYSBvIHNhbHRlYSBwaW1pZW50byB5IGNlYm9sbGEuIiwiTWV6Y2xhIGNvbiBnYXJiYW56b3MgdGVtcGxhZG9zLCBhdMO6biB5IHRvbWF0ZS4iLCJBbGnDsWEgY29uIGFjZWl0ZSwgdmluYWdyZSB5IHNhbC4iXX0seyJrZXkiOiJiYXNlLXYyLTAyOCIsInRpdGxlIjoiR2FyYmFuem9zIGFsIGhvcm5vIGNvbiBiZXJlbmplbmEgeSB0b21hdGUiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NDUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0MDAgZyBnYXJiYW56b3MgY29jaWRvcyJ9LHsibmFtZSI6ImJlcmVuamVuYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoidG9tYXRlIGNoZXJyeSIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImRpZW50ZSBham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSIsInF1YW50aXR5IjoyNSwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJvcsOpZ2FubyB5IHNhbCJ9XSwic3RlcHMiOlsiKiBNZXpjbGEgdG9kbyBlbiBmdWVudGUgY29uIGFjZWl0ZSwgb3LDqWdhbm8geSBzYWwuIiwiSG9ybmVhIDMwIG1pbiBhIDIwMCDCsEMsIHJlbW92aWVuZG8gYSBtaXRhZC4iLCJTaXJ2ZSB0ZW1wbGFkby4iXX0seyJrZXkiOiJiYXNlLXYyLTAyOSIsInRpdGxlIjoiQWx1YmlhcyBibGFuY2FzIGNvbiB2ZXJkdXJhcyB5IHJvbWVybyIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjozNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQwMCBnIGFsdWJpYXMgY29jaWRhcyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiemFuYWhvcmlhcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiY2FsYWJhY8OtbiIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiY2FsZG8iLCJxdWFudGl0eSI6NDAwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6InJvbWVybyJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEsIHphbmFob3JpYSB5IGNhbGFiYWPDrW4uIiwiQcOxYWRlIGFsdWJpYXMsIHJvbWVybyB5IGNhbGRvLiIsIkN1ZWNlIDE1IG1pbiBoYXN0YSBpbnRlZ3Jhci4iXX0seyJrZXkiOiJiYXNlLXYyLTAzMCIsInRpdGxlIjoiQWx1YmlhcyBjb24gY2FsYWJhemEgeSBhY2VsZ2FzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjM1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogNDAwIGcgYWx1YmlhcyBjb2NpZGFzIn0seyJuYW1lIjoiY2FsYWJhemEiLCJxdWFudGl0eSI6MzAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYWNlbGdhcyIsInF1YW50aXR5IjoxNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImFqbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiY2FsZG8iLCJxdWFudGl0eSI6NDUwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBSZWhvZ2EgY2Vib2xsYSB5IGFqbywgYcOxYWRlIGNhbGFiYXphIHkgY2FsZG8uIiwiQ3VlY2UgMTUgbWluLCBhZ3JlZ2EgYWx1YmlhcyB5IGFjZWxnYXMgeSB0ZXJtaW5hIDggbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDMxIiwidGl0bGUiOiJGYWJlcyBsaWdlcmFzIGNvbiBhbG1lamFzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjM1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogNDAwIGcgYWx1YmlhcyBibGFuY2FzIGNvY2lkYXMifSx7Im5hbWUiOiJhbG1lamFzIiwicXVhbnRpdHkiOjM1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiYWpvcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoidmlubyBibGFuY28iLCJxdWFudGl0eSI6NzUsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiY2FsZG8iLCJxdWFudGl0eSI6MzUwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6InBlcmVqaWwgeSBhY2VpdGUifV0sInN0ZXBzIjpbIiogU29mcsOtZSBjZWJvbGxhIHkgYWpvLCBtb2phIGNvbiB2aW5vLiIsIkHDsWFkZSBhbHViaWFzIHkgY2FsZG87IGN1ZWNlIDEwIG1pbi4iLCJJbmNvcnBvcmEgYWxtZWphcyBoYXN0YSBhYnJpciB5IHRlcm1pbmEgY29uIHBlcmVqaWwuIl19LHsia2V5IjoiYmFzZS12Mi0wMzIiLCJ0aXRsZSI6IkVuc2FsYWRhIGRlIGFsdWJpYXMsIHRvbWF0ZSwgcGVwaW5vIHkgaHVldm8iLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MjAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0MDAgZyBhbHViaWFzIGNvY2lkYXMifSx7Im5hbWUiOiJ0b21hdGVzIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgcGVwaW5vIn0seyJuYW1lIjoiaHVldm9zIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzQgY2Vib2xsYSJ9LHsibmFtZSI6ImFjZWl0ZSJ9LHsibmFtZSI6InZpbmFncmUgeSBzYWwifV0sInN0ZXBzIjpbIiogQ3VlY2UgaHVldm9zIDEwIG1pbi4iLCJNZXpjbGEgYWx1YmlhcyBjb24gdmVyZHVyYXMgZW4gZGFkb3MuIiwiQWxpw7FhIHkgY29yb25hIGNvbiBodWV2byBwYXJ0aWRvLiJdfSx7ImtleSI6ImJhc2UtdjItMDMzIiwidGl0bGUiOiJKdWTDrWFzIHBpbnRhcyBjb24gdmVyZHVyYXMgeSBhcnJveiBpbnRlZ3JhbCIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0MCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQwMCBnIGp1ZMOtYXMgcGludGFzIGNvY2lkYXMifSx7Im5hbWUiOiJhcnJveiBpbnRlZ3JhbCBjb2NpZG8iLCJxdWFudGl0eSI6MTIwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJ6YW5haG9yaWEiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBwaW1pZW50byJ9LHsibmFtZSI6ImNhbGRvIiwicXVhbnRpdHkiOjQwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogUmVob2dhIHZlcmR1cmFzLiIsIkHDsWFkZSBqdWTDrWFzIHkgY2FsZG8sIGN1ZWNlIDEyIG1pbi4iLCJNZXpjbGEgZWwgYXJyb3ogYWwgZmluYWwgeSBjYWxpZW50YSAyIG1pbi4iXX0seyJrZXkiOiJiYXNlLXYyLTAzNCIsInRpdGxlIjoiQWx1YmlhcyByb2phcyBndWlzYWRhcyBjb24gdmVyZHVyYXMgeSBwaW1lbnTDs24gZHVsY2UiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MzUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0MDAgZyBhbHViaWFzIHJvamFzIGNvY2lkYXMifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6InphbmFob3JpYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIHBpbWllbnRvIHJvam8ifSx7Im5hbWUiOiJ0b21hdGUgdHJpdHVyYWRvIiwicXVhbnRpdHkiOjIwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6InBpbWVudMOzbiBkdWxjZSJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGxhcyB2ZXJkdXJhcywgYcOxYWRlIHRvbWF0ZSB5IHBpbWVudMOzbiBkdWxjZS4iLCJJbmNvcnBvcmEgYWx1YmlhcyB5IDMwMCBtbCBkZSBhZ3VhLiIsIkN1ZWNlIDE1IG1pbi4iXX0seyJrZXkiOiJiYXNlLXYyLTAzNSIsInRpdGxlIjoiSHVtbXVzIGNvbiBjcnVkaXTDqXMgeSBwYW4gaW50ZWdyYWwiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MTUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0MDAgZyBnYXJiYW56b3MgY29jaWRvcyJ9LHsibmFtZSI6IjEvMiBsaW3Ds24ifSx7Im5hbWUiOiJham8gcGVxdWXDsW8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSIsInF1YW50aXR5IjozMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJhZ3VhIiwicXVhbnRpdHkiOjMwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6InNhbCJ9LHsibmFtZSI6InphbmFob3JpYSJ9LHsibmFtZSI6InBlcGlubyB5IDQgcmViYW5hZGFzIHBhbiBpbnRlZ3JhbCJ9XSwic3RlcHMiOlsiKiBUcml0dXJhIGdhcmJhbnpvcyBjb24gbGltw7NuLCBham8sIGFjZWl0ZSwgYWd1YSB5IHNhbCBoYXN0YSBjcmVtb3NvLiIsIkFqdXN0YSBhZ3VhLiIsIlNpcnZlIGNvbiB2ZXJkdXJhcyBjb3J0YWRhcyB5IHBhbi4iXX0seyJrZXkiOiJiYXNlLXYyLTAzNiIsInRpdGxlIjoiRmFsYWZlbCBhbCBob3JubyBjb24gZW5zYWxhZGEgZGUgeW9ndXIiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NDUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0MDAgZyBnYXJiYW56b3MgY29jaWRvcyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJwZXJlamlsIn0seyJuYW1lIjoicGFuIHJhbGxhZG8iLCJxdWFudGl0eSI6MzAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJ5b2d1ciBuYXR1cmFsIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgcGVwaW5vIn0seyJuYW1lIjoiMS8yIGxpbcOzbiJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBUcml0dXJhIGdhcmJhbnpvcyBjb24gY2Vib2xsYSwgYWpvLCBwZXJlamlsLCBzYWwgeSBwYW4gcmFsbGFkby4iLCJGb3JtYSBib2xhcywgcGluY2VsYSBjb24gYWNlaXRlIHkgaG9ybmVhIDI1IG1pbiBhIDIwMCDCsEMuIiwiTWV6Y2xhIHlvZ3VyLCBwZXBpbm8geSBsaW3Ds24gcGFyYSBhY29tcGHDsWFyLiJdfSx7ImtleSI6ImJhc2UtdjItMDM3IiwidGl0bGUiOiJIYW1idXJndWVzYXMgZGUgbGVudGVqYXMgeSBhdmVuYSIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjozNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQwMCBnIGxlbnRlamFzIGNvY2lkYXMifSx7Im5hbWUiOiJjb3BvcyBkZSBhdmVuYSIsInF1YW50aXR5Ijo0MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiemFuYWhvcmlhIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJodWV2byIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIiwicXVhbnRpdHkiOjIwLCJ1bml0X2NvZGUiOiJtbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEgeSB6YW5haG9yaWEuIiwiTWFjaGFjYSBsZW50ZWphcyB5IG1lemNsYSBjb24gdmVyZHVyYXMsIGF2ZW5hLCBodWV2byB5IHNhbC4iLCJGb3JtYSBjdWF0cm8gaGFtYnVyZ3Vlc2FzIHkgZMOzcmFsYXMgNCBtaW4gcG9yIGxhZG8uIl19LHsia2V5IjoiYmFzZS12Mi0wMzgiLCJ0aXRsZSI6IkFsYsOzbmRpZ2FzIGRlIGdhcmJhbnpvIGVuIHNhbHNhIGRlIHRvbWF0ZSIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0MCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQwMCBnIGdhcmJhbnpvcyBjb2NpZG9zIn0seyJuYW1lIjoiaHVldm8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InBhbiByYWxsYWRvIiwicXVhbnRpdHkiOjQwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJwZXJlamlsIn0seyJuYW1lIjoidG9tYXRlIHRyaXR1cmFkbyIsInF1YW50aXR5Ijo0MDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBUcml0dXJhIGdhcmJhbnpvcyBjb24gaHVldm8sIHBhbiwgYWpvIHkgcGVyZWppbDsgZm9ybWEgYWxiw7NuZGlnYXMgeSBob3Juw6lhbGFzIDE1IG1pbiBhIDIwMCDCsEMuIiwiU29mcsOtZSBjZWJvbGxhIHkgdG9tYXRlIDE1IG1pbi4iLCJNZXpjbGEgeSBjdWVjZSA1IG1pbi4iXX0seyJrZXkiOiJiYXNlLXYyLTAzOSIsInRpdGxlIjoiR3Vpc28gZGUgZ3Vpc2FudGVzIGNvbiBhbGNhY2hvZmFzIHkgaHVldm8iLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MzUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAyNTAgZyBndWlzYW50ZXMifSx7Im5hbWUiOiJhbGNhY2hvZmFzIiwicXVhbnRpdHkiOjI1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJjYWxkbyIsInF1YW50aXR5IjozMDAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiaHVldm9zIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogUmVob2dhIGNlYm9sbGEgeSBham8uIiwiQcOxYWRlIGFsY2FjaG9mYXMsIGd1aXNhbnRlcyB5IGNhbGRvLCBjdWVjZSAxNSBtaW4uIiwiQWJyZSBkb3MgaHVlY29zLCBjYXNjYSBodWV2b3MgeSBjdWFqYSB0YXBhZG8uIl19LHsia2V5IjoiYmFzZS12Mi0wNDAiLCJ0aXRsZSI6IkhhYmFzIHRpZXJuYXMgY29uIGphbcOzbiwgY2Vib2xsYSB5IG1lbnRhIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjI1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMzUwIGcgaGFiYXMgdGllcm5hcyJ9LHsibmFtZSI6ImphbcOzbiBzZXJyYW5vIiwicXVhbnRpdHkiOjYwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJtZW50YSBmcmVzY2EifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn1dLCJzdGVwcyI6WyIqIFNvZnLDrWUgY2Vib2xsYSBoYXN0YSB0cmFuc3BhcmVudGUuIiwiQcOxYWRlIGhhYmFzIHkgdW4gY2hvcnJpdG8gZGUgYWd1YSwgdGFwYSAxMCBtaW4uIiwiSW5jb3Jwb3JhIGphbcOzbiwgc2FsdGVhIHVuIG1pbnV0byB5IHRlcm1pbmEgY29uIG1lbnRhLiJdfSx7ImtleSI6ImJhc2UtdjItMDQxIiwidGl0bGUiOiJBcnJveiBjYWxkb3NvIGRlIHZlcmR1cmFzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQ1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMTYwIGcgYXJyb3ogcmVkb25kbyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiMS8yIHBpbWllbnRvIHJvam8ifSx7Im5hbWUiOiJjYWxhYmFjw61uIHBlcXVlw7FvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ6YW5haG9yaWEiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGRvIGRlIHZlcmR1cmFzIiwicXVhbnRpdHkiOjgwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJ0b21hdGUgdHJpdHVyYWRvIiwicXVhbnRpdHkiOjEwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGxhcyB2ZXJkdXJhcyBwaWNhZGFzIDggbWluIHkgYcOxYWRlIHRvbWF0ZS4iLCJJbmNvcnBvcmEgYXJyb3ogeSByZWhvZ2EgdW4gbWludXRvLiIsIlZpZXJ0ZSBjYWxkbyBjYWxpZW50ZSwgc2FsYSB5IGN1ZWNlIDE4IG1pbjsgZGVqYSByZXBvc2FyIDMgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDQyIiwidGl0bGUiOiJBcnJveiBjb24gcG9sbG8sIHZlcmR1cmFzIHkgbGltw7NuIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQ1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMTgwIGcgYXJyb3ogcmVkb25kbyJ9LHsibmFtZSI6ImNvbnRyYW11c2xvcyBkZSBwb2xsbyBkZXNodWVzYWRvcyIsInF1YW50aXR5IjozMDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6IjEvMiBwaW1pZW50byByb2pvIn0seyJuYW1lIjoianVkw61hcyB2ZXJkZXMiLCJxdWFudGl0eSI6MTAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiY2FsZG8gZGUgcG9sbG8iLCJxdWFudGl0eSI6NzAwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6IjEvMiBsaW3Ds24ifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogRG9yYSBlbCBwb2xsbyB0cm9jZWFkbyB5IHJlc8OpcnZhbG8uIiwiU29mcsOtZSBjZWJvbGxhLCBwaW1pZW50byB5IGp1ZMOtYXM7IGHDsWFkZSBhcnJveiB5IGNhbGRvLiIsIkRldnVlbHZlIGVsIHBvbGxvLCBjdWVjZSAxOCBtaW4geSB0ZXJtaW5hIGNvbiByYWxsYWR1cmEgZGUgbGltw7NuLiJdfSx7ImtleSI6ImJhc2UtdjItMDQzIiwidGl0bGUiOiJBcnJveiBhbCBob3JubyBjb24gZ2FyYmFuem9zIHkgdG9tYXRlIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjUwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMTYwIGcgYXJyb3ogcmVkb25kbyJ9LHsibmFtZSI6ImdhcmJhbnpvcyBjb2NpZG9zIiwicXVhbnRpdHkiOjI1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6InRvbWF0ZXMiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiY2FsZG8gZGUgdmVyZHVyYXMiLCJxdWFudGl0eSI6NDUwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImFqbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWNlaXRlIn0seyJuYW1lIjoicGltZW50w7NuIGR1bGNlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIFNvZnLDrWUgY2Vib2xsYSB5IGFqbywgYcOxYWRlIHBpbWVudMOzbiB5IGVsIGFycm96LiIsIlBhc2EgYSB1bmEgZnVlbnRlIGNvbiBnYXJiYW56b3MsIHRvbWF0ZSBlbiByb2RhamFzIHkgY2FsZG8gY2FsaWVudGUuIiwiSG9ybmVhIDI1IG1pbiBhIDIwMCDCsEMgeSByZXBvc2EgNSBtaW4uIl19LHsia2V5IjoiYmFzZS12Mi0wNDQiLCJ0aXRsZSI6IkFycm96IG1lbG9zbyBkZSBzZXRhcyB5IGVzcGluYWNhcyIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0MCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDE2MCBnIGFycm96IHJlZG9uZG8ifSx7Im5hbWUiOiJjaGFtcGnDsW9uZXMiLCJxdWFudGl0eSI6MjUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiZXNwaW5hY2FzIiwicXVhbnRpdHkiOjE1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiY2FsZG8gZGUgdmVyZHVyYXMiLCJxdWFudGl0eSI6NjUwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6InF1ZXNvIHJhbGxhZG8iLCJxdWFudGl0eSI6MzAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBjZWJvbGxhIHkgY2hhbXBpw7FvbmVzIGhhc3RhIGRvcmFyLiIsIkHDsWFkZSBhcnJveiB5IGNhbGRvIHBvY28gYSBwb2NvIGR1cmFudGUgMTggbWluLiIsIkluY29ycG9yYSBlc3BpbmFjYXMsIHF1ZXNvIHkgZGVqYSByZXBvc2FyIDIgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDQ1IiwidGl0bGUiOiJQYWVsbGEgZGUgdmVyZHVyYXMgZGUgdGVtcG9yYWRhIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjUwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMTgwIGcgYXJyb3ogcmVkb25kbyJ9LHsibmFtZSI6Imp1ZMOtYXMgdmVyZGVzIiwicXVhbnRpdHkiOjEwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFsY2FjaG9mYXMiLCJxdWFudGl0eSI6MTUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIHBpbWllbnRvIHJvam8ifSx7Im5hbWUiOiJnYXJyb2bDs24gbyBhbHViaWFzIGJsYW5jYXMgY29jaWRhcyIsInF1YW50aXR5IjoxMDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJjYWxkbyIsInF1YW50aXR5Ijo3MDAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiYXphZnLDoW4gbyBjb2xvcmFudGUifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU2FsdGVhIHZlcmR1cmFzIGVuIHBhZWxsZXJhLiIsIkHDsWFkZSBhcnJveiwgYXphZnLDoW4geSBjYWxkbyBjYWxpZW50ZS4iLCJDdWVjZSAxOCBtaW4gc2luIHJlbW92ZXIgeSBkZWphIHJlcG9zYXIgdGFwYWRvIDUgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDQ2IiwidGl0bGUiOiJBcnJveiBjb24gc2VwaWEsIGd1aXNhbnRlcyB5IGFsY2FjaG9mYXMiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NTAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAxODAgZyBhcnJveiByZWRvbmRvIn0seyJuYW1lIjoic2VwaWEgbGltcGlhIiwicXVhbnRpdHkiOjMwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6Imd1aXNhbnRlcyIsInF1YW50aXR5IjoxNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhbGNhY2hvZmFzIiwicXVhbnRpdHkiOjE1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiY2FsZG8gZGUgcGVzY2FkbyIsInF1YW50aXR5Ijo3MDAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIFNhbHRlYSBsYSBzZXBpYSB5IHJlc8OpcnZhbGEuIiwiU29mcsOtZSBjZWJvbGxhIHkgYWxjYWNob2ZhcywgYcOxYWRlIGFycm96LCBjYWxkbyB5IGd1aXNhbnRlcy4iLCJEZXZ1ZWx2ZSBsYSBzZXBpYSwgY3VlY2UgMTggbWluIHkgcmVwb3NhIDUgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDQ3IiwidGl0bGUiOiJBcnJveiBuZWdybyBjb24gY2FsYW1hciB5IGFsaW9saSBkZSB5b2d1ciIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo1MCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDE4MCBnIGFycm96IHJlZG9uZG8ifSx7Im5hbWUiOiJjYWxhbWFyIGxpbXBpbyIsInF1YW50aXR5IjozMDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImFqbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiY2FsZG8gZGUgcGVzY2FkbyIsInF1YW50aXR5Ijo3MDAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoic29icmUgdGludGEgZGUgY2FsYW1hciIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoieW9ndXIgbmF0dXJhbCIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIGFqbyJ9LHsibmFtZSI6ImxpbcOzbiJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTYWx0ZWEgY2FsYW1hciB5IHJlc8OpcnZhbG87IHNvZnLDrWUgY2Vib2xsYSB5IGFqby4iLCJBw7FhZGUgYXJyb3osIHRpbnRhIGRpc3VlbHRhIHkgY2FsZG87IGN1ZWNlIDE4IG1pbiBjb24gZWwgY2FsYW1hci4iLCJNZXpjbGEgeW9ndXIsIGFqbyBtdXkgcGljYWRvIHkgbGltw7NuIHBhcmEgc2VydmlyLiJdfSx7ImtleSI6ImJhc2UtdjItMDQ4IiwidGl0bGUiOiJGaWRldcOhIGRlIHZlcmR1cmFzIHkgcGVzY2FkbyBibGFuY28iLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NDAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAxODAgZyBmaWRlb3MgcGFyYSBmaWRldcOhIn0seyJuYW1lIjoibWVybHV6YSIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgcGltaWVudG8gcm9qbyJ9LHsibmFtZSI6IjEvMiBjYWxhYmFjw61uIn0seyJuYW1lIjoidG9tYXRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJjYWxkbyBkZSBwZXNjYWRvIiwicXVhbnRpdHkiOjYwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogVHVlc3RhIGxvcyBmaWRlb3MgY29uIGFjZWl0ZSB5IHJlc2VydmEuIiwiU29mcsOtZSB2ZXJkdXJhcyB5IHRvbWF0ZSwgYcOxYWRlIG1lcmx1emEgZW4gZGFkb3MsIGZpZGVvcyB5IGNhbGRvLiIsIkN1ZWNlIDEwIG1pbiwgcmVwb3NhIDUgbWluIHkgc2lydmUuIl19LHsia2V5IjoiYmFzZS12Mi0wNDkiLCJ0aXRsZSI6IkN1c2PDunMgaW50ZWdyYWwgY29uIHZlcmR1cmFzIGFzYWRhcyB5IGdhcmJhbnpvcyIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjozNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDE0MCBnIGN1c2PDunMgaW50ZWdyYWwifSx7Im5hbWUiOiJnYXJiYW56b3MgY29jaWRvcyIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJjYWxhYmFjw61uIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgcGltaWVudG8gcm9qbyJ9LHsibmFtZSI6InphbmFob3JpYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWd1YSBjYWxpZW50ZSIsInF1YW50aXR5IjoxODAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiMS8yIGxpbcOzbiJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBBc2EgdmVyZHVyYXMgY29ydGFkYXMgY29uIGFjZWl0ZSB5IHNhbCAyMCBtaW4gYSAyMDAgwrBDLiIsIkhpZHJhdGEgZWwgY3VzY8O6cyBjb24gYWd1YSBjYWxpZW50ZSB5IHRhcGEgNSBtaW4uIiwiU3VlbHRhIGNvbiB0ZW5lZG9yIHkgbWV6Y2xhIGNvbiBnYXJiYW56b3MsIHZlcmR1cmFzIHkgbGltw7NuLiJdfSx7ImtleSI6ImJhc2UtdjItMDUwIiwidGl0bGUiOiJDdXNjw7pzIGRlIHZlcmR1cmFzIGNvbiB0b21hdGUsIHBlcGlubyB5IHF1ZXNvIGZyZXNjbyIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjoyMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDE0MCBnIGN1c2PDunMifSx7Im5hbWUiOiJhZ3VhIGNhbGllbnRlIiwicXVhbnRpdHkiOjE4MCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJ0b21hdGVzIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgcGVwaW5vIn0seyJuYW1lIjoicXVlc28gZnJlc2NvIiwicXVhbnRpdHkiOjEyMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvNCBjZWJvbGxhIn0seyJuYW1lIjoicGVyZWppbCJ9LHsibmFtZSI6ImFjZWl0ZSJ9LHsibmFtZSI6InZpbmFncmUgeSBzYWwifV0sInN0ZXBzIjpbIiogSGlkcmF0YSBlbCBjdXNjw7pzIDUgbWluIHkgc3XDqWx0YWxvLiIsIkNvcnRhIHRvbWF0ZSwgcGVwaW5vLCBjZWJvbGxhIHkgcXVlc28uIiwiTWV6Y2xhLCBhbGnDsWEgY29uIGFjZWl0ZSB5IHZpbmFncmUsIHkgYcOxYWRlIHBlcmVqaWwuIl19LHsia2V5IjoiYmFzZS12Mi0wNTEiLCJ0aXRsZSI6IkFycm96IGludGVncmFsIGNvbiBjYWxhYmFjw61uLCB0b21hdGUgeSBodWV2byIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjozMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDE1MCBnIGFycm96IGludGVncmFsIGNvY2lkbyJ9LHsibmFtZSI6ImNhbGFiYWPDrW4iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InRvbWF0ZXMiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6Imh1ZXZvcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBjZWJvbGxhIHkgY2FsYWJhY8OtbiAxMCBtaW4uIiwiQcOxYWRlIHRvbWF0ZSBlbiBkYWRvcyB5IGVsIGFycm96IHBhcmEgY2FsZW50YXJsby4iLCJDb2NpbmEgZG9zIGh1ZXZvcyBhIGxhIHBsYW5jaGEgbyBwb2Now6kgeSBzaXJ2ZSBlbmNpbWEuIl19LHsia2V5IjoiYmFzZS12Mi0wNTIiLCJ0aXRsZSI6IlBhc3RhIGludGVncmFsIGNvbiB0b21hdGUgY2hlcnJ5LCBhbGJhaGFjYSB5IGF0w7puIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjI1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMTYwIGcgcGFzdGEgaW50ZWdyYWwifSx7Im5hbWUiOiJ0b21hdGUgY2hlcnJ5IiwicXVhbnRpdHkiOjIwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImxhdGEgZGUgYXTDum4gYWwgbmF0dXJhbCIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhbGJhaGFjYSJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCIsInF1YW50aXR5IjoyMCwidW5pdF9jb2RlIjoibWwifV0sInN0ZXBzIjpbIiogQ3VlY2UgbGEgcGFzdGEgc2Vnw7puIGVsIGVudmFzZS4iLCJTYWx0ZWEgYWpvIHkgdG9tYXRlcyBwYXJ0aWRvcyBoYXN0YSBxdWUgc2UgYWJsYW5kZW4uIiwiTWV6Y2xhIGNvbiBwYXN0YSwgYXTDum4gZXNjdXJyaWRvLCBhbGJhaGFjYSB5IHVuIHBvY28gZGVsIGFndWEgZGUgY29jY2nDs24uIl19LHsia2V5IjoiYmFzZS12Mi0wNTMiLCJ0aXRsZSI6IkVzcGFndWV0aXMgaW50ZWdyYWxlcyBjb24gY2FsYWJhY8OtbiB5IGxpbcOzbiIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjoyNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDE2MCBnIGVzcGFndWV0aXMgaW50ZWdyYWxlcyJ9LHsibmFtZSI6ImNhbGFiYWPDrW4gZ3JhbmRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBsaW3Ds24ifSx7Im5hbWUiOiJxdWVzbyByYWxsYWRvIiwicXVhbnRpdHkiOjMwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEN1ZWNlIGxvcyBlc3BhZ3VldGlzLiIsIlNhbHRlYSBjYWxhYmFjw61uIGVuIG1lZGlhcyBsdW5hcyBjb24gYWpvIDggbWluLiIsIk1lemNsYSBjb24gcGFzdGEsIHJhbGxhZHVyYSB5IHp1bW8gZGUgbGltw7NuLCBxdWVzbyB5IHVuIHBvY28gZGUgYWd1YSBkZSBjb2NjacOzbi4iXX0seyJrZXkiOiJiYXNlLXYyLTA1NCIsInRpdGxlIjoiTWFjYXJyb25lcyBjb24gYm9sb8OxZXNhIGRlIGxlbnRlamFzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMTYwIGcgbWFjYXJyb25lcyBpbnRlZ3JhbGVzIn0seyJuYW1lIjoibGVudGVqYXMgY29jaWRhcyIsInF1YW50aXR5IjozMDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6InphbmFob3JpYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoicmFtYSBkZSBhcGlvIG9wY2lvbmFsIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ0b21hdGUgdHJpdHVyYWRvIiwicXVhbnRpdHkiOjQwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIHZlcmR1cmFzIG11eSBwaWNhZGFzIDggbWluLiIsIkHDsWFkZSBsZW50ZWphcyBtYWNoYWNhZGFzIGVuIHBhcnRlIHkgdG9tYXRlOyBjdWVjZSAxNSBtaW4uIiwiQ3VlY2UgcGFzdGEgeSBtw6l6Y2xhbGEgY29uIGxhIHNhbHNhLiJdfSx7ImtleSI6ImJhc2UtdjItMDU1IiwidGl0bGUiOiJQYXN0YSBjb24gZXNwaW5hY2FzLCByZXF1ZXPDs24geSBudWVjZXMiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MjUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAxNjAgZyBwYXN0YSBpbnRlZ3JhbCJ9LHsibmFtZSI6ImVzcGluYWNhcyIsInF1YW50aXR5IjoxNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJyZXF1ZXPDs24iLCJxdWFudGl0eSI6MTUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoibnVlY2VzIiwicXVhbnRpdHkiOjMwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUifSx7Im5hbWUiOiJwaW1pZW50YSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBDdWVjZSBwYXN0YSB5IHJlc2VydmEgdW4gcG9jbyBkZSBhZ3VhLiIsIlNhbHRlYSBham8geSBlc3BpbmFjYXMgaGFzdGEgcXVlIGJhamVuLiIsIk1lemNsYSBjb24gcGFzdGEsIHJlcXVlc8OzbiwgbnVlY2VzIHBpY2FkYXMgeSBhZ3VhIGRlIGNvY2Npw7NuIHBhcmEgbGlnYXIuIl19LHsia2V5IjoiYmFzZS12Mi0wNTYiLCJ0aXRsZSI6IlBhc3RhIGNvbiBzYXJkaW5hcywgdG9tYXRlIHkgcGFzYXMiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MzAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAxNjAgZyBwYXN0YSJ9LHsibmFtZSI6ImxhdGFzIGRlIHNhcmRpbmFzIGVuIGFjZWl0ZSIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoidG9tYXRlIHRyaXR1cmFkbyIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJwYXNhcyIsInF1YW50aXR5IjoyNSwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoicGVyZWppbCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEsIGHDsWFkZSB0b21hdGUgeSBwYXNhcywgeSBjdWVjZSAxMiBtaW4uIiwiQ3VlY2UgcGFzdGEuIiwiTWV6Y2xhIGNvbiBzYXJkaW5hcyBkZXNtZW51emFkYXMgeSBwZXJlamlsLCBzaW4gcm9tcGVybGFzIGRlbWFzaWFkby4iXX0seyJrZXkiOiJiYXNlLXYyLTA1NyIsInRpdGxlIjoiQ2FuZWxvbmVzIGRlIGVzcGluYWNhIHkgc2V0YXMiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NTUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAxMCBwbGFjYXMgZGUgY2FuZWzDs24ifSx7Im5hbWUiOiJjaGFtcGnDsW9uZXMiLCJxdWFudGl0eSI6MjUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiZXNwaW5hY2FzIiwicXVhbnRpdHkiOjIwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoibGVjaGUiLCJxdWFudGl0eSI6MzAwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImhhcmluYSIsInF1YW50aXR5IjoyMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6Im1hbnRlcXVpbGxhIiwicXVhbnRpdHkiOjIwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoicXVlc28gcmFsbGFkbyIsInF1YW50aXR5Ijo0MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6InNhbCB5IG51ZXogbW9zY2FkYSJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEsIHNldGFzIHkgZXNwaW5hY2FzOyBwaWNhIGVsIHJlbGxlbm8uIiwiSGF6IGJlY2hhbWVsIGNvbiBtYW50ZXF1aWxsYSwgaGFyaW5hIHkgbGVjaGUuIiwiUmVsbGVuYSBwbGFjYXMsIGN1YnJlIGNvbiBiZWNoYW1lbCB5IHF1ZXNvIHkgaG9ybmVhIDIwIG1pbiBhIDIwMCDCsEMuIl19LHsia2V5IjoiYmFzZS12Mi0wNTgiLCJ0aXRsZSI6Ikxhc2HDsWEgZGUgdmVyZHVyYXMgYXNhZGFzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjYwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogOCBwbGFjYXMgZGUgbGFzYcOxYSJ9LHsibmFtZSI6ImJlcmVuamVuYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiY2FsYWJhY8OtbiIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIHBpbWllbnRvIHJvam8ifSx7Im5hbWUiOiJ0b21hdGUgdHJpdHVyYWRvIiwicXVhbnRpdHkiOjQwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImJlY2hhbWVsIiwicXVhbnRpdHkiOjMwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJxdWVzbyByYWxsYWRvIiwicXVhbnRpdHkiOjUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEFzYSBsYXMgdmVyZHVyYXMgZW4gZGFkb3MgMjUgbWluIGEgMjAwIMKwQy4iLCJDdWVjZSB0b21hdGUgMTIgbWluIHkgbW9udGEgY2FwYXMgZGUgcGFzdGEsIHRvbWF0ZSB5IHZlcmR1cmFzLiIsIkN1YnJlIGNvbiBiZWNoYW1lbCB5IHF1ZXNvOyBob3JuZWEgMjUgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDU5IiwidGl0bGUiOiJNaWdhcyBjb24gdmVyZHVyYXMsIHV2YXMgeSBodWV2byIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjozNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDI1MCBnIHBhbiBkZWwgZMOtYSBhbnRlcmlvciJ9LHsibmFtZSI6IjEvMiBwaW1pZW50byB2ZXJkZSJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoidG9tYXRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ1dmFzIiwicXVhbnRpdHkiOjEwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6Imh1ZXZvcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWpvcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWd1YSIsInF1YW50aXR5Ijo1MCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwiLCJxdWFudGl0eSI6MzAsInVuaXRfY29kZSI6Im1sIn1dLCJzdGVwcyI6WyIqIEh1bWVkZWNlIGVsIHBhbiBkZXNtaWdhZG8gY29uIGFndWEgeSBkZWphIHJlcG9zYXIgMTAgbWluLiIsIlNvZnLDrWUgYWpvIHkgdmVyZHVyYXM7IGHDsWFkZSBlbCBwYW4geSByZW11ZXZlIDEyIG1pbi4iLCJTaXJ2ZSBjb24gdXZhcyB5IGh1ZXZvIGEgbGEgcGxhbmNoYS4iXX0seyJrZXkiOiJiYXNlLXYyLTA2MCIsInRpdGxlIjoiQXJyb3ogYWwgaG9ybm8gY29uIGNhbGFiYXphLCBxdWVzbyBmcmVzY28geSBhdmVsbGFuYXMiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MzUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAxNjAgZyBhcnJveiByZWRvbmRvIn0seyJuYW1lIjoiY2FsYWJhemEiLCJxdWFudGl0eSI6MzUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoicXVlc28gZnJlc2NvIiwicXVhbnRpdHkiOjEyMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImF2ZWxsYW5hcyIsInF1YW50aXR5IjozMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImNhbGRvIGRlIHZlcmR1cmFzIiwicXVhbnRpdHkiOjUwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEsIGHDsWFkZSBhcnJveiB5IGNhbGRvLiIsIlBhc2EgYSBmdWVudGUgY29uIGNhbGFiYXphIGVuIGRhZG9zIHkgaG9ybmVhIDIwIG1pbiBhIDIwMCDCsEMuIiwiUmVwb3NhIDUgbWluIHkgdGVybWluYSBjb24gcXVlc28gZnJlc2NvIHkgYXZlbGxhbmFzIHBpY2FkYXMuIl19LHsia2V5IjoiYmFzZS12Mi0wNjEiLCJ0aXRsZSI6Ik1lcmx1emEgYWwgaG9ybm8gY29uIHBhdGF0YSwgdG9tYXRlIHkgYWNlaXR1bmFzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMiBsb21vcyBkZSBtZXJsdXphICgzNTAgZykifSx7Im5hbWUiOiJwYXRhdGEiLCJxdWFudGl0eSI6MzAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoidG9tYXRlcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWNlaXR1bmFzIiwicXVhbnRpdHkiOjQwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJhY2VpdGUifSx7Im5hbWUiOiJsaW3Ds24geSBzYWwifV0sInN0ZXBzIjpbIiogSG9ybmVhIHBhdGF0YSB5IGNlYm9sbGEgZW4gcm9kYWphcyAyMCBtaW4gYSAyMDAgwrBDLiIsIkHDsWFkZSB0b21hdGUsIG1lcmx1emEsIGFjZWl0dW5hcywgYWNlaXRlIHkgbGltw7NuLiIsIkhvcm5lYSAxMi0xNSBtaW4gbcOhcy4iXX0seyJrZXkiOiJiYXNlLXYyLTA2MiIsInRpdGxlIjoiTWVybHV6YSBlbiBzYWxzYSB2ZXJkZSBjb24gZ3Vpc2FudGVzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjMwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMzUwIGcgbWVybHV6YSJ9LHsibmFtZSI6Imd1aXNhbnRlcyIsInF1YW50aXR5IjoxNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImFqb3MiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InZpbm8gYmxhbmNvIiwicXVhbnRpdHkiOjc1LCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImNhbGRvIGRlIHBlc2NhZG8iLCJxdWFudGl0eSI6MzAwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6InBlcmVqaWwifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBjZWJvbGxhIHkgYWpvLCBhw7FhZGUgdmlubyB5IGRlamEgZXZhcG9yYXIuIiwiSW5jb3Jwb3JhIGNhbGRvLCBndWlzYW50ZXMgeSBtZXJsdXphOyBjb2NpbmEgdGFwYWRvIDggbWluLiIsIlRlcm1pbmEgY29uIGFidW5kYW50ZSBwZXJlamlsLiJdfSx7ImtleSI6ImJhc2UtdjItMDYzIiwidGl0bGUiOiJCYWNhbGFvIGNvbiB0b21hdGUgY2FzZXJvIHkgcGltaWVudG9zIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMzUwIGcgYmFjYWxhbyBkZXNhbGFkbyJ9LHsibmFtZSI6InBpbWllbnRvIHJvam8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoidG9tYXRlIHRyaXR1cmFkbyIsInF1YW50aXR5Ijo0MDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEsIGFqbyB5IHBpbWllbnRvIGVuIHRpcmFzLiIsIkHDsWFkZSB0b21hdGUgeSBjb2NpbmEgMTUgbWluLiIsIkluY29ycG9yYSBiYWNhbGFvIHkgY3VlY2UgYSBmdWVnbyBzdWF2ZSA2LTggbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDY0IiwidGl0bGUiOiJCYWNhbGFvIGFsIGhvcm5vIGNvbiBnYXJiYW56b3MgeSBlc3BpbmFjYXMiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NDAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAzNTAgZyBiYWNhbGFvIGRlc2FsYWRvIn0seyJuYW1lIjoiZ2FyYmFuem9zIGNvY2lkb3MiLCJxdWFudGl0eSI6MzAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiZXNwaW5hY2FzIiwicXVhbnRpdHkiOjE1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ0b21hdGUiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEgeSBham8sIGHDsWFkZSBnYXJiYW56b3MgeSBlc3BpbmFjYXMuIiwiUGFzYSBhIGZ1ZW50ZSwgY29sb2NhIGJhY2FsYW8geSB0b21hdGUgZW4gcm9kYWphcy4iLCJIb3JuZWEgMTUgbWluIGEgMTkwIMKwQy4iXX0seyJrZXkiOiJiYXNlLXYyLTA2NSIsInRpdGxlIjoiRG9yYWRhIGEgbGEgZXNwYWxkYSBjb24gdmVyZHVyYXMiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MzUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAxIGRvcmFkYSBhYmllcnRhICg0NTAtNTAwIGcpIn0seyJuYW1lIjoiY2FsYWJhY8OtbiIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIHBpbWllbnRvIHJvam8ifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImFqb3MiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSJ9LHsibmFtZSI6ImxpbcOzbiB5IHNhbCJ9XSwic3RlcHMiOlsiKiBBc2EgbGFzIHZlcmR1cmFzIGNvcnRhZGFzIDE1IG1pbiBhIDIwMCDCsEMuIiwiQ29sb2NhIGRvcmFkYSBlbmNpbWEgeSBob3JuZWEgMTUgbWluLiIsIkRvcmEgYWpvcyBsYW1pbmFkb3MgZW4gYWNlaXRlIHkgcmllZ2EgZWwgcGVzY2FkbyBjb24gbGltw7NuLiJdfSx7ImtleSI6ImJhc2UtdjItMDY2IiwidGl0bGUiOiJMdWJpbmEgYWwgaG9ybm8gY29uIGxpbcOzbiB5IGNhbGFiYWPDrW4iLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NDAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAxIGx1YmluYSBhYmllcnRhICg0NTAtNTAwIGcpIn0seyJuYW1lIjoiY2FsYWJhY8OtbiIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoicGF0YXRhIiwicXVhbnRpdHkiOjMwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImxpbcOzbiIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogSG9ybmVhIHBhdGF0YSwgY2Vib2xsYSB5IGNhbGFiYWPDrW4gMjAgbWluIGEgMjAwIMKwQy4iLCJBw7FhZGUgbHViaW5hLCByb2RhamFzIGRlIGxpbcOzbiB5IGFjZWl0ZS4iLCJIb3JuZWEgMTUgbWluIG3DoXMgeSBzaXJ2ZS4iXX0seyJrZXkiOiJiYXNlLXYyLTA2NyIsInRpdGxlIjoiU2FsbcOzbiBhIGxhIHBsYW5jaGEgY29uIGp1ZMOtYXMgdmVyZGVzIHkgcGF0YXRhIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjMwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMiBsb21vcyBkZSBzYWxtw7NuICgzNTAgZykifSx7Im5hbWUiOiJwYXRhdGEiLCJxdWFudGl0eSI6MzAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoianVkw61hcyB2ZXJkZXMiLCJxdWFudGl0eSI6MjUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGxpbcOzbiJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBDdWVjZSBwYXRhdGEgeSBqdWTDrWFzIGVuIGFndWEgY29uIHNhbCBoYXN0YSB0aWVybmFzLiIsIlNlY2EgZWwgc2FsbcOzbiB5IGTDs3JhbG8gMy00IG1pbiBwb3IgY2FkYSBsYWRvLiIsIlNpcnZlIGNvbiBsaW3Ds24geSBhY2VpdGUuIl19LHsia2V5IjoiYmFzZS12Mi0wNjgiLCJ0aXRsZSI6IlNhbG3Ds24gYWwgaG9ybm8gY29uIG5hcmFuamEgeSBlbmVsZG8iLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MzAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAyIGxvbW9zIGRlIHNhbG3Ds24gKDM1MCBnKSJ9LHsibmFtZSI6Im5hcmFuamEiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGFiYWPDrW4iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InphbmFob3JpYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiZW5lbGRvIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIENvcnRhIHZlcmR1cmFzIGZpbmFzIHkgY29sw7NjYWxhcyBlbiBmdWVudGUgY29uIGFjZWl0ZS4iLCJQb24gc2FsbcOzbiBlbmNpbWEsIHJpZWdhIGNvbiB6dW1vIGRlIG1lZGlhIG5hcmFuamEgeSBhw7FhZGUgcm9kYWphcy4iLCJIb3JuZWEgMTggbWluIGEgMTkwIMKwQyB5IHRlcm1pbmEgY29uIGVuZWxkby4iXX0seyJrZXkiOiJiYXNlLXYyLTA2OSIsInRpdGxlIjoiQ2FiYWxsYSBhbCBob3JubyBjb24gcGltaWVudG9zIGFzYWRvcyIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjozNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDIgY2FiYWxsYXMgbGltcGlhcyAoNDUwIGcpIn0seyJuYW1lIjoicGltaWVudG8gcm9qbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoicGltaWVudG8gdmVyZGUiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoibGltw7NuIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogQXNhIHBpbWllbnRvcyB5IGNlYm9sbGEgZW4gdGlyYXMgMTggbWluIGEgMjAwIMKwQy4iLCJDb2xvY2EgY2FiYWxsYXMgZW5jaW1hLCBzYWxhIHkgYcOxYWRlIGxpbcOzbi4iLCJIb3JuZWEgMTIgbWluIG3DoXMuIl19LHsia2V5IjoiYmFzZS12Mi0wNzAiLCJ0aXRsZSI6IlNhcmRpbmFzIGFsIGhvcm5vIGNvbiBlbnNhbGFkYSBkZSB0b21hdGUiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MjUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0MDAgZyBzYXJkaW5hcyBsaW1waWFzIn0seyJuYW1lIjoidG9tYXRlcyIsInF1YW50aXR5IjozLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS80IGNlYm9sbGEifSx7Im5hbWUiOiJwZXJlamlsIn0seyJuYW1lIjoibGltw7NuIn0seyJuYW1lIjoiYWNlaXRlIn0seyJuYW1lIjoidmluYWdyZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTYWxhIHNhcmRpbmFzLCByacOpZ2FsYXMgY29uIGFjZWl0ZSB5IGhvcm7DqWFsYXMgMTIgbWluIGEgMjEwIMKwQy4iLCJDb3J0YSB0b21hdGUgeSBjZWJvbGxhLiIsIkFsacOxYSBsYSBlbnNhbGFkYSB5IHNpcnZlIGNvbiBsaW3Ds24geSBwZXJlamlsLiJdfSx7ImtleSI6ImJhc2UtdjItMDcxIiwidGl0bGUiOiJCb25pdG8gY29uIHRvbWF0ZSB5IHBpbWllbnRvIHZlcmRlIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjM1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMzUwIGcgYm9uaXRvIn0seyJuYW1lIjoicGltaWVudG8gdmVyZGUiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoidG9tYXRlIHRyaXR1cmFkbyIsInF1YW50aXR5Ijo0MDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEsIGFqbyB5IHBpbWllbnRvLiIsIkHDsWFkZSB0b21hdGUgeSBjdWVjZSAxNSBtaW4uIiwiSW5jb3Jwb3JhIGJvbml0byBlbiB0YWNvcyB5IGNvY2luYSBzb2xvIDMtNCBtaW4gcGFyYSBxdWUgcXVlZGUganVnb3NvLiJdfSx7ImtleSI6ImJhc2UtdjItMDcyIiwidGl0bGUiOiJBdMO6biBhIGxhIHBsYW5jaGEgY29uIHBpc3RvIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjMwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMiBmaWxldGVzIGRlIGF0w7puICgzNTAgZykifSx7Im5hbWUiOiIxLzIgY2FsYWJhY8OtbiJ9LHsibmFtZSI6IjEvMiBiZXJlbmplbmEifSx7Im5hbWUiOiIxLzIgcGltaWVudG8gcm9qbyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoidG9tYXRlIHRyaXR1cmFkbyIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSB2ZXJkdXJhcyBlbiBkYWRvcyAxMCBtaW4sIGHDsWFkZSB0b21hdGUgeSBjdWVjZSAxMCBtaW4uIiwiTWFyY2EgZWwgYXTDum4gMS0yIG1pbiBwb3IgbGFkby4iLCJTaXJ2ZSBzb2JyZSBlbCBwaXN0by4iXX0seyJrZXkiOiJiYXNlLXYyLTA3MyIsInRpdGxlIjoiTWFybWl0YWtvIGxpZ2VybyBkZSBib25pdG8geSBwYXRhdGEiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NDUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAzNTAgZyBib25pdG8ifSx7Im5hbWUiOiJwYXRhdGEiLCJxdWFudGl0eSI6NDAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJwaW1pZW50byB2ZXJkZSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoidG9tYXRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJjYWxkbyBkZSBwZXNjYWRvIiwicXVhbnRpdHkiOjcwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJwaW1lbnTDs24gZHVsY2UifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBjZWJvbGxhIHkgcGltaWVudG8sIGHDsWFkZSB0b21hdGUgeSBwaW1lbnTDs24uIiwiSW5jb3Jwb3JhIHBhdGF0YSBjaGFzY2FkYSB5IGNhbGRvOyBjdWVjZSAyNSBtaW4uIiwiQcOxYWRlIGJvbml0byB5IGNvY2luYSAzIG1pbiBjb24gZWwgZnVlZ28gYXBhZ2Fkby4iXX0seyJrZXkiOiJiYXNlLXYyLTA3NCIsInRpdGxlIjoiQ2FsYW1hcmVzIGd1aXNhZG9zIGVuIHN1IHRpbnRhIGNvbiBhcnJveiIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0NSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDM1MCBnIGNhbGFtYXJlcyJ9LHsibmFtZSI6ImFycm96IHJlZG9uZG8iLCJxdWFudGl0eSI6MTQwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InNvYnJlIHRpbnRhIGRlIGNhbGFtYXIiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InZpbm8gYmxhbmNvIiwicXVhbnRpdHkiOjc1LCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImNhbGRvIGRlIHBlc2NhZG8iLCJxdWFudGl0eSI6NTAwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEgeSBham8sIGHDsWFkZSBjYWxhbWFyZXMsIHZpbm8geSB0aW50YSBkaXN1ZWx0YSBlbiBjYWxkby4iLCJDb2NpbmEgMjUgbWluLiIsIkN1ZWNlIGVsIGFycm96IGFwYXJ0ZSB5IHNpcnZlIGNvbiBlbCBndWlzby4iXX0seyJrZXkiOiJiYXNlLXYyLTA3NSIsInRpdGxlIjoiU2VwaWEgYSBsYSBwbGFuY2hhIGNvbiBndWlzYW50ZXMgeSBsaW3Ds24iLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MjUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAzNTAgZyBzZXBpYSBsaW1waWEifSx7Im5hbWUiOiJndWlzYW50ZXMiLCJxdWFudGl0eSI6MjAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBsaW3Ds24ifSx7Im5hbWUiOiJwZXJlamlsIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEN1ZWNlIGd1aXNhbnRlcyA1IG1pbi4iLCJTYWx0ZWEgY2Vib2xsYSB5IGFqbywgaW5jb3Jwb3JhIHNlcGlhIG11eSBzZWNhIHkgY29jaW5hIDQgbWluLiIsIkHDsWFkZSBndWlzYW50ZXMsIGxpbcOzbiB5IHBlcmVqaWwuIl19LHsia2V5IjoiYmFzZS12Mi0wNzYiLCJ0aXRsZSI6IkNoaXBpcm9uZXMgZW5jZWJvbGxhZG9zIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjM1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogNDAwIGcgY2hpcGlyb25lcyJ9LHsibmFtZSI6ImNlYm9sbGFzIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InZpbm8gYmxhbmNvIiwicXVhbnRpdHkiOjc1LCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImhvamEgZGUgbGF1cmVsIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogUG9jaGEgY2Vib2xsYSBlbiBqdWxpYW5hIGxlbnRhbWVudGUgMTUgbWluIGNvbiBham8geSBsYXVyZWwuIiwiQcOxYWRlIGNoaXBpcm9uZXMgeSB2aW5vLiIsIkNvY2luYSB0YXBhZG8gMTIgbWluIGhhc3RhIHRpZXJub3MuIl19LHsia2V5IjoiYmFzZS12Mi0wNzciLCJ0aXRsZSI6Ik1lamlsbG9uZXMgYWwgdmFwb3IgY29uIHRvbWF0ZSB5IHZpbm8gYmxhbmNvIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjIwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMSBrZyBtZWppbGxvbmVzIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InRvbWF0ZSB0cml0dXJhZG8iLCJxdWFudGl0eSI6MjAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoidmlubyBibGFuY28iLCJxdWFudGl0eSI6NzUsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoicGVyZWppbCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEgeSBham8sIGHDsWFkZSB0b21hdGUgeSB2aW5vLiIsIkluY29ycG9yYSBtZWppbGxvbmVzIGxpbXBpb3MsIHRhcGEgNSBtaW4gaGFzdGEgYWJyaXIuIiwiRXNwb2x2b3JlYSBwZXJlamlsIHkgZGVzZWNoYSBsb3MgY2VycmFkb3MuIl19LHsia2V5IjoiYmFzZS12Mi0wNzgiLCJ0aXRsZSI6IkFsbWVqYXMgYSBsYSBtYXJpbmVyYSBjb24gcGVyZWppbCIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjoyMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDUwMCBnIGFsbWVqYXMifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImFqb3MiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InZpbm8gYmxhbmNvIiwicXVhbnRpdHkiOjc1LCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImNhbGRvIGRlIHBlc2NhZG8iLCJxdWFudGl0eSI6MTUwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6InBlcmVqaWwifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogRGVqYSBhbG1lamFzIGVuIGFndWEgY29uIHNhbCAyMCBtaW4geSBlbmp1YWdhLiIsIlNvZnLDrWUgY2Vib2xsYSB5IGFqbywgYcOxYWRlIHZpbm8geSBjYWxkby4iLCJJbmNvcnBvcmEgYWxtZWphcywgdGFwYSBoYXN0YSBhYnJpciB5IHRlcm1pbmEgY29uIHBlcmVqaWwuIl19LHsia2V5IjoiYmFzZS12Mi0wNzkiLCJ0aXRsZSI6Ikxhbmdvc3Rpbm9zIGNvbiBham8sIGxpbcOzbiB5IGJyw7Njb2xpIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjIwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMzAwIGcgbGFuZ29zdGlub3MgcGVsYWRvcyJ9LHsibmFtZSI6ImJyw7Njb2xpIHBlcXVlw7FvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJham9zIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgbGltw7NuIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIiwicXVhbnRpdHkiOjIwLCJ1bml0X2NvZGUiOiJtbCJ9XSwic3RlcHMiOlsiKiBDdWVjZSBicsOzY29saSBhbCB2YXBvciA2IG1pbi4iLCJEb3JhIGFqb3MgbGFtaW5hZG9zIHkgc2FsdGVhIGxhbmdvc3Rpbm9zIDIgbWluLiIsIkHDsWFkZSBicsOzY29saSwgbGltw7NuIHkgc2FsdGVhIHVuIG1pbnV0byBtw6FzLiJdfSx7ImtleSI6ImJhc2UtdjItMDgwIiwidGl0bGUiOiJDYXp1ZWxhIGRlIHBlc2NhZG8gYmxhbmNvIGNvbiBwYXRhdGEgeSBhemFmcsOhbiIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0NSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDM1MCBnIG1lcmx1emEgbyByYXBlIn0seyJuYW1lIjoicGF0YXRhIiwicXVhbnRpdHkiOjQwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoidG9tYXRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGRvIGRlIHBlc2NhZG8iLCJxdWFudGl0eSI6NjUwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImF6YWZyw6FuIG8gY29sb3JhbnRlIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIFNvZnLDrWUgY2Vib2xsYSwgYWpvIHkgdG9tYXRlLiIsIkHDsWFkZSBwYXRhdGEgY2hhc2NhZGEsIGNhbGRvIHkgYXphZnLDoW47IGN1ZWNlIDIyIG1pbi4iLCJJbmNvcnBvcmEgcGVzY2FkbyB5IGNvY2luYSA2IG1pbiBhIGZ1ZWdvIHN1YXZlLiJdfSx7ImtleSI6ImJhc2UtdjItMDgxIiwidGl0bGUiOiJQb2xsbyBhbCBob3JubyBjb24gbGltw7NuLCByb21lcm8geSB2ZXJkdXJhcyIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo1MCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQgbXVzbG9zIGRlIHBvbGxvIHBlcXVlw7FvcyAoNjAwIGcpIn0seyJuYW1lIjoicGF0YXRhIiwicXVhbnRpdHkiOjQwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImNhbGFiYWPDrW4iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InphbmFob3JpYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIGxpbcOzbiJ9LHsibmFtZSI6InJvbWVybyJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBDb2xvY2EgdmVyZHVyYXMgZW4gdW5hIGZ1ZW50ZSBjb24gYWNlaXRlIHkgc2FsLiIsIkHDsWFkZSBwb2xsbywgbGltw7NuIHkgcm9tZXJvLiIsIkhvcm5lYSA0MCBtaW4gYSAyMDAgwrBDLCBnaXJhbmRvIGVsIHBvbGxvIGEgbWl0YWQgZGUgY29jY2nDs24uIl19LHsia2V5IjoiYmFzZS12Mi0wODIiLCJ0aXRsZSI6IlBvbGxvIGd1aXNhZG8gY29uIGFsY2FjaG9mYXMgeSBndWlzYW50ZXMiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NTAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA1MDAgZyBwb2xsbyB0cm9jZWFkbyJ9LHsibmFtZSI6ImFsY2FjaG9mYXMiLCJxdWFudGl0eSI6MjUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiZ3Vpc2FudGVzIiwicXVhbnRpdHkiOjE1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ2aW5vIGJsYW5jbyIsInF1YW50aXR5Ijo3NSwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJjYWxkbyIsInF1YW50aXR5Ijo0NTAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIERvcmEgcG9sbG8geSByZXNlcnZhLiIsIlNvZnLDrWUgY2Vib2xsYSwgYWpvIHkgYWxjYWNob2ZhczsgYcOxYWRlIHZpbm8geSBjYWxkby4iLCJEZXZ1ZWx2ZSBwb2xsbywgY3VlY2UgdGFwYWRvIDI1IG1pbiwgaW5jb3Jwb3JhIGd1aXNhbnRlcyB5IGNvY2luYSA1IG1pbiBtw6FzLiJdfSx7ImtleSI6ImJhc2UtdjItMDgzIiwidGl0bGUiOiJQb2xsbyBjb24gdG9tYXRlLCBhY2VpdHVuYXMgeSBhbGJhaGFjYSIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0MCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQ1MCBnIHBlY2h1Z2EgbyBjb250cmFtdXNsbyBkZSBwb2xsbyJ9LHsibmFtZSI6InRvbWF0ZSB0cml0dXJhZG8iLCJxdWFudGl0eSI6NDAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJhY2VpdHVuYXMiLCJxdWFudGl0eSI6NTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhbGJhaGFjYSJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBEb3JhIHBvbGxvIGVuIHRpcmFzIHkgcmVzZXJ2YS4iLCJTb2Zyw61lIGNlYm9sbGEsIGHDsWFkZSB0b21hdGUgeSBjb2NpbmEgMTUgbWluLiIsIkluY29ycG9yYSBwb2xsbyB5IGFjZWl0dW5hcywgY3VlY2UgNSBtaW4geSB0ZXJtaW5hIGNvbiBhbGJhaGFjYS4iXX0seyJrZXkiOiJiYXNlLXYyLTA4NCIsInRpdGxlIjoiUG9sbG8gc2FsdGVhZG8gY29uIGNhbGFiYWPDrW4geSBhbG1lbmRyYXMiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6MjUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0MDAgZyBwZWNodWdhIGRlIHBvbGxvIn0seyJuYW1lIjoiY2FsYWJhY8OtbiIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJhbG1lbmRyYXMiLCJxdWFudGl0eSI6MzAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgbGltw7NuIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIERvcmEgcG9sbG8gZW4gdGlyYXMgeSByZXNlcnZhLiIsIlNhbHRlYSBjZWJvbGxhIHkgY2FsYWJhY8OtbiA4IG1pbi4iLCJBw7FhZGUgcG9sbG8sIGFsbWVuZHJhcyB0b3N0YWRhcyB5IGxpbcOzbjsgY29jaW5hIDIgbWluIHkgc2lydmUuIl19LHsia2V5IjoiYmFzZS12Mi0wODUiLCJ0aXRsZSI6IkJyb2NoZXRhcyBkZSBwb2xsbyBjb24gcGltaWVudG9zIHkgeW9ndXIgZGUgbGltw7NuIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjMwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogNDAwIGcgcGVjaHVnYSBkZSBwb2xsbyJ9LHsibmFtZSI6InBpbWllbnRvIHJvam8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InBpbWllbnRvIHZlcmRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ5b2d1ciBuYXR1cmFsIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgbGltw7NuIn0seyJuYW1lIjoicGltZW50w7NuIGR1bGNlIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEVuc2FydGEgcG9sbG8geSBwaW1pZW50b3MgZW4gYnJvY2hldGFzLCBhbGnDsWEgY29uIGFjZWl0ZSwgc2FsIHkgcGltZW50w7NuIGR1bGNlLiIsIkNvY2luYSBlbiBwbGFuY2hhIDEwLTEyIG1pbiwgZ2lyYW5kby4iLCJNZXpjbGEgeW9ndXIgeSBsaW3Ds24gcGFyYSBhY29tcGHDsWFyLiJdfSx7ImtleSI6ImJhc2UtdjItMDg2IiwidGl0bGUiOiJQYXZvIGd1aXNhZG8gY29uIHphbmFob3JpYSB5IGNoYW1wacOxb25lcyIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0MCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQwMCBnIGRhZG9zIGRlIHBhdm8ifSx7Im5hbWUiOiJjaGFtcGnDsW9uZXMiLCJxdWFudGl0eSI6MjUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiemFuYWhvcmlhcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJ2aW5vIGJsYW5jbyIsInF1YW50aXR5Ijo3NSwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJjYWxkbyIsInF1YW50aXR5IjozNTAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIERvcmEgcGF2byB5IHJlc2VydmEuIiwiU29mcsOtZSBjZWJvbGxhLCB6YW5haG9yaWEgeSBjaGFtcGnDsW9uZXM7IG1vamEgY29uIHZpbm8geSBjYWxkby4iLCJEZXZ1ZWx2ZSBwYXZvIHkgY3VlY2UgdGFwYWRvIDE4IG1pbi4iXX0seyJrZXkiOiJiYXNlLXYyLTA4NyIsInRpdGxlIjoiQWxiw7NuZGlnYXMgZGUgcGF2byBlbiBzYWxzYSBkZSB0b21hdGUiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NDUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0MDAgZyBjYXJuZSBwaWNhZGEgZGUgcGF2byJ9LHsibmFtZSI6Imh1ZXZvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJwYW4gcmFsbGFkbyIsInF1YW50aXR5IjozMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFqbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoicGVyZWppbCJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoidG9tYXRlIHRyaXR1cmFkbyIsInF1YW50aXR5Ijo0MDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogTWV6Y2xhIHBhdm8gY29uIGh1ZXZvLCBwYW4sIGFqbywgcGVyZWppbCB5IHNhbDsgZm9ybWEgYWxiw7NuZGlnYXMgeSBkw7NyYWxhcy4iLCJTb2Zyw61lIGNlYm9sbGEsIGHDsWFkZSB0b21hdGUgMTIgbWluLiIsIkluY29ycG9yYSBhbGLDs25kaWdhcyB5IGN1ZWNlIDEyIG1pbi4iXX0seyJrZXkiOiJiYXNlLXYyLTA4OCIsInRpdGxlIjoiUGVjaHVnYSBkZSBwYXZvIHJlbGxlbmEgZGUgZXNwaW5hY2FzIHkgcXVlc28gZnJlc2NvIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMiBmaWxldGVzIGdyYW5kZXMgZGUgcGF2byAoNDAwIGcpIn0seyJuYW1lIjoiZXNwaW5hY2FzIiwicXVhbnRpdHkiOjE1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6InF1ZXNvIGZyZXNjbyIsInF1YW50aXR5IjoxMDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InBhdGF0YSIsInF1YW50aXR5IjozMDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU2FsdGVhIGVzcGluYWNhcyBjb24gYWpvIHkgbcOpemNsYWxhcyBjb24gcXVlc28uIiwiUmVsbGVuYSBsb3MgZmlsZXRlcywgZW5yb2xsYSB5IHN1amV0YSBjb24gcGFsaWxsb3MuIiwiSG9ybmVhIGNvbiBwYXRhdGEgZW4gZ2Fqb3MgMjUgbWluIGEgMjAwIMKwQy4iXX0seyJrZXkiOiJiYXNlLXYyLTA4OSIsInRpdGxlIjoiQ29uZWpvIGFsIGFqaWxsbyBjb24gcGF0YXRhcyB5IGVuc2FsYWRhIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQ1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogNjAwIGcgY29uZWpvIHRyb2NlYWRvIn0seyJuYW1lIjoicGF0YXRhIiwicXVhbnRpdHkiOjQwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFqb3MiLCJxdWFudGl0eSI6NCwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InZpbm8gYmxhbmNvIiwicXVhbnRpdHkiOjc1LCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImhvamEgZGUgbGF1cmVsIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJsZWNodWdhIn0seyJuYW1lIjoidG9tYXRlIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIERvcmEgY29uZWpvIGNvbiBham9zIHkgbGF1cmVsLiIsIkHDsWFkZSB2aW5vIHkgdW4gcG9jbyBkZSBhZ3VhOyBjdWVjZSB0YXBhZG8gMjUgbWluLiIsIkFzYSBvIGN1ZWNlIHBhdGF0YSB5IGFjb21wYcOxYSBjb24gZW5zYWxhZGEgc2VuY2lsbGEuIl19LHsia2V5IjoiYmFzZS12Mi0wOTAiLCJ0aXRsZSI6IkNvbmVqbyBndWlzYWRvIGNvbiB0b21hdGUgeSByb21lcm8iLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NTUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA2MDAgZyBjb25lam8gdHJvY2VhZG8ifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImFqb3MiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InRvbWF0ZSB0cml0dXJhZG8iLCJxdWFudGl0eSI6NDAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoidmlubyBibGFuY28iLCJxdWFudGl0eSI6NzUsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoicm9tZXJvIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIERvcmEgY29uZWpvIHkgcmVzZXJ2YS4iLCJTb2Zyw61lIGNlYm9sbGEgeSBham8sIGHDsWFkZSB2aW5vLCB0b21hdGUgeSByb21lcm8uIiwiRGV2dWVsdmUgY29uZWpvLCBhw7FhZGUgMjAwIG1sIGFndWEgeSBjdWVjZSB0YXBhZG8gMzUgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMDkxIiwidGl0bGUiOiJMb21vIGRlIGNlcmRvIGNvbiBtYW56YW5hIHkgY2Vib2xsYSIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0MCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQwMCBnIGxvbW8gZGUgY2VyZG8ifSx7Im5hbWUiOiJtYW56YW5hcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiY2Vib2xsYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoidmlubyBibGFuY28iLCJxdWFudGl0eSI6NzUsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiY2FsZG8iLCJxdWFudGl0eSI6MjAwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6InRvbWlsbG8ifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU2VsbGEgZWwgbG9tbyBlbiB1bmEgcGllemEgeSByZXPDqXJ2YWxvLiIsIlBvY2hhIGNlYm9sbGEgeSBtYW56YW5hLCBhw7FhZGUgdmlubyB5IGNhbGRvLiIsIkRldnVlbHZlIGNhcm5lIHkgY29jaW5hIHRhcGFkbyAxOCBtaW47IGNvcnRhIHkgc2lydmUgY29uIGxhIHNhbHNhLiJdfSx7ImtleSI6ImJhc2UtdjItMDkyIiwidGl0bGUiOiJTb2xvbWlsbG8gZGUgY2VyZG8gY29uIHZlcmR1cmFzIGFsIGhvcm5vIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjM1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogNDAwIGcgc29sb21pbGxvIGRlIGNlcmRvIn0seyJuYW1lIjoiY2FsYWJhY8OtbiIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoicGltaWVudG8gcm9qbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiY2Vib2xsYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoicGF0YXRhIiwicXVhbnRpdHkiOjMwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFjZWl0ZSJ9LHsibmFtZSI6InJvbWVybyB5IHNhbCJ9XSwic3RlcHMiOlsiKiBIb3JuZWEgcGF0YXRhIHkgdmVyZHVyYXMgMTUgbWluIGEgMjAwIMKwQy4iLCJBw7FhZGUgc29sb21pbGxvIHNhbHBpbWVudGFkbyB5IHJvbWVyby4iLCJIb3JuZWEgMTUgbWluIG3DoXMsIGRlamEgcmVwb3NhciA1IG1pbiB5IGNvcnRhLiJdfSx7ImtleSI6ImJhc2UtdjItMDkzIiwidGl0bGUiOiJUZXJuZXJhIGd1aXNhZGEgY29uIHphbmFob3JpYSB5IGd1aXNhbnRlcyIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo3MCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQ1MCBnIHRlcm5lcmEgcGFyYSBndWlzYXIifSx7Im5hbWUiOiJ6YW5haG9yaWFzIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJndWlzYW50ZXMiLCJxdWFudGl0eSI6MTUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InZpbm8gYmxhbmNvIiwicXVhbnRpdHkiOjc1LCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImNhbGRvIiwicXVhbnRpdHkiOjUwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU2VsbGEgdGVybmVyYSB5IHJlc2VydmEuIiwiU29mcsOtZSBjZWJvbGxhLCBham8geSB6YW5haG9yaWE7IGHDsWFkZSB2aW5vIHkgY2FsZG8uIiwiQ29jaW5hIHRhcGFkbyA1MCBtaW4sIGFncmVnYSBndWlzYW50ZXMgeSBjdWVjZSA4IG1pbiBtw6FzLiJdfSx7ImtleSI6ImJhc2UtdjItMDk0IiwidGl0bGUiOiJGaWxldGVzIGRlIHRlcm5lcmEgY29uIHRvbWF0ZSB5IHBhdGF0YSIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjoyNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDIgZmlsZXRlcyBkZSB0ZXJuZXJhICgzNTAgZykifSx7Im5hbWUiOiJwYXRhdGEiLCJxdWFudGl0eSI6MzUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoidG9tYXRlcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJvcsOpZ2FubyJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBDdWVjZSBvIGFzYSBwYXRhdGEgZW4gZGFkb3MuIiwiU2FsdGVhIGNlYm9sbGEgeSB0b21hdGUgY29uIG9yw6lnYW5vIDggbWluLiIsIk1hcmNhIGZpbGV0ZXMgYWwgZ3VzdG8geSBzaXJ2ZSBjb24gZWwgdG9tYXRlIHkgbGEgcGF0YXRhLiJdfSx7ImtleSI6ImJhc2UtdjItMDk1IiwidGl0bGUiOiJCZXJlbmplbmFzIHJlbGxlbmFzIGRlIGNhcm5lIG1hZ3JhIHkgdmVyZHVyYXMiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NTUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAyIGJlcmVuamVuYXMifSx7Im5hbWUiOiJjYXJuZSBwaWNhZGEgbWFncmEiLCJxdWFudGl0eSI6MzAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiIxLzIgY2FsYWJhY8OtbiJ9LHsibmFtZSI6InRvbWF0ZSB0cml0dXJhZG8iLCJxdWFudGl0eSI6MjAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoicXVlc28gcmFsbGFkbyIsInF1YW50aXR5Ijo0MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBBc2EgYmVyZW5qZW5hcyBwYXJ0aWRhcyAyMCBtaW4gYSAyMDAgwrBDIHkgcmV0aXJhIHBhcnRlIGRlIGxhIHB1bHBhLiIsIlNvZnLDrWUgY2Vib2xsYSwgY2FsYWJhY8OtbiwgcHVscGEgeSBjYXJuZTsgYcOxYWRlIHRvbWF0ZS4iLCJSZWxsZW5hLCBjdWJyZSBjb24gcXVlc28geSBncmF0aW5hIDEwIG1pbi4iXX0seyJrZXkiOiJiYXNlLXYyLTA5NiIsInRpdGxlIjoiVG9ydGlsbGEgZXNwYcOxb2xhIGRlIHBhdGF0YSB5IGNlYm9sbGEiLCJkaXNoX3R5cGUiOiJvdGhlciIsInRvdGFsX21pbnV0ZXMiOjQwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogNTAwIGcgcGF0YXRhIn0seyJuYW1lIjoiY2Vib2xsYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiaHVldm9zIiwicXVhbnRpdHkiOjUsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUgZGUgb2xpdmEgeSBzYWwiLCJxdWFudGl0eSI6ODAsInVuaXRfY29kZSI6Im1sIn1dLCJzdGVwcyI6WyIqIFBvY2hhIHBhdGF0YSB5IGNlYm9sbGEgYSBmdWVnbyBtZWRpbyBoYXN0YSB0aWVybmFzOyBlc2N1cnJlLiIsIk1lemNsYSBjb24gaHVldm9zIGJhdGlkb3MgeSBzYWwuIiwiQ3VhamEgbGEgdG9ydGlsbGEgcG9yIGFtYm9zIGxhZG9zIGFsIHB1bnRvIGRlc2VhZG8uIl19LHsia2V5IjoiYmFzZS12Mi0wOTciLCJ0aXRsZSI6IlRvcnRpbGxhIGRlIGNhbGFiYWPDrW4geSBjZWJvbGxhIiwiZGlzaF90eXBlIjoib3RoZXIiLCJ0b3RhbF9taW51dGVzIjoyNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDEgY2FsYWJhY8OtbiBncmFuZGUifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6Imh1ZXZvcyIsInF1YW50aXR5Ijo0LCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIiwicXVhbnRpdHkiOjIwLCJ1bml0X2NvZGUiOiJtbCJ9XSwic3RlcHMiOlsiKiBTYWx0ZWEgY2Vib2xsYSB5IGNhbGFiYWPDrW4gZW4gbWVkaWFzIGx1bmFzIGhhc3RhIHRpZXJuby4iLCJNZXpjbGEgY29uIGh1ZXZvcyBiYXRpZG9zIHkgc2FsLiIsIkN1YWphIGVuIHNhcnTDqW4gYW50aWFkaGVyZW50ZSBwb3IgYW1ib3MgbGFkb3MuIl19LHsia2V5IjoiYmFzZS12Mi0wOTgiLCJ0aXRsZSI6IlRvcnRpbGxhIGRlIGVzcGluYWNhcywgcXVlc28gZnJlc2NvIHkgbnVlY2VzIiwiZGlzaF90eXBlIjoib3RoZXIiLCJ0b3RhbF9taW51dGVzIjoyMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQgaHVldm9zIn0seyJuYW1lIjoiZXNwaW5hY2FzIiwicXVhbnRpdHkiOjE1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6InF1ZXNvIGZyZXNjbyIsInF1YW50aXR5IjoxMDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJudWVjZXMiLCJxdWFudGl0eSI6MjUsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTYWx0ZWEgYWpvIHkgZXNwaW5hY2FzIGhhc3RhIHF1ZSBiYWplbi4iLCJCYXRlIGh1ZXZvcywgYcOxYWRlIHF1ZXNvIGVuIGRhZG9zIHkgbnVlY2VzLiIsIlZpZXJ0ZSBlc3BpbmFjYXMgeSBjdWFqYSBsYSB0b3J0aWxsYSBhIGZ1ZWdvIG1lZGlvLiJdfSx7ImtleSI6ImJhc2UtdjItMDk5IiwidGl0bGUiOiJSZXZ1ZWx0byBkZSBzZXRhcyB5IGVzcMOhcnJhZ29zIiwiZGlzaF90eXBlIjoib3RoZXIiLCJ0b3RhbF9taW51dGVzIjoyMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQgaHVldm9zIn0seyJuYW1lIjoiY2hhbXBpw7FvbmVzIG8gc2V0YXMiLCJxdWFudGl0eSI6MjUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoibWFub2pvIGRlIGVzcMOhcnJhZ29zIHZlcmRlcyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU2FsdGVhIGVzcMOhcnJhZ29zIHkgYWpvIDQgbWluLiIsIkHDsWFkZSBzZXRhcyB5IGNvY2luYSBoYXN0YSBkb3Jhci4iLCJJbmNvcnBvcmEgaHVldm9zIGJhdGlkb3MsIHNhbGEgeSByZW11ZXZlIHN1YXZlbWVudGUgaGFzdGEgY3VhamFyLiJdfSx7ImtleSI6ImJhc2UtdjItMTAwIiwidGl0bGUiOiJIdWV2b3MgYWwgcGxhdG8gY29uIHRvbWF0ZSwgZ2FyYmFuem9zIHkgZXNwaW5hY2FzIiwiZGlzaF90eXBlIjoib3RoZXIiLCJ0b3RhbF9taW51dGVzIjozMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQgaHVldm9zIn0seyJuYW1lIjoiZ2FyYmFuem9zIGNvY2lkb3MiLCJxdWFudGl0eSI6MjUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiZXNwaW5hY2FzIiwicXVhbnRpdHkiOjE1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6InRvbWF0ZSB0cml0dXJhZG8iLCJxdWFudGl0eSI6MzAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBjZWJvbGxhLCBhw7FhZGUgdG9tYXRlIHkgY29jaW5hIDEwIG1pbi4iLCJNZXpjbGEgZ2FyYmFuem9zIHkgZXNwaW5hY2FzLCByZXBhcnRlIGVuIGRvcyBjYXp1ZWxhcy4iLCJDYXNjYSBodWV2b3MgeSBob3JuZWEgOC0xMCBtaW4gYSAxOTAgwrBDLiJdfSx7ImtleSI6ImJhc2UtdjItMTAxIiwidGl0bGUiOiJIdWV2b3MgZmxhbWVuY29zIGNvbiB2ZXJkdXJhcyB5IGd1aXNhbnRlcyIsImRpc2hfdHlwZSI6Im90aGVyIiwidG90YWxfbWludXRlcyI6MzUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0IGh1ZXZvcyJ9LHsibmFtZSI6Imd1aXNhbnRlcyIsInF1YW50aXR5IjoxNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2FsYWJhY8OtbiJ9LHsibmFtZSI6IjEvMiBwaW1pZW50byByb2pvIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJ0b21hdGUgdHJpdHVyYWRvIiwicXVhbnRpdHkiOjMwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIHZlcmR1cmFzLCBhw7FhZGUgdG9tYXRlIHkgZ3Vpc2FudGVzLCB5IGNvY2luYSAxMiBtaW4uIiwiUmVwYXJ0ZSBlbiBjYXp1ZWxhcyBpbmRpdmlkdWFsZXMsIGNhc2NhIGRvcyBodWV2b3MgZW4gY2FkYSB1bmEuIiwiSG9ybmVhIDggbWluIGEgMTkwIMKwQy4iXX0seyJrZXkiOiJiYXNlLXYyLTEwMiIsInRpdGxlIjoiSHVldm9zIGVuIHNhbHNhIGRlIHRvbWF0ZSB5IHBpbWllbnRvIiwiZGlzaF90eXBlIjoib3RoZXIiLCJ0b3RhbF9taW51dGVzIjozMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQgaHVldm9zIn0seyJuYW1lIjoicGltaWVudG8gcm9qbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJ0b21hdGUgdHJpdHVyYWRvIiwicXVhbnRpdHkiOjQwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFqbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIFNvZnLDrWUgY2Vib2xsYSwgYWpvIHkgcGltaWVudG8gZW4gdGlyYXMuIiwiQcOxYWRlIHRvbWF0ZSB5IGNvY2luYSAxMiBtaW4uIiwiSGF6IGN1YXRybyBodWVjb3MsIGNhc2NhIGh1ZXZvcywgdGFwYSB5IGNvY2luYSBoYXN0YSBjdWFqYXIuIl19LHsia2V5IjoiYmFzZS12Mi0xMDMiLCJ0aXRsZSI6IkZyaXR0YXRhIGRlIHZlcmR1cmFzIGFzYWRhcyIsImRpc2hfdHlwZSI6Im90aGVyIiwidG90YWxfbWludXRlcyI6MzUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA1IGh1ZXZvcyJ9LHsibmFtZSI6ImNhbGFiYWPDrW4iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBwaW1pZW50byByb2pvIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJlc3BpbmFjYXMiLCJxdWFudGl0eSI6MTAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoicXVlc28gcmFsbGFkbyIsInF1YW50aXR5Ijo0MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBBc2EgbyBzYWx0ZWEgdmVyZHVyYXMgaGFzdGEgdGllcm5hcy4iLCJNw6l6Y2xhbGFzIGNvbiBodWV2b3MgYmF0aWRvcywgZXNwaW5hY2FzIHkgcXVlc28uIiwiSG9ybmVhIGVuIHNhcnTDqW4gYXB0YSAxNSBtaW4gYSAxODAgwrBDIGhhc3RhIGN1YWphci4iXX0seyJrZXkiOiJiYXNlLXYyLTEwNCIsInRpdGxlIjoiVG9ydGlsbGEgZGUgYmFjYWxhbyB5IHBpbWllbnRvIHZlcmRlIiwiZGlzaF90eXBlIjoib3RoZXIiLCJ0b3RhbF9taW51dGVzIjoyNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQgaHVldm9zIn0seyJuYW1lIjoiYmFjYWxhbyBkZXNhbGFkbyBkZXNtaWdhZG8iLCJxdWFudGl0eSI6MTgwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoicGltaWVudG8gdmVyZGUiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIFNvZnLDrWUgY2Vib2xsYSB5IHBpbWllbnRvIGhhc3RhIHRpZXJub3MuIiwiQcOxYWRlIGJhY2FsYW8gdW4gbWludXRvLiIsIk1lemNsYSBjb24gaHVldm9zIGJhdGlkb3MgeSBjdWFqYSB1bmEgdG9ydGlsbGEganVnb3NhLiJdfSx7ImtleSI6ImJhc2UtdjItMTA1IiwidGl0bGUiOiJUb3J0aWxsYSBkZSBndWlzYW50ZXMsIG1lbnRhIHkgY2Vib2xsYSB0aWVybmEiLCJkaXNoX3R5cGUiOiJvdGhlciIsInRvdGFsX21pbnV0ZXMiOjIwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogNCBodWV2b3MifSx7Im5hbWUiOiJndWlzYW50ZXMiLCJxdWFudGl0eSI6MTgwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiY2Vib2xsZXRhcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoibWVudGEgZnJlc2NhIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIiwicXVhbnRpdHkiOjIwLCJ1bml0X2NvZGUiOiJtbCJ9XSwic3RlcHMiOlsiKiBDdWVjZSBndWlzYW50ZXMgMyBtaW4geSBlc2N1cnJlLiIsIlNhbHRlYSBjZWJvbGxldGEgeSBtZXpjbGEgY29uIGh1ZXZvcywgZ3Vpc2FudGVzIHkgbWVudGEgcGljYWRhLiIsIkN1YWphIGxhIHRvcnRpbGxhIHBvciBhbWJvcyBsYWRvcy4iXX0seyJrZXkiOiJiYXNlLXYyLTEwNiIsInRpdGxlIjoiVG9zdGEgZGUgdG9tYXRlLCBhZ3VhY2F0ZSB5IGh1ZXZvIHBvY2jDqSIsImRpc2hfdHlwZSI6Im90aGVyIiwidG90YWxfbWludXRlcyI6MTUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0IHJlYmFuYWRhcyBwYW4gaW50ZWdyYWwifSx7Im5hbWUiOiJhZ3VhY2F0ZSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoidG9tYXRlcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiaHVldm9zIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgbGltw7NuIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIFR1ZXN0YSBlbCBwYW4geSBtYWNoYWNhIGFndWFjYXRlIGNvbiBsaW3Ds24geSBzYWwuIiwiQ29sb2NhIHRvbWF0ZSBlbiByb2RhamFzLiIsIkVzY2FsZmEgbG9zIGh1ZXZvcyAzIG1pbiBlbiBhZ3VhIGFwZW5hcyBoaXJ2aWVuZG8geSBzaXJ2ZSBlbmNpbWEuIl19LHsia2V5IjoiYmFzZS12Mi0xMDciLCJ0aXRsZSI6IlRvc3RhIGRlIGVzY2FsaXZhZGEgeSBhbmNob2FzIiwiZGlzaF90eXBlIjoib3RoZXIiLCJ0b3RhbF9taW51dGVzIjoyMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQgcmViYW5hZGFzIHBhbiBpbnRlZ3JhbCJ9LHsibmFtZSI6InBpbWllbnRvIHJvam8gYXNhZG8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImJlcmVuamVuYSBhc2FkYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYW5jaG9hcyIsInF1YW50aXR5Ijo4LCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogVHVlc3RhIGVsIHBhbiB5IGZyw7N0YWxvIGNvbiBham8uIiwiUmVwYXJ0ZSBwaW1pZW50byB5IGJlcmVuamVuYSBhc2Fkb3MgZW4gdGlyYXMuIiwiQcOxYWRlIGRvcyBhbmNob2FzIHBvciB0b3N0YSB5IHVuIGhpbG8gZGUgYWNlaXRlLiJdfSx7ImtleSI6ImJhc2UtdjItMTA4IiwidGl0bGUiOiJRdWVzYWRpbGxhcyBkZSB2ZXJkdXJhcywgYWx1YmlhcyB5IHF1ZXNvIiwiZGlzaF90eXBlIjoib3RoZXIiLCJ0b3RhbF9taW51dGVzIjoyNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQgdG9ydGlsbGFzIGRlIHRyaWdvIn0seyJuYW1lIjoiYWx1YmlhcyBjb2NpZGFzIiwicXVhbnRpdHkiOjI1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBwaW1pZW50byByb2pvIn0seyJuYW1lIjoiMS8yIGNhbGFiYWPDrW4ifSx7Im5hbWUiOiJxdWVzbyByYWxsYWRvIiwicXVhbnRpdHkiOjEyMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIFNhbHRlYSBjZWJvbGxhLCBwaW1pZW50byB5IGNhbGFiYWPDrW47IGluY29ycG9yYSBhbHViaWFzIG1hY2hhY2FkYXMgbGlnZXJhbWVudGUuIiwiUmVsbGVuYSB0b3J0aWxsYXMgY29uIGxhIG1lemNsYSB5IHF1ZXNvLiIsIkTDs3JhbGFzIGVuIHNhcnTDqW4gcG9yIGFtYm9zIGxhZG9zIHkgY29ydGEuIl19LHsia2V5IjoiYmFzZS12Mi0xMDkiLCJ0aXRsZSI6IkJvY2FkaWxsbyBpbnRlZ3JhbCBkZSB0b3J0aWxsYSwgdG9tYXRlIHkgcsO6Y3VsYSIsImRpc2hfdHlwZSI6Im90aGVyIiwidG90YWxfbWludXRlcyI6MjAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAyIHBhbmVjaWxsb3MgaW50ZWdyYWxlcyJ9LHsibmFtZSI6Imh1ZXZvcyIsInF1YW50aXR5IjozLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoidG9tYXRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJyw7pjdWxhIiwicXVhbnRpdHkiOjQwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS80IGNlYm9sbGEifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBsYSBjZWJvbGxhIHkgY3VhamEgdW5hIHRvcnRpbGxhIGZpbmEgZGUgdHJlcyBodWV2b3MuIiwiQWJyZSBwYW5lY2lsbG9zIHkgYcOxYWRlIHRvbWF0ZSBlbiByb2RhamFzLiIsIlJlbGxlbmEgY29uIHRvcnRpbGxhLCByw7pjdWxhIHkgdW4gaGlsbyBkZSBhY2VpdGUuIl19LHsia2V5IjoiYmFzZS12Mi0xMTAiLCJ0aXRsZSI6IlBpdGEgaW50ZWdyYWwgY29uIGh1bW11cywgdmVyZHVyYXMgeSBodWV2byBkdXJvIiwiZGlzaF90eXBlIjoib3RoZXIiLCJ0b3RhbF9taW51dGVzIjoyMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDIgcGFuZXMgcGl0YSBpbnRlZ3JhbGVzIn0seyJuYW1lIjoiaHVtbXVzIiwicXVhbnRpdHkiOjIwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6Imh1ZXZvcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIHBlcGlubyJ9LHsibmFtZSI6InRvbWF0ZSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiemFuYWhvcmlhIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJsZWNodWdhIHkgYWNlaXRlIn1dLCJzdGVwcyI6WyIqIEN1ZWNlIGh1ZXZvcyAxMCBtaW4geSBlbmZyw61hLiIsIkNhbGllbnRhIHBpdGFzIGJyZXZlbWVudGUsIMO6bnRhbGFzIGNvbiBodW1tdXMuIiwiUmVsbGVuYSBjb24gdmVyZHVyYXMgZW4gdGlyYXMsIGxlY2h1Z2EgeSBodWV2byBlbiByb2RhamFzLiJdfSx7ImtleSI6ImJhc2UtdjItMTExIiwidGl0bGUiOiJDb2NpZG8gbGlnZXJvIGRlIGdhcmJhbnpvcywgdmVyZHVyYXMgeSBwb2xsbyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjo3NSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDM1MCBnIGdhcmJhbnpvcyBjb2NpZG9zIn0seyJuYW1lIjoicG9sbG8iLCJxdWFudGl0eSI6MzUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoicHVlcnJvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ6YW5haG9yaWFzIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJwYXRhdGEiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvNCByZXBvbGxvIn0seyJuYW1lIjoiMSJ9LHsibmFtZSI6ImNhbGRvIGRlIHBvbGxvIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6ImwifSx7Im5hbWUiOiJzYWwifV0sInN0ZXBzIjpbIiogQ3VlY2UgcG9sbG8sIHB1ZXJybyB5IHphbmFob3JpYSBlbiBjYWxkbyAzMCBtaW4uIiwiQcOxYWRlIHBhdGF0YSB5IHJlcG9sbG8sIHkgY29jaW5hIDIwIG1pbi4iLCJJbmNvcnBvcmEgZ2FyYmFuem9zIDEwIG1pbiwgYWp1c3RhIHNhbCB5IHNpcnZlIGNhbGRvIHkgc8OzbGlkb3MganVudG9zLiJdfSx7ImtleSI6ImJhc2UtdjItMTEyIiwidGl0bGUiOiJBam8gYmxhbmNvIGNvbiB1dmFzIHkgYWxtZW5kcmFzIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjE1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMTAwIGcgYWxtZW5kcmFzIGNydWRhcyBwZWxhZGFzIn0seyJuYW1lIjoiYWpvIHBlcXVlw7FvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJwYW4gZGVsIGTDrWEgYW50ZXJpb3IiLCJxdWFudGl0eSI6ODAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhZ3VhIGZyw61hIiwicXVhbnRpdHkiOjM1MCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJhY2VpdGUiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoidmluYWdyZSIsInF1YW50aXR5IjoxMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJ1dmFzIHkgc2FsIiwicXVhbnRpdHkiOjE1MCwidW5pdF9jb2RlIjoiZyJ9XSwic3RlcHMiOlsiKiBSZW1vamEgcGFuIGVuIGFndWEgNSBtaW4uIiwiVHJpdHVyYSBhbG1lbmRyYXMsIGFqbywgcGFuLCBhY2VpdGUsIHZpbmFncmUsIHNhbCB5IGFndWEgaGFzdGEgZmluby4iLCJFbmZyw61hIHkgc2lydmUgY29uIHV2YXMgcGFydGlkYXMuIl19LHsia2V5IjoiYmFzZS12Mi0xMTMiLCJ0aXRsZSI6IlBvcnJhIGFudGVxdWVyYW5hIGNvbiBodWV2byB5IGF0w7puIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjIwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogNjAwIGcgdG9tYXRlIG1hZHVybyJ9LHsibmFtZSI6InBhbiBkZWwgZMOtYSBhbnRlcmlvciIsInF1YW50aXR5IjoxMjAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJham8gcGVxdWXDsW8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSIsInF1YW50aXR5Ijo1MCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJ2aW5hZ3JlIiwicXVhbnRpdHkiOjEwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6Imh1ZXZvcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoibGF0YSBkZSBhdMO6biIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoic2FsIn1dLCJzdGVwcyI6WyIqIFJlbW9qYSBwYW4gY29uIGVsIHRvbWF0ZSB0cm9jZWFkbyAxMCBtaW4uIiwiVHJpdHVyYSBjb24gYWpvLCBhY2VpdGUsIHZpbmFncmUgeSBzYWwgaGFzdGEgZXNwZXNvLiIsIkVuZnLDrWEgeSBzaXJ2ZSBjb24gaHVldm8gY29jaWRvIHkgYXTDum4uIl19LHsia2V5IjoiYmFzZS12Mi0xMTQiLCJ0aXRsZSI6IlBpcGlycmFuYSBkZSB0b21hdGUsIHBpbWllbnRvIHkgaHVldm8iLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MjAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAzIHRvbWF0ZXMifSx7Im5hbWUiOiJwaW1pZW50byB2ZXJkZSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIHBlcGlubyJ9LHsibmFtZSI6IjEvNCBjZWJvbGxhIn0seyJuYW1lIjoiaHVldm9zIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUifSx7Im5hbWUiOiJ2aW5hZ3JlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEN1ZWNlIGh1ZXZvcyAxMCBtaW4geSBlbmZyw61hLiIsIkNvcnRhIGxhcyB2ZXJkdXJhcyBlbiBkYWRvcyBwZXF1ZcOxb3MuIiwiQWxpw7FhLCBtZXpjbGEgY29uIGh1ZXZvIHBpY2FkbyB5IGRlamEgcmVwb3NhciAxMCBtaW4gYW50ZXMgZGUgc2VydmlyLiJdfSx7ImtleSI6ImJhc2UtdjItMTE1IiwidGl0bGUiOiJUdW1iZXQgbWFsbG9ycXXDrW4gZGUgdmVyZHVyYXMiLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6NTUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAyIHBhdGF0YXMifSx7Im5hbWUiOiJiZXJlbmplbmEiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGFiYWPDrW4iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InBpbWllbnRvIHJvam8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InRvbWF0ZSB0cml0dXJhZG8iLCJxdWFudGl0eSI6NDAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYWpvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogQXNhIHBhdGF0YSwgYmVyZW5qZW5hLCBjYWxhYmFjw61uIHkgcGltaWVudG8gZW4gcm9kYWphcyBjb24gYWNlaXRlIDMwIG1pbiBhIDIwMCDCsEMuIiwiQ3VlY2UgdG9tYXRlIGNvbiBham8gMTIgbWluLiIsIk1vbnRhIGNhcGFzIGRlIHZlcmR1cmFzIHkgdG9tYXRlIHkgaG9ybmVhIDggbWluIG3DoXMuIl19LHsia2V5IjoiYmFzZS12Mi0xMTYiLCJ0aXRsZSI6IkVzY3VkZWxsYSB2ZWdldGFsIGNvbiBqdWTDrWFzIGJsYW5jYXMiLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6NTUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA0MDAgZyBhbHViaWFzIGJsYW5jYXMgY29jaWRhcyJ9LHsibmFtZSI6InB1ZXJybyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiemFuYWhvcmlhcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoicGF0YXRhIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzQgcmVwb2xsbyJ9LHsibmFtZSI6IjEvMiBuYWJvIn0seyJuYW1lIjoiY2FsZG8gZGUgdmVyZHVyYXMiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoibCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIHB1ZXJybyB5IGHDsWFkZSB6YW5haG9yaWEsIG5hYm8geSBwYXRhdGEgZW4gZGFkb3MuIiwiQ3VicmUgY29uIGNhbGRvIHkgY3VlY2UgMjUgbWluLiIsIkluY29ycG9yYSByZXBvbGxvIHkgYWx1YmlhcyB5IGNvY2luYSAxMiBtaW4gbcOhcy4iXX0seyJrZXkiOiJiYXNlLXYyLTExNyIsInRpdGxlIjoiTWFybWl0YWtvIGRlIGJvbml0byIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjo0NSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDM1MCBnIGJvbml0byJ9LHsibmFtZSI6InBhdGF0YSIsInF1YW50aXR5Ijo0NTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6InBpbWllbnRvIHZlcmRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ0b21hdGUiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGRvIGRlIHBlc2NhZG8iLCJxdWFudGl0eSI6NzAwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6InBpbWVudMOzbiBkdWxjZSJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEgeSBwaW1pZW50bywgYcOxYWRlIHRvbWF0ZSByYWxsYWRvIHkgcGltZW50w7NuLiIsIkluY29ycG9yYSBwYXRhdGEgY2hhc2NhZGEgeSBjYWxkbywgeSBjdWVjZSAyNSBtaW4uIiwiQcOxYWRlIGJvbml0byBlbiB0YWNvcywgYXBhZ2EgYSBsb3MgMyBtaW4geSByZXBvc2EuIl19LHsia2V5IjoiYmFzZS12Mi0xMTgiLCJ0aXRsZSI6IlN1cXVldCBkZSBwZXNjYWRvIGNvbiBwYXRhdGEgeSBhbG1lbmRyYXMiLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6NTAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAzNTAgZyBwZXNjYWRvIGJsYW5jbyJ9LHsibmFtZSI6InBhdGF0YSIsInF1YW50aXR5IjozNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJnYW1iYXMiLCJxdWFudGl0eSI6MTUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoidG9tYXRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImFqbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWxtZW5kcmFzIiwicXVhbnRpdHkiOjI1LCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiY2FsZG8gZGUgcGVzY2FkbyIsInF1YW50aXR5Ijo2MDAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIFNvZnLDrWUgY2Vib2xsYSwgYWpvIHkgdG9tYXRlLiIsIkHDsWFkZSBwYXRhdGEsIGNhbGRvIHkgYWxtZW5kcmFzIG1hY2hhY2FkYXMsIHkgY3VlY2UgMjAgbWluLiIsIkluY29ycG9yYSBwZXNjYWRvIHkgZ2FtYmFzIHkgY29jaW5hIDcgbWluIGEgZnVlZ28gc3VhdmUuIl19LHsia2V5IjoiYmFzZS12Mi0xMTkiLCJ0aXRsZSI6IkNhbGRlcmV0YSBzZW5jaWxsYSBkZSBwZXNjYWRvIHkgbWFyaXNjbyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjo1MCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDMwMCBnIHBlc2NhZG8gYmxhbmNvIn0seyJuYW1lIjoibWVqaWxsb25lcyIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJsYW5nb3N0aW5vcyIsInF1YW50aXR5IjoxNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJwYXRhdGEiLCJxdWFudGl0eSI6MzUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJ0b21hdGUiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbGRvIGRlIHBlc2NhZG8iLCJxdWFudGl0eSI6NjUwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBTb2Zyw61lIGNlYm9sbGEgeSB0b21hdGUsIGHDsWFkZSBwYXRhdGEgeSBjYWxkby4iLCJDb2NpbmEgMjAgbWluLiIsIkluY29ycG9yYSBwZXNjYWRvLCBsYW5nb3N0aW5vcyB5IG1lamlsbG9uZXMsIHRhcGEgaGFzdGEgYWJyaXIgeSBjb2NpbmEgNiBtaW4gbcOhcy4iXX0seyJrZXkiOiJiYXNlLXYyLTEyMCIsInRpdGxlIjoiWmFyYW5nb2xsbyBtdXJjaWFubyBkZSBjYWxhYmFjw61uLCBjZWJvbGxhIHkgaHVldm8iLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MjUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAxIGNhbGFiYWPDrW4gZ3JhbmRlIn0seyJuYW1lIjoiY2Vib2xsYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiaHVldm9zIiwicXVhbnRpdHkiOjQsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn1dLCJzdGVwcyI6WyIqIFBvY2hhIGNlYm9sbGEgZW4ganVsaWFuYSBjb24gYWNlaXRlIDggbWluLiIsIkHDsWFkZSBjYWxhYmFjw61uIGZpbm8geSBjb2NpbmEgdGFwYWRvIDEwIG1pbi4iLCJJbmNvcnBvcmEgaHVldm9zIGJhdGlkb3MsIHNhbGEgeSByZW11ZXZlIGhhc3RhIGN1YWphciBjcmVtb3NvLiJdfSx7ImtleSI6ImJhc2UtdjItMTIxIiwidGl0bGUiOiJBam9ibGFuY28gZGUgbWVsw7NuIHkgYWxtZW5kcmFzIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjE1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMzUwIGcgbWVsw7NuIn0seyJuYW1lIjoiYWxtZW5kcmFzIGNydWRhcyBwZWxhZGFzIiwicXVhbnRpdHkiOjgwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoicGFuIiwicXVhbnRpdHkiOjYwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYWpvIHBlcXVlw7FvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhZ3VhIGZyw61hIiwicXVhbnRpdHkiOjI1MCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJhY2VpdGUiLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoidmluYWdyZSB5IHNhbCIsInF1YW50aXR5IjoxMCwidW5pdF9jb2RlIjoibWwifV0sInN0ZXBzIjpbIiogUmVtb2phIHBhbiBjb24gYWd1YSA1IG1pbi4iLCJUcml0dXJhIG1lbMOzbiwgYWxtZW5kcmFzLCBwYW4sIGFqbywgYWNlaXRlLCB2aW5hZ3JlIHkgc2FsIGhhc3RhIGZpbm8uIiwiQWp1c3RhIGFndWEsIGVuZnLDrWEgeSBzaXJ2ZS4iXX0seyJrZXkiOiJiYXNlLXYyLTEyMiIsInRpdGxlIjoiUGF0YXRhcyBhIGxhIGltcG9ydGFuY2lhIGNvbiB2ZXJkdXJhcyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjo0NSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQwMCBnIHBhdGF0YSJ9LHsibmFtZSI6Imh1ZXZvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJoYXJpbmEiLCJxdWFudGl0eSI6NTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6InphbmFob3JpYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiZ3Vpc2FudGVzIiwicXVhbnRpdHkiOjIwMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImNhbGRvIGRlIHZlcmR1cmFzIiwicXVhbnRpdHkiOjU1MCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJhemFmcsOhbiBvIGNvbG9yYW50ZSJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBDb3J0YSBwYXRhdGEgZW4gcm9kYWphcywgcMOhc2FsYSBwb3IgaGFyaW5hIHkgaHVldm8geSBkw7NyYWxhcyBsaWdlcmFtZW50ZS4iLCJTb2Zyw61lIGNlYm9sbGEgeSB6YW5haG9yaWEsIGHDsWFkZSBjYWxkbyB5IGNvbG9yYW50ZS4iLCJJbmNvcnBvcmEgcGF0YXRhcyB5IGd1aXNhbnRlcywgeSBjdWVjZSAyMCBtaW4uIl19LHsia2V5IjoiYmFzZS12Mi0xMjMiLCJ0aXRsZSI6IkVzcGluYWNhcyBjb24gZ2FyYmFuem9zIGFsIGVzdGlsbyBzZXZpbGxhbm8iLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MzUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAzNTAgZyBnYXJiYW56b3MgY29jaWRvcyJ9LHsibmFtZSI6ImVzcGluYWNhcyIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJham9zIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJyZWJhbmFkYSBwYW4iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImN1Y2hhcmFkaXRhIHBpbWVudMOzbiBkdWxjZSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiY3VjaGFyYWRpdGEgY29taW5vIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJjYWxkbyIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEZyw61lIHBhbiB5IHVuIGFqbywgbWFjaMOhY2Fsb3MgY29uIGNvbWlubyB5IHVuIHBvY28gZGUgY2FsZG8uIiwiU29mcsOtZSBlbCBvdHJvIGFqbywgYcOxYWRlIHBpbWVudMOzbiBkdWxjZSB5IGVzcGluYWNhcy4iLCJJbmNvcnBvcmEgZ2FyYmFuem9zIHkgbWFqYWRvOyBjb2NpbmEgMTAgbWluLiJdfSx7ImtleSI6ImJhc2UtdjItMTI0IiwidGl0bGUiOiJUcmlueGF0IGRlIGNvbCB5IHBhdGF0YSBjb24gaHVldm8iLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MzUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAzNTAgZyBwYXRhdGEifSx7Im5hbWUiOiJjb2wiLCJxdWFudGl0eSI6MzAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiaHVldm9zIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJham8iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCIsInF1YW50aXR5IjoyMCwidW5pdF9jb2RlIjoibWwifV0sInN0ZXBzIjpbIiogQ3VlY2UgcGF0YXRhIHkgY29sIGhhc3RhIHRpZXJuYXM7IGVzY3VycmUgeSBhcGxhc3RhIGp1bnRhcy4iLCJEb3JhIGFqbyBlbiBhY2VpdGUgeSBzYWx0ZWEgZWwgY29uanVudG8gaGFzdGEgZm9ybWFyIHVuYSB0b3J0YS4iLCJTaXJ2ZSBjb24gaHVldm9zIGEgbGEgcGxhbmNoYS4iXX0seyJrZXkiOiJiYXNlLXYyLTEyNSIsInRpdGxlIjoiUGltaWVudG9zIGRlbCBwaXF1aWxsbyByZWxsZW5vcyBkZSBtZXJsdXphIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjQ1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMTAgcGltaWVudG9zIGRlbCBwaXF1aWxsbyJ9LHsibmFtZSI6Im1lcmx1emEiLCJxdWFudGl0eSI6MzAwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJnYW1iYXMgcGVsYWRhcyIsInF1YW50aXR5IjoxNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJsZWNoZSIsInF1YW50aXR5IjoyMDAsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoiaGFyaW5hIiwicXVhbnRpdHkiOjE1LCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoidG9tYXRlIHRyaXR1cmFkbyIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBjZWJvbGxhLCBhw7FhZGUgbWVybHV6YSB5IGdhbWJhcyBkZXNtZW51emFkYXMuIiwiTGlnYSBjb24gaGFyaW5hIHkgbGVjaGUgaGFzdGEgdW5hIG1hc2Egc3VhdmUuIiwiUmVsbGVuYSBwaW1pZW50b3MsIGPDumJyZWxvcyBjb24gdG9tYXRlIHkgaG9ybmVhIDE1IG1pbiBhIDE5MCDCsEMuIl19LHsia2V5IjoiYmFzZS12Mi0xMjYiLCJ0aXRsZSI6IkVuc2FsYWRhIG1lZGl0ZXJyw6FuZWEgZGUgdG9tYXRlLCBwZXBpbm8sIGFjZWl0dW5hcyB5IHF1ZXNvIGZyZXNjbyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjoxNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDMgdG9tYXRlcyJ9LHsibmFtZSI6IjEvMiBwZXBpbm8ifSx7Im5hbWUiOiJxdWVzbyBmcmVzY28iLCJxdWFudGl0eSI6MTIwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYWNlaXR1bmFzIiwicXVhbnRpdHkiOjUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS80IGNlYm9sbGEifSx7Im5hbWUiOiJhY2VpdGUifSx7Im5hbWUiOiJ2aW5hZ3JlIn0seyJuYW1lIjoib3LDqWdhbm8geSBzYWwifV0sInN0ZXBzIjpbIiogQ29ydGEgdG9tYXRlLCBwZXBpbm8sIHF1ZXNvIHkgY2Vib2xsYS4iLCJBw7FhZGUgYWNlaXR1bmFzLiIsIkFsacOxYSBqdXN0byBhbnRlcyBkZSBzZXJ2aXIgY29uIGFjZWl0ZSwgdmluYWdyZSwgb3LDqWdhbm8geSBzYWwuIl19LHsia2V5IjoiYmFzZS12Mi0xMjciLCJ0aXRsZSI6IkVuc2FsYWRhIGdyaWVnYSBjb24gZ2FyYmFuem9zIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjIwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMjUwIGcgZ2FyYmFuem9zIGNvY2lkb3MifSx7Im5hbWUiOiJ0b21hdGVzIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgcGVwaW5vIn0seyJuYW1lIjoiMS80IGNlYm9sbGEifSx7Im5hbWUiOiJxdWVzbyBmcmVzY28iLCJxdWFudGl0eSI6MTIwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYWNlaXR1bmFzIiwicXVhbnRpdHkiOjQwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYWNlaXRlIn0seyJuYW1lIjoibGltw7NuIHkgb3LDqWdhbm8ifV0sInN0ZXBzIjpbIiogRW5qdWFnYSB5IGVzY3VycmUgZ2FyYmFuem9zLiIsIkNvcnRhIHZlcmR1cmFzIHkgcXVlc28gZW4gZGFkb3MuIiwiTWV6Y2xhIGNvbiBhY2VpdHVuYXMgeSBhbGnDsWEgY29uIGFjZWl0ZSwgbGltw7NuLCBvcsOpZ2FubyB5IHNhbC4iXX0seyJrZXkiOiJiYXNlLXYyLTEyOCIsInRpdGxlIjoiRW5zYWxhZGEgZGUgcGF0YXRhLCBqdWTDrWEgdmVyZGUsIGh1ZXZvIHkgY2FiYWxsYSIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjozMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQwMCBnIHBhdGF0YSJ9LHsibmFtZSI6Imp1ZMOtYXMgdmVyZGVzIiwicXVhbnRpdHkiOjI1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6Imh1ZXZvcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoibGF0YSBkZSBjYWJhbGxhIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ0b21hdGUiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSJ9LHsibmFtZSI6InZpbmFncmUgeSBzYWwifV0sInN0ZXBzIjpbIiogQ3VlY2UgcGF0YXRhLCBqdWTDrWFzIHkgaHVldm9zOyBlbmZyw61hIHRlbXBsYWRvLiIsIkNvcnRhIHBhdGF0YSB5IGh1ZXZvLiIsIk1lemNsYSBjb24gY2FiYWxsYSBlc2N1cnJpZGEsIHRvbWF0ZSB5IGFsacOxbyBkZSBhY2VpdGUgeSB2aW5hZ3JlLiJdfSx7ImtleSI6ImJhc2UtdjItMTI5IiwidGl0bGUiOiJFbnNhbGFkYSBkZSBsZW50ZWphcyBjb24gemFuYWhvcmlhLCBtYW56YW5hIHkgbnVlY2VzIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjIwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMzAwIGcgbGVudGVqYXMgY29jaWRhcyJ9LHsibmFtZSI6InphbmFob3JpYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoibWFuemFuYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoibnVlY2VzIiwicXVhbnRpdHkiOjMwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS80IGNlYm9sbGEifSx7Im5hbWUiOiIxLzIgbGltw7NuIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEVuanVhZ2EgbGVudGVqYXMgeSBlc2N1cnJlIGJpZW4uIiwiUmFsbGEgemFuYWhvcmlhIHkgY29ydGEgbWFuemFuYSB5IGNlYm9sbGEgbXV5IGZpbmFzLiIsIk1lemNsYSBjb24gbnVlY2VzIHkgYWxpw7FhIGNvbiBsaW3Ds24sIGFjZWl0ZSB5IHNhbC4iXX0seyJrZXkiOiJiYXNlLXYyLTEzMCIsInRpdGxlIjoiRW5zYWxhZGEgZGUgYXJyb3ogaW50ZWdyYWwsIGF0w7puIHkgdmVyZHVyYXMiLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MzAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAxNDAgZyBhcnJveiBpbnRlZ3JhbCJ9LHsibmFtZSI6ImxhdGEgZGUgYXTDum4iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6InRvbWF0ZSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIHBlcGlubyJ9LHsibmFtZSI6IjEvMiBwaW1pZW50byByb2pvIn0seyJuYW1lIjoiaHVldm9zIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUifSx7Im5hbWUiOiJ2aW5hZ3JlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEN1ZWNlIGFycm96IHkgaHVldm9zLCB5IGVuZnLDrWEuIiwiQ29ydGEgdmVyZHVyYXMgZW4gZGFkb3MuIiwiTWV6Y2xhIGFycm96IGNvbiBhdMO6biwgdmVyZHVyYXMgeSBodWV2bywgeSBhbGnDsWEgYWwgZ3VzdG8uIl19LHsia2V5IjoiYmFzZS12Mi0xMzEiLCJ0aXRsZSI6IkVuc2FsYWRhIGRlIGFycm96IGludGVncmFsLCBjYWxhYmF6YSBhc2FkYSB5IHF1ZXNvIGZyZXNjbyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjozNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDE0MCBnIGFycm96IGludGVncmFsIn0seyJuYW1lIjoiY2FsYWJhemEiLCJxdWFudGl0eSI6MzUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoicXVlc28gZnJlc2NvIiwicXVhbnRpdHkiOjEyMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6Im51ZWNlcyIsInF1YW50aXR5IjozMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImhvamFzIHZlcmRlcyJ9LHsibmFtZSI6IjEvMiBsaW3Ds24ifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogQXNhIGNhbGFiYXphIGVuIGRhZG9zIDI1IG1pbiBhIDIwMCDCsEMuIiwiQ3VlY2UgYXJyb3ogeSBkZWphIHRlbXBsYXIuIiwiTWV6Y2xhIGNvbiBxdWVzbywgbnVlY2VzLCBob2phcyB2ZXJkZXMgeSBhbGnDsW8gZGUgbGltw7NuIHkgYWNlaXRlLiJdfSx7ImtleSI6ImJhc2UtdjItMTMyIiwidGl0bGUiOiJFbnNhbGFkYSBkZSByZW1vbGFjaGEsIG5hcmFuamEgeSBudWVjZXMiLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MTUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAzMDAgZyByZW1vbGFjaGEgY29jaWRhIn0seyJuYW1lIjoibmFyYW5qYXMiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6Im51ZWNlcyIsInF1YW50aXR5IjozMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImhvamFzIHZlcmRlcyIsInF1YW50aXR5Ijo1MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvNCBjZWJvbGxhIn0seyJuYW1lIjoiYWNlaXRlIn0seyJuYW1lIjoidmluYWdyZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBDb3J0YSByZW1vbGFjaGEgeSBuYXJhbmphIGVuIHRyb3pvcy4iLCJBw7FhZGUgaG9qYXMgdmVyZGVzLCBjZWJvbGxhIG11eSBmaW5hIHkgbnVlY2VzLiIsIkFsacOxYSBjb24gYWNlaXRlLCB1bmFzIGdvdGFzIGRlIHZpbmFncmUgeSBzYWwuIl19LHsia2V5IjoiYmFzZS12Mi0xMzMiLCJ0aXRsZSI6IkVuc2FsYWRhIHRlbXBsYWRhIGRlIGp1ZMOtYXMgdmVyZGVzLCB0b21hdGUgeSBhbG1lbmRyYXMiLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MjUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAzMDAgZyBqdWTDrWFzIHZlcmRlcyJ9LHsibmFtZSI6InRvbWF0ZXMiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFsbWVuZHJhcyIsInF1YW50aXR5IjozMCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6IjEvNCBjZWJvbGxhIn0seyJuYW1lIjoiaHVldm8gb3BjaW9uYWwiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImFjZWl0ZSJ9LHsibmFtZSI6InZpbmFncmUgeSBzYWwifV0sInN0ZXBzIjpbIiogQ3VlY2UganVkw61hcyBoYXN0YSB0aWVybmFzIHkgZXNjw7pycmVsYXMuIiwiVHVlc3RhIGFsbWVuZHJhcyBlbiBzYXJ0w6luLiIsIk1lemNsYSBqdWTDrWFzIGHDum4gdGVtcGxhZGFzIGNvbiB0b21hdGUsIGNlYm9sbGEsIGFsbWVuZHJhcyB5IGFsacOxby4iXX0seyJrZXkiOiJiYXNlLXYyLTEzNCIsInRpdGxlIjoiQ29saWZsb3IgcGljYWRhIGNvbiB0b21hdGUsIGhpZXJiYXMgeSBnYXJiYW56b3MiLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MjAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAxIGNvbGlmbG9yIHBlcXVlw7FhIn0seyJuYW1lIjoiZ2FyYmFuem9zIGNvY2lkb3MiLCJxdWFudGl0eSI6MjUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoidG9tYXRlcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS80IGNlYm9sbGEifSx7Im5hbWUiOiJwZXJlamlsIn0seyJuYW1lIjoiMS8yIGxpbcOzbiJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBUcml0dXJhIGNvbGlmbG9yIGNydWRhIGhhc3RhIGFzcGVjdG8gZGUgZ3Jhbm8geSBzYWx0ZWEgNCBtaW4gbyDDunNhbGEgY3J1ZGEgZmluYS4iLCJNZXpjbGEgY29uIGdhcmJhbnpvcywgdG9tYXRlIHkgY2Vib2xsYS4iLCJBbGnDsWEgY29uIGxpbcOzbiwgYWNlaXRlIHkgcGVyZWppbC4iXX0seyJrZXkiOiJiYXNlLXYyLTEzNSIsInRpdGxlIjoiRW5zYWxhZGEgZGUgcGFzdGEgaW50ZWdyYWwgY29uIHZlcmR1cmFzIHkgbW96emFyZWxsYSIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjoyNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDE2MCBnIHBhc3RhIGludGVncmFsIn0seyJuYW1lIjoidG9tYXRlIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgcGVwaW5vIn0seyJuYW1lIjoiMS8yIHBpbWllbnRvIHJvam8ifSx7Im5hbWUiOiJtb3p6YXJlbGxhIiwicXVhbnRpdHkiOjEyNSwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFsYmFoYWNhIn0seyJuYW1lIjoiYWNlaXRlIn0seyJuYW1lIjoidmluYWdyZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBDdWVjZSBwYXN0YSB5IGVuZnLDrWEgYmFqbyBhZ3VhIGJyZXZlbWVudGUuIiwiQ29ydGEgdmVyZHVyYXMgeSBtb3p6YXJlbGxhIGVuIGRhZG9zLiIsIk1lemNsYSBjb24gYWxiYWhhY2EgeSBhbGnDsWEganVzdG8gYW50ZXMgZGUgc2VydmlyLiJdfSx7ImtleSI6ImJhc2UtdjItMTM2IiwidGl0bGUiOiJTb3BhIGRlIHZlcmR1cmFzIGNvbiBmaWRlb3MgaW50ZWdyYWxlcyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjozMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDEgcHVlcnJvIn0seyJuYW1lIjoiemFuYWhvcmlhcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiY2FsYWJhY8OtbiIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiJmaWRlb3MgaW50ZWdyYWxlcyIsInF1YW50aXR5Ijo4MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImNhbGRvIGRlIHZlcmR1cmFzIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6ImwifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBjZWJvbGxhIHkgcHVlcnJvIDUgbWluLiIsIkHDsWFkZSB6YW5haG9yaWEsIGNhbGFiYWPDrW4geSBjYWxkbywgeSBjdWVjZSAxNSBtaW4uIiwiSW5jb3Jwb3JhIGZpZGVvcyB5IGNvY2luYSBlbCB0aWVtcG8gaW5kaWNhZG8uIl19LHsia2V5IjoiYmFzZS12Mi0xMzciLCJ0aXRsZSI6IkNyZW1hIGRlIHphbmFob3JpYSB5IG5hcmFuamEiLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6MzAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiA1MDAgZyB6YW5haG9yaWFzIn0seyJuYW1lIjoicGF0YXRhIHBlcXVlw7FhIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImNhbGRvIGRlIHZlcmR1cmFzIiwicXVhbnRpdHkiOjUwMCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJuYXJhbmphIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ5b2d1ciBuYXR1cmFsIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBjZWJvbGxhLCBhw7FhZGUgemFuYWhvcmlhLCBwYXRhdGEgeSBjYWxkby4iLCJDdWVjZSAyMCBtaW4geSB0cml0dXJhIGNvbiBlbCB6dW1vIGRlIG1lZGlhIG5hcmFuamEuIiwiU2lydmUgY29uIHVuYSBjdWNoYXJhZGEgZGUgeW9ndXIgcG9yIGN1ZW5jby4iXX0seyJrZXkiOiJiYXNlLXYyLTEzOCIsInRpdGxlIjoiRW5zYWxhZGEgY2FwcmVzZSBjb24gcGFuIGludGVncmFsIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjE1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMyB0b21hdGVzIn0seyJuYW1lIjoibW96emFyZWxsYSIsInF1YW50aXR5IjoxMjUsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJhbGJhaGFjYSBmcmVzY2EifSx7Im5hbWUiOiJyZWJhbmFkYXMgcGFuIGludGVncmFsIiwicXVhbnRpdHkiOjQsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUifSx7Im5hbWUiOiJzYWwgeSBvcsOpZ2FubyJ9XSwic3RlcHMiOlsiKiBDb3J0YSB0b21hdGUgeSBtb3p6YXJlbGxhIGVuIHJvZGFqYXMuIiwiQWx0ZXJuYSBlbiB1bmEgZnVlbnRlIGNvbiBhbGJhaGFjYS4iLCJBbGnDsWEgY29uIGFjZWl0ZSwgc2FsIHkgb3LDqWdhbm8sIHkgc2lydmUgY29uIHBhbiB0b3N0YWRvLiJdfSx7ImtleSI6ImJhc2UtdjItMTM5IiwidGl0bGUiOiJCb2NhZGlsbG8gaW50ZWdyYWwgZGUgcGVjaHVnYSBkZSBwb2xsbywgdG9tYXRlIHkgbGVjaHVnYSIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjoyMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDIgcGFuZWNpbGxvcyBpbnRlZ3JhbGVzIn0seyJuYW1lIjoicGVjaHVnYSBkZSBwb2xsbyIsInF1YW50aXR5IjoyNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJ0b21hdGUiLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImxlY2h1Z2EifSx7Im5hbWUiOiIxLzIgbGltw7NuIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIENvY2luYSBsYSBwZWNodWdhIGVuIGZpbGV0ZXMgY29uIGFjZWl0ZSB5IHNhbC4iLCJBYnJlIHBhbmVjaWxsb3MgeSBhw7FhZGUgdG9tYXRlIHkgbGVjaHVnYS4iLCJJbmNvcnBvcmEgcG9sbG8sIHVuYXMgZ290YXMgZGUgbGltw7NuIHkgY2llcnJhLiJdfSx7ImtleSI6ImJhc2UtdjItMTQwIiwidGl0bGUiOiJUb3N0YSBkZSBxdWVzbyBmcmVzY28sIHRvbWF0ZSB5IG9yw6lnYW5vIiwiZGlzaF90eXBlIjoic3RhcnRlciIsInRvdGFsX21pbnV0ZXMiOjE1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogNCByZWJhbmFkYXMgcGFuIGludGVncmFsIn0seyJuYW1lIjoicXVlc28gZnJlc2NvIiwicXVhbnRpdHkiOjE2MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6InRvbWF0ZXMiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6Im9yw6lnYW5vIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIFR1ZXN0YSBlbCBwYW4uIiwiUmVwYXJ0ZSBxdWVzbyBmcmVzY28gZGVzbWVudXphZG8geSB0b21hdGUgZW4gcm9kYWphcy4iLCJBw7FhZGUgb3LDqWdhbm8sIGFjZWl0ZSB5IHVuYSBwaXpjYSBkZSBzYWw7IGdyYXRpbmEgMyBtaW4gc2kgc2UgZGVzZWEuIl19LHsia2V5IjoiYmFzZS12Mi0xNDEiLCJ0aXRsZSI6IlB1csOpIGRlIHBhdGF0YSB5IHphbmFob3JpYSBjb24gaHVldm8gZHVybyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjozMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQwMCBnIHBhdGF0YSJ9LHsibmFtZSI6InphbmFob3JpYSIsInF1YW50aXR5IjozMDAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJodWV2b3MiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImxlY2hlIiwicXVhbnRpdHkiOjE1MCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJhY2VpdGUgZGUgb2xpdmEiLCJxdWFudGl0eSI6MTUsInVuaXRfY29kZSI6Im1sIn0seyJuYW1lIjoic2FsIHkgbnVleiBtb3NjYWRhIn1dLCJzdGVwcyI6WyIqIEN1ZWNlIHBhdGF0YSwgemFuYWhvcmlhIHkgaHVldm9zIGhhc3RhIHRpZXJub3MuIiwiVHJpdHVyYSB2ZXJkdXJhcyBjb24gbGVjaGUsIGFjZWl0ZSwgc2FsIHkgbnVleiBtb3NjYWRhLiIsIlNpcnZlIGNvbiBodWV2byBkdXJvIHBpY2FkbyBvIGVuIGN1YXJ0b3MuIl19LHsia2V5IjoiYmFzZS12Mi0xNDIiLCJ0aXRsZSI6IlPDoW5kd2ljaCBpbnRlZ3JhbCBkZSBwYXZvLCBxdWVzbyB5IHRvbWF0ZSIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjoxNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDQgcmViYW5hZGFzIHBhbiBpbnRlZ3JhbCJ9LHsibmFtZSI6ImZpYW1icmUgZGUgcGF2byIsInF1YW50aXR5IjoxMjAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJxdWVzbyIsInF1YW50aXR5Ijo4MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6InRvbWF0ZSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiaG9qYXMgdmVyZGVzIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIE1vbnRhIGxvcyBzw6FuZHdpY2hlcyBjb24gcGF2bywgcXVlc28sIHRvbWF0ZSB5IGhvamFzIHZlcmRlcy4iLCJQaW5jZWxhIGVsIGV4dGVyaW9yIGNvbiBtdXkgcG9jbyBhY2VpdGUuIiwiVHVlc3RhIGVuIHBsYW5jaGEgMyBtaW4gcG9yIGNhZGEgbGFkbyBoYXN0YSBmdW5kaXIgZWwgcXVlc28uIl19LHsia2V5IjoiYmFzZS12Mi0xNDMiLCJ0aXRsZSI6IlNvcGEgZGUgcG9sbG8gY29uIHZlcmR1cmFzIHkgYXJyb3oiLCJkaXNoX3R5cGUiOiJzdGFydGVyIiwidG90YWxfbWludXRlcyI6NDAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAyNTAgZyBwZWNodWdhIGRlIHBvbGxvIn0seyJuYW1lIjoicHVlcnJvIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJ6YW5haG9yaWFzIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiIxLzIgY2FsYWJhY8OtbiJ9LHsibmFtZSI6ImFycm96IHJlZG9uZG8iLCJxdWFudGl0eSI6ODAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJjYWxkbyBkZSBwb2xsbyIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJsIn0seyJuYW1lIjoiYWNlaXRlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEN1ZWNlIHBvbGxvIGNvbiBjYWxkbyB5IHZlcmR1cmFzIDIwIG1pbi4iLCJSZXRpcmEsIGRlc21lbnV6YSB5IHJlc2VydmEuIiwiQcOxYWRlIGFycm96IGFsIGNhbGRvIDE1IG1pbiwgZGV2dWVsdmUgcG9sbG8geSBhanVzdGEgc2FsLiJdfSx7ImtleSI6ImJhc2UtdjItMTQ0IiwidGl0bGUiOiJFbnNhbGFkYSBkZSB0b21hdGUsIGF0w7puLCBodWV2byB5IGFjZWl0dW5hcyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjoxNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDMgdG9tYXRlcyJ9LHsibmFtZSI6ImxhdGEgZGUgYXTDum4iLCJxdWFudGl0eSI6MSwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6Imh1ZXZvcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiYWNlaXR1bmFzIiwicXVhbnRpdHkiOjUwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiMS80IGNlYm9sbGEifSx7Im5hbWUiOiJhY2VpdGUifSx7Im5hbWUiOiJ2aW5hZ3JlIHkgc2FsIn1dLCJzdGVwcyI6WyIqIEN1ZWNlIGh1ZXZvcyAxMCBtaW4geSBlbmZyw61hLiIsIkNvcnRhIHRvbWF0ZSB5IGNlYm9sbGEsIGluY29ycG9yYSBhdMO6biB5IGFjZWl0dW5hcy4iLCJBbGnDsWEgeSB0ZXJtaW5hIGNvbiBodWV2byBlbiBjdWFydG9zLiJdfSx7ImtleSI6ImJhc2UtdjItMTQ1IiwidGl0bGUiOiJDcmVtYSBkZSBwdWVycm8geSBwYXRhdGEgY29uIHBpY2F0b3N0ZXMgaW50ZWdyYWxlcyIsImRpc2hfdHlwZSI6InN0YXJ0ZXIiLCJ0b3RhbF9taW51dGVzIjozNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDIgcHVlcnJvcyJ9LHsibmFtZSI6InBhdGF0YSIsInF1YW50aXR5IjozNTAsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6ImNhbGRvIGRlIHZlcmR1cmFzIiwicXVhbnRpdHkiOjY1MCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiJyZWJhbmFkYXMgcGFuIGludGVncmFsIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogU29mcsOtZSBwdWVycm8geSBjZWJvbGxhIDUgbWluLiIsIkHDsWFkZSBwYXRhdGEgeSBjYWxkbywgY3VlY2UgMjIgbWluIHkgdHJpdHVyYS4iLCJDb3J0YSBwYW4gZW4gZGFkb3MsIHR1w6lzdGFsbyBjb24gYWNlaXRlIHkgc2lydmUgZW5jaW1hLiJdfSx7ImtleSI6ImJhc2UtdjItMTQ2IiwidGl0bGUiOiJGcnV0YSBhc2FkYSBjb24gY2FuZWxhIHkgeW9ndXIgbmF0dXJhbCIsImRpc2hfdHlwZSI6ImRlc3NlcnQiLCJ0b3RhbF9taW51dGVzIjoyNSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDIgbWFuemFuYXMifSx7Im5hbWUiOiJwZXJhcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoieW9ndXJlcyBuYXR1cmFsZXMiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6ImNhbmVsYSJ9LHsibmFtZSI6ImFsbWVuZHJhcyB5IDEvMiBsaW3Ds24iLCJxdWFudGl0eSI6MjAsInVuaXRfY29kZSI6ImcifV0sInN0ZXBzIjpbIiogQ29ydGEgZnJ1dGEgZW4gZ2Fqb3MgeSByaWVnYSBjb24gbGltw7NuLiIsIkhvcm5lYSBjb24gY2FuZWxhIDE4IG1pbiBhIDE5MCDCsEMuIiwiU2lydmUgdGVtcGxhZGEgY29uIHlvZ3VyIHkgYWxtZW5kcmFzIHBpY2FkYXMuIl19LHsia2V5IjoiYmFzZS12Mi0xNDciLCJ0aXRsZSI6IkNvbXBvdGEgZGUgbWFuemFuYSB5IHBlcmEgc2luIGF6w7pjYXIgYcOxYWRpZG8iLCJkaXNoX3R5cGUiOiJkZXNzZXJ0IiwidG90YWxfbWludXRlcyI6MzAsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiKiAzIG1hbnphbmFzIn0seyJuYW1lIjoicGVyYXMiLCJxdWFudGl0eSI6MiwidW5pdF9jb2RlIjoidW5pdCJ9LHsibmFtZSI6IjEvMiBsaW3Ds24ifSx7Im5hbWUiOiJhZ3VhIiwicXVhbnRpdHkiOjgwLCJ1bml0X2NvZGUiOiJtbCJ9LHsibmFtZSI6ImNhbmVsYSBlbiByYW1hIn1dLCJzdGVwcyI6WyIqIFBlbGEgeSB0cm9jZWEgbGEgZnJ1dGEuIiwiQ3VlY2UgY29uIGFndWEsIGxpbcOzbiB5IGNhbmVsYSB0YXBhZGEgMjAgbWluLCByZW1vdmllbmRvIGFsZ3VuYSB2ZXouIiwiUmV0aXJhIGNhbmVsYSB5IGFwbGFzdGEgYWwgZ3VzdG8uIl19LHsia2V5IjoiYmFzZS12Mi0xNDgiLCJ0aXRsZSI6IllvZ3VyIG5hdHVyYWwgY29uIG5hcmFuamEsIGNhbmVsYSB5IGFsbWVuZHJhcyIsImRpc2hfdHlwZSI6ImRlc3NlcnQiLCJ0b3RhbF9taW51dGVzIjoxMCwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIqIDIgeW9ndXJlcyBuYXR1cmFsZXMifSx7Im5hbWUiOiJuYXJhbmphIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJhbG1lbmRyYXMiLCJxdWFudGl0eSI6MjUsInVuaXRfY29kZSI6ImcifSx7Im5hbWUiOiJjYW5lbGEgbW9saWRhIn1dLCJzdGVwcyI6WyIqIFBlbGEgbmFyYW5qYSBzaW4gcGFydGUgYmxhbmNhIHkgY8OzcnRhbGEgZW4gZGFkb3MuIiwiUmVwYXJ0ZSB5b2d1ciBlbiBkb3MgY3VlbmNvcy4iLCJBw7FhZGUgbmFyYW5qYSwgYWxtZW5kcmFzIHRvc3RhZGFzIHBpY2FkYXMgeSBjYW5lbGEuIl19LHsia2V5IjoiYmFzZS12Mi0xNDkiLCJ0aXRsZSI6Ik1hY2Vkb25pYSBkZSBmcnV0YSBkZSB0ZW1wb3JhZGEgY29uIG1lbnRhIiwiZGlzaF90eXBlIjoiZGVzc2VydCIsInRvdGFsX21pbnV0ZXMiOjE1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMiBtZWxvY290b25lcyBvIG5lY3RhcmluYXMifSx7Im5hbWUiOiJjaXJ1ZWxhcyIsInF1YW50aXR5IjoyLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoibWFuemFuYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoibmFyYW5qYSIsInF1YW50aXR5IjoxLCJ1bml0X2NvZGUiOiJ1bml0In0seyJuYW1lIjoiMS8yIGxpbcOzbiB5IG1lbnRhIGZyZXNjYSJ9XSwic3RlcHMiOlsiKiBMYXZhIHkgY29ydGEgdG9kYSBsYSBmcnV0YSBlbiBkYWRvcy4iLCJBw7FhZGUgenVtbyBkZSBuYXJhbmphIHkgbGltw7NuLiIsIk1lemNsYSBjb24gbWVudGEgcGljYWRhIHkgZW5mcsOtYSAxMCBtaW4gYW50ZXMgZGUgc2VydmlyLiJdfSx7ImtleSI6ImJhc2UtdjItMTUwIiwidGl0bGUiOiJCaXpjb2NobyBpbnRlZ3JhbCBkZSB5b2d1ciwgbGltw7NuIHkgYWNlaXRlIGRlIG9saXZhIiwiZGlzaF90eXBlIjoiZGVzc2VydCIsInRvdGFsX21pbnV0ZXMiOjUwLCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IiogMSB5b2d1ciBuYXR1cmFsIn0seyJuYW1lIjoiaHVldm9zIiwicXVhbnRpdHkiOjIsInVuaXRfY29kZSI6InVuaXQifSx7Im5hbWUiOiJoYXJpbmEgaW50ZWdyYWwiLCJxdWFudGl0eSI6MTIwLCJ1bml0X2NvZGUiOiJnIn0seyJuYW1lIjoiYXrDumNhciIsInF1YW50aXR5Ijo3MCwidW5pdF9jb2RlIjoiZyJ9LHsibmFtZSI6ImFjZWl0ZSBkZSBvbGl2YSBzdWF2ZSIsInF1YW50aXR5Ijo1MCwidW5pdF9jb2RlIjoibWwifSx7Im5hbWUiOiIxLzIgc29icmUgbGV2YWR1cmEgcXXDrW1pY2EifSx7Im5hbWUiOiJsaW3Ds24geSB1bmEgcGl6Y2EgZGUgc2FsIiwicXVhbnRpdHkiOjEsInVuaXRfY29kZSI6InVuaXQifV0sInN0ZXBzIjpbIiogQmF0ZSBodWV2b3MsIGF6w7pjYXIsIHlvZ3VyLCBhY2VpdGUgeSByYWxsYWR1cmEgZGUgbGltw7NuLiIsIkluY29ycG9yYSBoYXJpbmEsIGxldmFkdXJhIHkgc2FsIHNpbiBzb2JyZWJhdGlyLiIsIkhvcm5lYSBlbiBtb2xkZSBwZXF1ZcOxbyAzNSBtaW4gYSAxODAgwrBDIHkgZGVqYSBlbmZyaWFyLiJdfV0=', 'base64'), 'UTF8')::jsonb
    || convert_from(decode('W3sia2V5IjoiZmFtaWx5LXYxLTAwMSIsInRpdGxlIjoiUGF0YXRhcyBhIGxhIHJpb2phbmEiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NDUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiNDUwIGcgZGUgcGF0YXRhcyJ9LHsibmFtZSI6IjEwMCBnIGRlIGNob3Jpem8gZHVsY2UifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6IjEvMiBwaW1pZW50byByb2pvIn0seyJuYW1lIjoiMS8yIHBpbWllbnRvIHZlcmRlIn0seyJuYW1lIjoiMSBkaWVudGUgZGUgYWpvIn0seyJuYW1lIjoiMTAgZyBkZSBoYXJpbmEifSx7Im5hbWUiOiIzMCBtbCBkZSB2aW5vIGJsYW5jbyJ9LHsibmFtZSI6IjQ1MCBtbCBkZSBjYWxkbyBkZSBjYXJuZSBzdWF2ZSJ9LHsibmFtZSI6IjEgaG9qYSBkZSBsYXVyZWwifSx7Im5hbWUiOiIxLzIgY3VjaGFyYWRpdGEgZGUgcGltZW50w7NuIGR1bGNlIG8gY29sb3JhbnRlIGFsaW1lbnRhcmlvIn0seyJuYW1lIjoiMiBodWV2b3MifSx7Im5hbWUiOiJhY2VpdGUgZGUgb2xpdmEgeSBzYWwifV0sInN0ZXBzIjpbIiogc29mcsOtZSBjZWJvbGxhLCBwaW1pZW50b3MgeSBham8uIiwiQcOxYWRlIGVsIGNob3Jpem8gZW4gcm9kYWphcywgbGEgaGFyaW5hIHkgZWwgcGltZW50w7NuIHNpbiBxdWUgc2UgcXVlbWUuIiwiSW5jb3Jwb3JhIHBhdGF0YXMgY2hhc2NhZGFzLCB2aW5vLCBsYXVyZWwgeSBjYWxkbyBoYXN0YSBjYXNpIGN1YnJpcjsgY29sb2NhIGxvcyBodWV2b3MgbGF2YWRvcyBlbmNpbWEuIiwiQ3VlY2UgNSBtaW4gZGVzZGUgcHJlc2nDs24gYWx0YSwgZGVqYSBiYWphciBsYSBwcmVzacOzbiB5IHNpcnZlIGxvcyBodWV2b3MgcGVsYWRvcyBvIHBhcnRpZG9zLiJdLCJmYXZvcml0ZSI6dHJ1ZX0seyJrZXkiOiJmYW1pbHktdjEtMDAyIiwidGl0bGUiOiJKdWTDrWFzIGJsYW5jYXMgY29uIGNob3Jpem8iLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NDUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiMTgwIGcgZGUganVkw61hcyBibGFuY2FzIHNlY2FzIHJlbW9qYWRhcyJ9LHsibmFtZSI6IjEvMiBjZWJvbGxhIn0seyJuYW1lIjoiMiBkaWVudGVzIGRlIGFqbyJ9LHsibmFtZSI6IjgwIGcgZGUgY2hvcml6byBkdWxjZSJ9LHsibmFtZSI6IjMwIGcgZGUgcGFuY2V0YSJ9LHsibmFtZSI6IjEgaG9qYSBkZSBsYXVyZWwifSx7Im5hbWUiOiIxLzIgY3VjaGFyYWRpdGEgZGUgcGltZW50w7NuIGR1bGNlIn0seyJuYW1lIjoiNzAwIG1sIGRlIGFndWEgZnLDrWEifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogcmVob2dhIGNlYm9sbGEsIGFqbywgY2hvcml6byB5IHBhbmNldGEgY29uIGxhdXJlbCB5IHBpbWVudMOzbiBkdWxjZS4iLCJBw7FhZGUgYWd1YSBmcsOtYSB5IGxhcyBqdWTDrWFzIGVzY3VycmlkYXMuIiwiQ3VlY2UgaGFzdGEgcXVlIGVzdMOpbiB0aWVybmFzOyBzYWxhIGFsIGZpbmFsIHNpIGVsIGVtYnV0aWRvIHlhIGFwb3J0YSBzYWwuIl0sImZhdm9yaXRlIjp0cnVlfSx7ImtleSI6ImZhbWlseS12MS0wMDMiLCJ0aXRsZSI6IkdyYXRpbmFkbyBkZSBiZXJlbmplbmFzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQ1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IjIgYmVyZW5qZW5hcyBtZWRpYW5hcyAoNTAwIGcpIn0seyJuYW1lIjoiMSBjZWJvbGxhIn0seyJuYW1lIjoiMTUgbWwgZGUgYWNlaXRlIGRlIG9saXZhIn0seyJuYW1lIjoic2FsIHkgcGltaWVudGEgbmVncmEifSx7Im5hbWUiOiJ1bmEgcGl6Y2EgZGUgbnVleiBtb3NjYWRhIn0seyJuYW1lIjoiMjUwIG1sIGRlIGxlY2hlIn0seyJuYW1lIjoiMjAgZyBkZSBtYW50ZXF1aWxsYSJ9LHsibmFtZSI6IjIwIGcgZGUgaGFyaW5hIn0seyJuYW1lIjoiNjAgZyBkZSBxdWVzbyByYWxsYWRvIn1dLCJzdGVwcyI6WyIqIGNvcnRhIGxhcyBiZXJlbmplbmFzLCBzYWxhIDIwIG1pbiB5IHNlY2EuIiwiUG9jaGEgbGEgY2Vib2xsYSBjb24gc2FsLCBhw7FhZGUgYmVyZW5qZW5hLCBwaW1pZW50YSB5IG51ZXogbW9zY2FkYTsgdGFwYSBoYXN0YSBxdWUgcmVkdXpjYSBzdSBqdWdvLiIsIkhheiB1bmEgYmVjaGFtZWwgY29uIG1hbnRlcXVpbGxhLCBoYXJpbmEgeSBsZWNoZS4iLCJQYXNhIGxhIHZlcmR1cmEgYSBmdWVudGUsIGN1YnJlIGNvbiBiZWNoYW1lbCB5IHF1ZXNvLCB5IGdyYXRpbmEgMTDigJMxMiBtaW4uIl0sImZhdm9yaXRlIjp0cnVlfSx7ImtleSI6ImZhbWlseS12MS0wMDQiLCJ0aXRsZSI6IkNyb3F1ZXRhcyBkZSBqYW3Ds24gbWl4dG8iLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NDUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiNzUgZyBkZSBqYW3Ds24gY29jaWRvIn0seyJuYW1lIjoiNzUgZyBkZSBqYW3Ds24gc2VycmFubyJ9LHsibmFtZSI6IjEvNCBkZSBjZWJvbGxhIG9wY2lvbmFsIn0seyJuYW1lIjoiMjUgZyBkZSBtYW50ZXF1aWxsYSJ9LHsibmFtZSI6IjM1IGcgZGUgaGFyaW5hIn0seyJuYW1lIjoiMzUwIG1sIGRlIGxlY2hlIn0seyJuYW1lIjoic2FsIGNvbiBtb2RlcmFjacOzbiJ9LHsibmFtZSI6Im51ZXogbW9zY2FkYSJ9LHsibmFtZSI6IjEgaHVldm8ifSx7Im5hbWUiOiI4MCBnIGRlIHBhbiByYWxsYWRvIn0seyJuYW1lIjoiYWNlaXRlIHBhcmEgZnJlw61yIn1dLCJzdGVwcyI6WyIqIHBpY2EgbG9zIGphbW9uZXMuIiwiUG9jaGEgbGEgY2Vib2xsYSB5IHJldMOtcmFsYSBzaSBzZSBkZXNlYSB1bmEgbWFzYSBsaXNhOyBhw7FhZGUgbWFudGVxdWlsbGEgeSBsb3MgamFtb25lcy4iLCJJbmNvcnBvcmEgaGFyaW5hLCB0dcOpc3RhbGEgdW4gbWludXRvIHkgdmllcnRlIGxhIGxlY2hlIHBvY28gYSBwb2NvIHNpbiBkZWphciBkZSBtb3ZlciwgaGFzdGEgbWFzYSBzdWVsdGEgcGVybyBxdWUgc2UgZGVzcGVndWUuIiwiRW5mcsOtYSB0YXBhZGEgYSBwaWVsLCBmb3JtYSBjcm9xdWV0YXMsIHBhc2EgcG9yIGh1ZXZvIHkgcGFuIHJhbGxhZG8geSBmcsOtZSBwb3IgdGFuZGFzLiJdLCJmYXZvcml0ZSI6dHJ1ZX0seyJrZXkiOiJmYW1pbHktdjEtMDA1IiwidGl0bGUiOiJBbGLDs25kaWdhcyBkZSBsYSBtYW3DoSIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0NSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiI1MDAgZyBkZSBjYXJuZSBwaWNhZGEgZGUgY2VyZG8ifSx7Im5hbWUiOiJzYWwgeSBwaW1pZW50YSBuZWdyYSJ9LHsibmFtZSI6IjEgY3VjaGFyYWRhIGRlIHBlcmVqaWwgcGljYWRvIn0seyJuYW1lIjoiMeKAkzIgZGllbnRlcyBkZSBham8ifSx7Im5hbWUiOiIxIGh1ZXZvIn0seyJuYW1lIjoiNTAgbWwgZGUgbGVjaGUifSx7Im5hbWUiOiIyMCBnIGRlIHBhbiByYWxsYWRvIn0seyJuYW1lIjoiaGFyaW5hIHBhcmEgcmVib3phciJ9LHsibmFtZSI6ImFjZWl0ZSJ9LHsibmFtZSI6IjIgZGllbnRlcyBkZSBham8gbGFtaW5hZG9zIn0seyJuYW1lIjoiNzAgZyBkZSBqYW3Ds24gc2VycmFubyJ9LHsibmFtZSI6IjIwIGcgZGUgaGFyaW5hIn0seyJuYW1lIjoiMS8yIGN1Y2hhcmFkaXRhIGRlIHBpbWVudMOzbiBkdWxjZSJ9LHsibmFtZSI6IjM1MCBtbCBkZSBjYWxkbyBkZSBjYXJuZSJ9LHsibmFtZSI6ImFjZWl0ZSJ9XSwic3RlcHMiOlsiKiBtZXpjbGEgY2FybmUsIHNhbCwgcGltaWVudGEsIHBlcmVqaWwsIGFqbywgaHVldm8sIGxlY2hlIHkgcGFuIHJhbGxhZG87IGRlamEgcmVwb3NhciAxMCBtaW4uIiwiRm9ybWEgYWxiw7NuZGlnYXMsIHDDoXNhbGFzIGxpZ2VyYW1lbnRlIHBvciBoYXJpbmEgeSBkw7NyYWxhcy4iLCJQYXJhIGxhIHNhbHNhLCBzb2Zyw61lIGFqbyB5IGphbcOzbiwgYcOxYWRlIGhhcmluYSB5IHBpbWVudMOzbiBkdWxjZSwgbW9qYSBjb24gY2FsZG8geSByZW11ZXZlLiIsIkluY29ycG9yYSBhbGLDs25kaWdhcyB5IGN1ZWNlIHRhcGFkbyAyMCBtaW4uIl0sImZhdm9yaXRlIjp0cnVlfSx7ImtleSI6ImZhbWlseS12MS0wMDYiLCJ0aXRsZSI6IlJpc290dG8gZGUgY2hhbXBpw7FvbmVzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQ1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IjE4MCBnIGRlIGFycm96IHJlZG9uZG8ifSx7Im5hbWUiOiIxNTAgZyBkZSBjaGFtcGnDsW9uZXMgbyBzZXRhcyJ9LHsibmFtZSI6IjEgY2Vib2xsZXRhIn0seyJuYW1lIjoiNzAwIG1sIGRlIGNhbGRvIGRlIHBvbGxvIGNhbGllbnRlIn0seyJuYW1lIjoiMjAgZyBkZSBwYXJtZXNhbm8gcmFsbGFkbyJ9LHsibmFtZSI6IjE1IGcgZGUgbWFudGVxdWlsbGEifSx7Im5hbWUiOiIxNSBtbCBkZSBhY2VpdGUgZGUgb2xpdmEifSx7Im5hbWUiOiJzYWwgeSBwaW1pZW50YSBuZWdyYSJ9XSwic3RlcHMiOlsiKiByZWhvZ2EgY2Vib2xsZXRhIHkgY2hhbXBpw7FvbmVzIGVuIGFjZWl0ZS4iLCJBw7FhZGUgYXJyb3ogeSB0dcOpc3RhbG8gdW4gbWludXRvLiIsIlZpZXJ0ZSBkb3MgdGVyY2lvcyBkZWwgY2FsZG8geSBjb2NpbmEgYSBmdWVnbyBtZWRpbywgYcOxYWRpZW5kbyBlbCByZXN0byBwb2NvIGEgcG9jbyBzZWfDum4gYWJzb3JiYSwgZHVyYW50ZSAxOOKAkzIwIG1pbi4iLCJGdWVyYSBkZWwgZnVlZ28gaW5jb3Jwb3JhIG1hbnRlcXVpbGxhIHkgcGFybWVzYW5vLCBhanVzdGEgZGUgc2FsIHkgZGVqYSByZXBvc2FyIDIgbWluLiJdLCJmYXZvcml0ZSI6dHJ1ZX0seyJrZXkiOiJmYW1pbHktdjEtMDA3IiwidGl0bGUiOiJTb3BhIGRlIHBpY2FkaWxsbyIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0NSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIyIGh1ZXZvcyBjb2NpZG9zIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiIxIGRpZW50ZSBkZSBham8ifSx7Im5hbWUiOiI0MCBnIGRlIGphbcOzbiBzZXJyYW5vIHBpY2FkbyJ9LHsibmFtZSI6IjEvMiBjdWNoYXJhZGl0YSBkZSBwaW1lbnTDs24gZHVsY2UifSx7Im5hbWUiOiIxIGhvamEgZGUgbGF1cmVsIn0seyJuYW1lIjoiMSBwYXN0aWxsYSBkZSBjYWxkbyBkZSBjYXJuZSBvIDc1MCBtbCBkZSBjYWxkbyJ9LHsibmFtZSI6IjEwMCBnIGRlIGFycm96In0seyJuYW1lIjoiYWNlaXRlIHkgYWd1YSBzaSBzZSB1c2EgY29uY2VudHJhZG8ifV0sInN0ZXBzIjpbIiogc29mcsOtZSBjZWJvbGxhIHkgYWpvOyBhw7FhZGUgamFtw7NuLCBwaW1lbnTDs24gZHVsY2UgeSBsYXVyZWwgc2luIHF1ZW1hciBlbCBwaW1lbnTDs24uIiwiSW5jb3Jwb3JhIGNhbGRvIHkgYXJyb3osIHkgY3VlY2UgaGFzdGEgcXVlIGVzdMOpIHRpZXJuby4iLCJQaWNhIGxvcyBodWV2b3MgY29jaWRvcywgYcOxw6FkZWxvcyBhbCBmaW5hbCB5IHJlY3RpZmljYSBkZSBzYWwuIl0sImZhdm9yaXRlIjp0cnVlfSx7ImtleSI6ImZhbWlseS12MS0wMDgiLCJ0aXRsZSI6IlRvcnJpamFzIGRlIGdhbGxldGEiLCJkaXNoX3R5cGUiOiJkZXNzZXJ0IiwidG90YWxfbWludXRlcyI6NDUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiMTYgZ2FsbGV0YXMgTWFyw61hIn0seyJuYW1lIjoiMjUwIG1sIGRlIGxlY2hlIn0seyJuYW1lIjoiMS8yIHNvYnJlIGRlIHByZXBhcmFkbyBwYXJhIGZsYW4gKG8gMTUgZyBkZSBtYWljZW5hIHkgMTUgZyBkZSBhesO6Y2FyKSJ9LHsibmFtZSI6IjEgaHVldm8ifSx7Im5hbWUiOiJhY2VpdGUgc3VhdmUgcGFyYSBmcmXDrXIifSx7Im5hbWUiOiIyMCBnIGRlIGF6w7pjYXIgeSAxIGN1Y2hhcmFkaXRhIGRlIGNhbmVsYSJ9XSwic3RlcHMiOlsiKiBwcmVwYXJhIHVuYSBjcmVtYSBlc3Blc2EgY29uIGxlY2hlIHkgZmxhbiwgc2lndWllbmRvIGxhIHByb3BvcmNpw7NuIGluZGljYWRhLCB5IGRlamEgdGVtcGxhci4iLCJSZWxsZW5hIGRvcyBnYWxsZXRhcyBjb24gY3JlbWEsIHDDoXNhbGFzIGNvbiBjdWlkYWRvIHBvciBodWV2byBiYXRpZG8geSBmcsOtZWxhcyBicmV2ZW1lbnRlLiIsIkVzY3VycmUgeSByZWLDs3phbGFzIGVuIGF6w7pjYXIgY29uIGNhbmVsYS4iXSwiZmF2b3JpdGUiOnRydWV9LHsia2V5IjoiZmFtaWx5LXYxLTAwOSIsInRpdGxlIjoiTGVudGVqYXMgZGUgbGEgbWFtw6EiLCJkaXNoX3R5cGUiOiJtYWluIiwidG90YWxfbWludXRlcyI6NDUsImluZ3JlZGllbnRzIjpbeyJuYW1lIjoiMTgwIGcgZGUgbGVudGVqYSBwYXJkaW5hIn0seyJuYW1lIjoiMS8yIGNlYm9sbGEifSx7Im5hbWUiOiIxLzIgcGltaWVudG8gdmVyZGUifSx7Im5hbWUiOiIyIGRpZW50ZXMgZGUgYWpvIn0seyJuYW1lIjoiMTAwIGcgZGUgdG9tYXRlIHRyaXR1cmFkbyJ9LHsibmFtZSI6IjEgemFuYWhvcmlhIn0seyJuYW1lIjoiNTAgZyBkZSB0YXF1aXRvcyBkZSBqYW3Ds24ifSx7Im5hbWUiOiI2MCBnIGRlIGNob3Jpem8gZHVsY2Ugb3BjaW9uYWwifSx7Im5hbWUiOiIxIGhvamEgZGUgbGF1cmVsIn0seyJuYW1lIjoiMSBwYXN0aWxsYSBkZSBjYWxkbyBvIDcwMCBtbCBkZSBjYWxkbyJ9LHsibmFtZSI6ImFndWEifSx7Im5hbWUiOiJhY2VpdGUgeSBzYWwifV0sInN0ZXBzIjpbIiogcmVob2dhIGNlYm9sbGEsIHBpbWllbnRvIHkgYWpvcyBzaW4gcXVlIHNlIHF1ZW1lbjsgYcOxYWRlIHRvbWF0ZSB5IGNvY2luYSAzIG1pbi4iLCJJbmNvcnBvcmEgbGVudGVqYXMsIHphbmFob3JpYSwgbGF1cmVsLCBqYW3Ds24sIGNob3Jpem8gb3BjaW9uYWwgeSBjYWxkby9hZ3VhIGhhc3RhIGN1YnJpcmxhcyB1bm9zIGRvcyBkZWRvcy4iLCJDdWVjZSBoYXN0YSB0aWVybmFzIHkgYWp1c3RhIGRlIHNhbCBhbCBmaW5hbC4iXSwiZmF2b3JpdGUiOnRydWV9LHsia2V5IjoiZmFtaWx5LXYxLTAxMCIsInRpdGxlIjoiUG90YWplIGRlIGdhcmJhbnpvcyBjb24gYmFjYWxhbyIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0NSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiI0MDAgZyBkZSBnYXJiYW56b3MgY29jaWRvcyJ9LHsibmFtZSI6IjE4MCBnIGRlIGJhY2FsYW8gZGVzYWxhZG8ifSx7Im5hbWUiOiIxNTAgZyBkZSBlc3BpbmFjYXMifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6IjEvMiBwaW1pZW50byB2ZXJkZSJ9LHsibmFtZSI6IjIgZGllbnRlcyBkZSBham8ifSx7Im5hbWUiOiIxIGhvamEgZGUgbGF1cmVsIn0seyJuYW1lIjoiMS8yIGN1Y2hhcmFkaXRhIGRlIHBpbWVudMOzbiBkdWxjZSJ9LHsibmFtZSI6InVuYSBwaXpjYSBkZSBjb21pbm8geSBudWV6IG1vc2NhZGEifSx7Im5hbWUiOiI0NTAgbWwgZGUgYWd1YSBvIGNhbGRvIn0seyJuYW1lIjoiMjUgZyBkZSBwYW4gcmFsbGFkbyBvcGNpb25hbCJ9LHsibmFtZSI6ImFjZWl0ZSB5IHNhbCJ9XSwic3RlcHMiOlsiKiBlc2NhbGRhIGxhcyBlc3BpbmFjYXMgeSBlc2PDunJyZWxhcy4iLCJTb2Zyw61lIGNlYm9sbGEsIHBpbWllbnRvLCBham8geSBsYXVyZWw7IGHDsWFkZSBwaW1lbnTDs24gZHVsY2UsIGNvbWlubyB5IG51ZXogbW9zY2FkYSBmdWVyYSBkZWwgZnVlZ28uIiwiSW5jb3Jwb3JhIGdhcmJhbnpvcywgZXNwaW5hY2FzIHkgY2FsZG87IGN1ZWNlIDE1IG1pbi4iLCJBw7FhZGUgYmFjYWxhbyBlbiB0cm96b3MgbG9zIMO6bHRpbW9zIDTigJM1IG1pbjsgZXNwZXNhIGNvbiBwYW4gcmFsbGFkbyBzb2xvIHNpIHNlIGRlc2VhLiJdLCJmYXZvcml0ZSI6dHJ1ZX0seyJrZXkiOiJmYW1pbHktdjEtMDExIiwidGl0bGUiOiJNaWdhcyBjb24gY2hvcml6byB5IGJlaWNvbiIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0NSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIyNTAgZyBkZSBwYW4gZGVsIGTDrWEgYW50ZXJpb3IsIG1pZ2FkbyJ9LHsibmFtZSI6IjkwIG1sIGRlIGFndWEifSx7Im5hbWUiOiIzIGRpZW50ZXMgZGUgYWpvIGVudGVyb3MifSx7Im5hbWUiOiIxLzIgcGltaWVudG8gdmVyZGUifSx7Im5hbWUiOiI2MCBnIGRlIGNob3Jpem8gZHVsY2UifSx7Im5hbWUiOiI1MCBnIGRlIGJlaWNvbiJ9LHsibmFtZSI6IjMwIG1sIGRlIGFjZWl0ZSBkZSBvbGl2YSJ9LHsibmFtZSI6IjEvMiBjdWNoYXJhZGl0YSBkZSBwaW1lbnTDs24gZHVsY2UifSx7Im5hbWUiOiJzYWwifV0sInN0ZXBzIjpbIiogaHVtZWRlY2UgZWwgcGFuIGNvbiBlbCBhZ3VhIHkgZMOpamFsbyB0YXBhZG8gMTUgbWluLiIsIkZyw61lIGFqb3MgeSBwaW1pZW50byBlbiBhY2VpdGU7IGHDsWFkZSBjaG9yaXpvIHkgYmVpY29uLCBkw7NyYWxvcyB5IHJlc8OpcnZhbG9zLiIsIkHDsWFkZSB1biBwb2NvIGRlIGFndWEsIHBpbWVudMOzbiBkdWxjZSB5IHNhbCBhIGxhIHNhcnTDqW47IGluY29ycG9yYSBlbCBwYW4gcG9jbyBhIHBvY28geSByZW11ZXZlIGEgZnVlZ28gbWVkaW8gaGFzdGEgcXVlIHF1ZWRlIHN1ZWx0by4iLCJEZXZ1ZWx2ZSBjYXJuZSwgYWpvIHkgcGltaWVudG8gYW50ZXMgZGUgc2VydmlyLiJdLCJmYXZvcml0ZSI6dHJ1ZX0seyJrZXkiOiJmYW1pbHktdjEtMDEyIiwidGl0bGUiOiJQYXRhdGFzIHJlbGxlbmFzIGRlIGNhcm5lIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQ1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IjIgcGF0YXRhcyBncmFuZGVzICg1NTAgZykifSx7Im5hbWUiOiIyNTAgZyBkZSBjYXJuZSBwaWNhZGEifSx7Im5hbWUiOiI0MCBnIGRlIGJlaWNvbiJ9LHsibmFtZSI6IjE1IG1sIGRlIGFjZWl0ZSJ9LHsibmFtZSI6IjIwIGcgZGUgaGFyaW5hIn0seyJuYW1lIjoiMTgwIG1sIGRlIGxlY2hlIn0seyJuYW1lIjoiNjAgZyBkZSB0b21hdGUgZnJpdG8ifSx7Im5hbWUiOiI3MCBnIGRlIHF1ZXNvIHBhcmEgZnVuZGlyIn0seyJuYW1lIjoic2FsIHkgcGltaWVudGEgbmVncmEifV0sInN0ZXBzIjpbIiogY3VlY2UgbGFzIHBhdGF0YXMgZW4gbWljcm9vbmRhcyBwaW5jaGFkYXMgaGFzdGEgdGllcm5hcywgw6FicmVsYXMgeSByZXRpcmEgcGFydGUgZGUgbGEgcHVscGEuIiwiRG9yYSBjYXJuZSB5IGJlaWNvbjsgYcOxYWRlIGhhcmluYSB5IGxlY2hlIHBvY28gYSBwb2NvIGhhc3RhIG9idGVuZXIgdW5hIGJlY2hhbWVsIGVzcGVzYS4iLCJJbmNvcnBvcmEgcHVscGEgZGUgcGF0YXRhLCB0b21hdGUgeSBsYSBtaXRhZCBkZWwgcXVlc28uIiwiUmVsbGVuYSBsYXMgcGllbGVzLCBjdWJyZSBjb24gZWwgcmVzdG8gZGUgcXVlc28geSBncmF0aW5hIDjigJMxMCBtaW4uIl0sImZhdm9yaXRlIjp0cnVlfSx7ImtleSI6ImZhbWlseS12MS0wMTMiLCJ0aXRsZSI6IlBlY2h1Z2FzIGNvbiBuYXRhLCBjaGFtcGnDscOzbiB5IGJlaWNvbiIsImRpc2hfdHlwZSI6Im1haW4iLCJ0b3RhbF9taW51dGVzIjo0NSwiaW5ncmVkaWVudHMiOlt7Im5hbWUiOiIzMjAgZyBkZSBwZWNodWdhIGRlIHBvbGxvIGVuIGZpbGV0ZXMifSx7Im5hbWUiOiIxLzIgY2Vib2xsYSJ9LHsibmFtZSI6IjE1MCBnIGRlIGNoYW1wacOxb25lcyJ9LHsibmFtZSI6IjUwIGcgZGUgYmVpY29uIn0seyJuYW1lIjoiNzUgbWwgZGUgdmlubyBibGFuY28ifSx7Im5hbWUiOiIxNTAgbWwgZGUgbmF0YSBwYXJhIGNvY2luYXIgbyBsZWNoZSBldmFwb3JhZGEifSx7Im5hbWUiOiIxNSBtbCBkZSBhY2VpdGUifSx7Im5hbWUiOiJzYWwgeSBwaW1pZW50YSBuZWdyYSJ9XSwic3RlcHMiOlsiKiBzZWxsYSBsYXMgcGVjaHVnYXMgeSByZXPDqXJ2YWxhcy4iLCJTb2Zyw61lIGNlYm9sbGEgZW4ganVsaWFuYSwgYmVpY29uIHkgY2hhbXBpw7FvbmVzOyBhw7FhZGUgdmlubyB5IGRlamEgZXZhcG9yYXIuIiwiSW5jb3Jwb3JhIG5hdGEgbyBsZWNoZSBldmFwb3JhZGEsIGRldnVlbHZlIGVsIHBvbGxvIHkgY29jaW5hIGEgZnVlZ28gc3VhdmUgNuKAkzggbWluIGhhc3RhIHF1ZSBlc3TDqSBoZWNoby4iLCJBanVzdGEgZGUgc2FsIHkgcGltaWVudGEuIl0sImZhdm9yaXRlIjp0cnVlfSx7ImtleSI6ImZhbWlseS12MS0wMTQiLCJ0aXRsZSI6Ikh1ZXZvcyBhbCBwbGF0byBjb24gY2hhbXBpw7FvbmVzIHkgZ3Vpc2FudGVzIiwiZGlzaF90eXBlIjoibWFpbiIsInRvdGFsX21pbnV0ZXMiOjQ1LCJpbmdyZWRpZW50cyI6W3sibmFtZSI6IjQgaHVldm9zIn0seyJuYW1lIjoiMSBjZWJvbGxhIHBlcXVlw7FhIn0seyJuYW1lIjoiMTUwIGcgZGUgY2hhbXBpw7FvbmVzIGxhbWluYWRvcyJ9LHsibmFtZSI6IjE1MCBnIGRlIGd1aXNhbnRlcyJ9LHsibmFtZSI6IjE1MCBnIGRlIHRvbWF0ZSBmcml0byJ9LHsibmFtZSI6IjYwIG1sIGRlIHZpbm8gYmxhbmNvIn0seyJuYW1lIjoiMTUgbWwgZGUgYWNlaXRlIn0seyJuYW1lIjoic2FsIn1dLCJzdGVwcyI6WyIqIHNvZnLDrWUgY2Vib2xsYSBwaWNhZGEgeSBjaGFtcGnDsW9uZXMgY29uIHNhbCBoYXN0YSBxdWUgcmVkdXpjYW4uIiwiQcOxYWRlIGd1aXNhbnRlcywgcmVob2dhIHVuIG1pbnV0byB5IHZpZXJ0ZSB2aW5vOyBkZWphIGV2YXBvcmFyLiIsIk1lemNsYSB0b21hdGUgZnJpdG8sIHJlcGFydGUgZW4gZG9zIGNhenVlbGFzIG8gdW5hIGZ1ZW50ZSwgY2FzY2EgbG9zIGh1ZXZvcyBlbmNpbWEgeSBob3JuZWEgYSAxOTAgwrBDIDjigJMxMiBtaW4sIGhhc3RhIGN1YWphciBsYXMgY2xhcmFzLiJdLCJmYXZvcml0ZSI6dHJ1ZX1d', 'base64'), 'UTF8')::jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = 'insufficient_privilege';
  end if;
  select household_id into household_id_value
  from public.household_members
  where user_id = actor_id and status = 'active'
  limit 1;
  if household_id_value is null then
    raise exception 'Active household membership is required' using errcode = 'insufficient_privilege';
  end if;

  request_hash_value := private.pantry_request_hash(
    'recipes_load_seed', jsonb_build_object('seed_version', 2)
  );
  replay := private.pantry_claim(
    household_id_value, actor_id, 'recipes_load_seed', idempotency_key, request_hash_value
  );
  if replay is not null then return replay; end if;

  for item in select value from jsonb_array_elements(catalog) loop
    if private.recipes_seed_one(
      household_id_value, actor_id, item->>'key', 2, item->>'title',
      item->>'dish_type', (item->>'total_minutes')::integer, 2,
      item->'ingredients', item->'steps'
    ) then
      loaded := loaded + 1;
    end if;

    if coalesce((item->>'favorite')::boolean, false) then
      select id into recipe_id_value
      from public.recipes
      where household_id = household_id_value and seed_key = item->>'key';

      insert into public.recipe_preferences (
        recipe_id, household_id, user_id, is_favorite, rating, updated_at
      )
      select recipe_id_value, household_id_value, member.user_id, true, null, now()
      from public.household_members member
      where member.household_id = household_id_value and member.status = 'active'
      on conflict (recipe_id, user_id) do update
      set is_favorite = true, updated_at = excluded.updated_at;
    end if;
  end loop;

  result := jsonb_build_object('loaded', loaded, 'seed_version', 2);
  perform private.pantry_store_result(
    household_id_value, actor_id, 'recipes_load_seed', idempotency_key, result
  );
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reset_pilot_household(confirmation text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  household_id_value uuid;
  member_ids uuid[];
begin
  if actor_id is null then
    raise exception 'Authentication is required'
      using errcode = 'insufficient_privilege';
  end if;

  if confirmation <> 'BORRAR' then
    raise exception 'Confirmation is required'
      using errcode = 'invalid_parameter_value';
  end if;

  select member.household_id
  into household_id_value
  from public.household_members as member
  where member.user_id = actor_id
    and member.status = 'active'
    and member.role = 'owner'
  limit 1
  for update;

  if household_id_value is null then
    raise exception 'Only the household owner can reset the pilot'
      using errcode = 'insufficient_privilege';
  end if;

  -- Bloquea altas/bajas concurrentes de integrantes mientras se construye la
  -- lista de cuentas que se eliminarán.
  perform 1
  from public.households
  where id = household_id_value
  for update;

  select array_agg(member.user_id order by member.user_id)
  into member_ids
  from public.household_members as member
  where member.household_id = household_id_value
    and member.status = 'active';

  -- El único trigger que impide borrar en cascada protege el historial de
  -- despensa. Se habilita únicamente dentro de esta transacción privilegiada.
  perform set_config('midespensa.allow_pilot_reset', 'on', true);
  delete from public.pantry_movements
  where household_id = household_id_value;

  delete from public.households
  where id = household_id_value;

  return coalesce(member_ids, '{}'::uuid[]);
end;
$function$;

CREATE OR REPLACE FUNCTION public.shopping_add_item(food_name text, item_source text, idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid(); household_id_value uuid; food_id_value uuid; list_id_value uuid;
  item_row public.shopping_items; request_hash_value text; replay jsonb; result jsonb;
begin
  if actor_id is null then raise exception 'Authentication is required' using errcode = 'insufficient_privilege'; end if;
  if food_name is null or char_length(trim(food_name)) not between 1 and 120 or item_source not in ('manual', 'pantry') then
    raise exception 'Invalid shopping item' using errcode = 'invalid_parameter_value';
  end if;
  select household_id into household_id_value from public.household_members where user_id = actor_id and status = 'active'
  limit 1;
  if household_id_value is null then raise exception 'Active household membership is required' using errcode = 'insufficient_privilege'; end if;
  request_hash_value := private.pantry_request_hash('shopping_add_item', jsonb_build_object('food_name', lower(trim(food_name)), 'source', item_source));
  replay := private.pantry_claim(household_id_value, actor_id, 'shopping_add_item', idempotency_key, request_hash_value);
  if replay is not null then return replay; end if;
  food_id_value := private.resolve_household_food(household_id_value, food_name);
  insert into public.shopping_lists (household_id, status) values (household_id_value, 'active')
  on conflict (household_id, status) do update set updated_at = now() returning id into list_id_value;
  insert into public.shopping_items (household_id, shopping_list_id, food_id, source)
  values (household_id_value, list_id_value, food_id_value, item_source)
  on conflict (shopping_list_id, food_id) do update set is_purchased = false, source = excluded.source, version = public.shopping_items.version + 1, updated_at = now()
  returning * into item_row;
  result := jsonb_build_object('item_id', item_row.id, 'version', item_row.version, 'is_purchased', item_row.is_purchased);
  perform private.pantry_store_result(household_id_value, actor_id, 'shopping_add_item', idempotency_key, result);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.shopping_add_plan_items(items jsonb, idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  from public.household_members where user_id = actor_id and status = 'active'
  limit 1;
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
$function$;

CREATE OR REPLACE FUNCTION public.shopping_add_ticket_items(items jsonb, idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  from public.household_members where user_id = actor_id and status = 'active'
  limit 1;
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
$function$;
