-- Auditoría 2026-07-31. Cuatro correcciones independientes:
--
-- A-2) household_restore_backup podía sobrescribir filas de OTRO hogar. El
--      filtro `where household_id = backup_household_id` valida lo que el
--      fichero DICE de sí mismo, y ese fichero lo escribe quien restaura. Los
--      `on conflict (id) do update` no volvían a mirar de quién era la fila:
--      bastaba poner el id de una fila ajena para reescribirla. Se añade el
--      filtro de hogar a cada `do update` y se dejan de aceptar del fichero los
--      campos que quien restaura no debe controlar (version, confirmed_by,
--      user_id).
--
-- M-4) La búsqueda difusa de alimentos instalaba pg_trgm pero no creaba ningún
--      índice, y usaba la FUNCIÓN similarity() en vez del OPERADOR %, así que
--      ni con índice habría podido usarlo: recorría la tabla entera y calculaba
--      la similitud dos veces por fila, en cada alta de producto y por cada
--      línea de ticket.
--
-- M-6) idempotency_keys no se purgaba nunca: una fila permanente por cada
--      mutación de la aplicación, para siempre.
--
-- B-5) private.redeem_invitation_for buscaba por code_hash sin acotar a las
--      invitaciones pendientes. El índice único solo cubre las pendientes y una
--      invitación aceptada conserva su hash, así que podían coexistir dos filas
--      con el mismo y `select into` habría cogido una cualquiera sin avisar.

-- ---------------------------------------------------------------------------
-- M-4: índices de trigramas + consultas que sí pueden usarlos
-- ---------------------------------------------------------------------------

create index if not exists catalog_foods_canonical_name_trgm_idx
  on public.catalog_foods using gin (lower(canonical_name) extensions.gin_trgm_ops);

create index if not exists food_aliases_alias_trgm_idx
  on public.food_aliases using gin (lower(alias) extensions.gin_trgm_ops);

create index if not exists household_foods_name_trgm_idx
  on public.household_foods using gin (lower(name) extensions.gin_trgm_ops);

-- El operador % acota por índice con el umbral por defecto (0.3) y la
-- comprobación exacta de 0.6 se aplica encima, sobre un puñado de candidatos.
-- Se evita `set_limit()` a propósito: cambia el umbral de toda la sesión.
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
    and lower(name) operator(extensions.%) normalized
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

create or replace function private.resolve_catalog_food(food_name text)
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
  where lower(canonical_name) operator(extensions.%) normalized
    and extensions.similarity(lower(canonical_name), normalized) > 0.6
  order by extensions.similarity(lower(canonical_name), normalized) desc
  limit 1;
  if catalog_id is not null then return catalog_id; end if;

  select catalog_food_id into catalog_id from public.food_aliases
  where lower(alias) operator(extensions.%) normalized
    and extensions.similarity(lower(alias), normalized) > 0.6
  order by extensions.similarity(lower(alias), normalized) desc
  limit 1;
  return catalog_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- B-5: el canje solo puede casar con una invitación pendiente
-- ---------------------------------------------------------------------------

create or replace function private.redeem_invitation_for(target_user_id uuid, submitted_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.household_invitations;
  active_members integer;
begin
  if target_user_id is null
     or submitted_code_hash is null
     or submitted_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation redemption request'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Reintento idempotente: esta misma cuenta ya canjeó este código antes. Se
  -- resuelve ANTES de acotar a 'pending', que es justo lo que ya no es.
  select * into invitation_row
  from public.household_invitations as invitation
  where invitation.code_hash = submitted_code_hash
    and invitation.status = 'accepted'
    and invitation.accepted_by = target_user_id
  limit 1;
  if invitation_row.id is not null then
    return jsonb_build_object('household_id', invitation_row.household_id);
  end if;

  -- El índice único garantiza como mucho una pendiente por hash; `limit 1`
  -- deja de depender de esa garantía para no elegir una fila al azar en
  -- silencio si algún día se relaja (auditoría 2026-07-31).
  select * into invitation_row
  from public.household_invitations as invitation
  where invitation.code_hash = submitted_code_hash
    and invitation.status = 'pending'
  limit 1
  for update;

  -- Mismo mensaje para código inexistente, caducado, revocado o ya usado por
  -- otra persona: no debe filtrarse cuál de los casos es.
  if invitation_row.id is null or invitation_row.expires_at <= now() then
    raise exception 'Invitation code is invalid or has expired'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into active_members
  from public.household_members
  where household_id = invitation_row.household_id and status = 'active';

  if active_members >= 2 then
    raise exception 'This household is already full'
      using errcode = 'check_violation';
  end if;

  insert into public.household_members (household_id, user_id, role, status)
  values (invitation_row.household_id, target_user_id, 'member', 'active')
  on conflict (household_id, user_id)
  do update set status = 'active', updated_at = now();

  update public.household_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = target_user_id, updated_at = now()
  where id = invitation_row.id;

  return jsonb_build_object('household_id', invitation_row.household_id);
end;
$$;

revoke all on function private.redeem_invitation_for(uuid, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- M-6: purga de claves de idempotencia caducadas
-- ---------------------------------------------------------------------------

-- ponytail: purga oportunista dentro del propio claim, sin pg_cron ni tarea
-- externa. Techo conocido: el borrado viaja en la transacción de una mutación
-- del usuario. Se limita a 200 filas por paso para que ese coste sea constante
-- y no aparezca un pico si la tabla lleva meses sin limpiarse.
create or replace function private.pantry_claim(
  household_id_value uuid, actor_id uuid, operation_name text, idempotency_key text, request_hash_value text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare claimed boolean; stored_hash text; stored_result jsonb;
begin
  if idempotency_key is null or idempotency_key !~ '^[A-Za-z0-9._:-]{8,120}$' then
    raise exception 'Invalid idempotency key' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.idempotency_keys
  where ctid in (
    select ctid from public.idempotency_keys
    where created_at < now() - interval '7 days'
    limit 200
  );

  insert into public.idempotency_keys (household_id, actor, operation, key, request_hash, result)
  values (household_id_value, actor_id, operation_name, idempotency_key, request_hash_value, '{}'::jsonb)
  on conflict do nothing returning true into claimed;
  if coalesce(claimed, false) then return null; end if;
  select request_hash, result into stored_hash, stored_result from public.idempotency_keys
  where actor = actor_id and operation = operation_name and key = idempotency_key;
  if stored_hash <> request_hash_value then
    raise exception 'Idempotency key was reused with a different request' using errcode = 'invalid_parameter_value';
  end if;
  return stored_result;
end;
$$;

revoke all on function private.pantry_claim(uuid, uuid, text, text, text) from public;

-- ---------------------------------------------------------------------------
-- A-2: la restauración no puede tocar filas de otro hogar
-- ---------------------------------------------------------------------------

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
$$;

revoke all on function public.household_restore_backup(jsonb, text) from public, anon;
grant execute on function public.household_restore_backup(jsonb, text) to authenticated;
