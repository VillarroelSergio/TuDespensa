-- Integración SQL de Fase 4C. Ejecutar después de las migraciones; nunca persiste datos.
begin;

do $$
begin
  if to_regclass('public.recipe_preferences') is null or to_regclass('public.recipe_categories') is null then
    raise exception 'Preferences schema is not installed';
  end if;
end;
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '43000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pref-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '43000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pref-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local "request.jwt.claim.sub" = '43000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.create_household_with_onboarding('Pref household', '[]'::jsonb, 'pref-household-0001');

do $$
declare recipe_id_value uuid; pref_result jsonb; replay_result jsonb; seed_result jsonb;
begin
  recipe_id_value := (public.recipes_create_recipe('Ensalada', null, null, null, 'pref-create-0001'))->>'recipe_id';

  -- Preferencia: upsert idempotente, favorito + puntuación.
  pref_result := public.recipes_set_preference(recipe_id_value, true, 4, 'pref-set-0001');
  replay_result := public.recipes_set_preference(recipe_id_value, true, 4, 'pref-set-0001');
  if pref_result <> replay_result then raise exception 'Preference was not idempotent'; end if;
  if (select count(*) from public.recipe_preferences where recipe_id = recipe_id_value and is_favorite and rating = 4) <> 1 then
    raise exception 'Preference was not stored';
  end if;
  -- Actualiza la misma fila (sin duplicar).
  perform public.recipes_set_preference(recipe_id_value, false, null, 'pref-set-0002');
  if (select count(*) from public.recipe_preferences where recipe_id = recipe_id_value) <> 1
     or (select rating from public.recipe_preferences where recipe_id = recipe_id_value) is not null then
    raise exception 'Preference update did not replace the row';
  end if;
  -- Puntuación fuera de rango: rechazada.
  begin
    perform public.recipes_set_preference(recipe_id_value, false, 9, 'pref-set-0003');
    raise exception 'Out-of-range rating accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Categorías: crea y asigna; reemplazo sustituye el conjunto.
  perform public.recipes_set_categories(recipe_id_value, '[{"dimension":"dish_type","name":"Ensaladas"},{"dimension":"mediterranean","name":"Mediterránea"}]'::jsonb, 'cat-set-0001');
  if (select count(*) from public.recipe_category_assignments where recipe_id = recipe_id_value) <> 2 then
    raise exception 'Categories were not assigned';
  end if;
  perform public.recipes_set_categories(recipe_id_value, '[{"dimension":"dish_type","name":"Ensaladas"}]'::jsonb, 'cat-set-0002');
  if (select count(*) from public.recipe_category_assignments where recipe_id = recipe_id_value) <> 1 then
    raise exception 'Category replacement left extra assignments';
  end if;
  -- Dimensión inválida: rechazada.
  begin
    perform public.recipes_set_categories(recipe_id_value, '[{"dimension":"color","name":"Rojo"}]'::jsonb, 'cat-set-0003');
    raise exception 'Invalid category dimension accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Dataset inicial aprobado: 150 recetas base y 14 recetas familiares.
  -- Además de comprobar la idempotencia, validamos la categoría automática:
  -- una categoría nula abortaría toda la carga del catálogo.
  seed_result := public.recipes_load_seed('seed-load-0001');
  if (seed_result->>'loaded')::int <> 164 then raise exception 'Seed did not load the expected recipes'; end if;
  if (select count(*) from public.recipes where origin = 'seed') <> 164 then raise exception 'Seed recipes are not present'; end if;
  if (
    select count(*)
    from public.recipe_category_assignments assignments
    join public.recipes recipes on recipes.id = assignments.recipe_id
    where recipes.origin = 'seed'
  ) <> 164 then
    raise exception 'Seed recipes are missing their Mediterranean category';
  end if;
  -- Editar una receta base y recargar: no se sobrescribe.
  update public.recipes set title = 'Gazpacho de la casa', version = version + 1 where seed_key = 'base-v2-001';
  if (public.recipes_load_seed('seed-load-0002'))->>'loaded' <> '0' then raise exception 'Reload duplicated seed recipes'; end if;
  if (select title from public.recipes where seed_key = 'base-v2-001') <> 'Gazpacho de la casa' then
    raise exception 'Seed reload overwrote a household edit';
  end if;
end;
$$;
reset role;

-- Un hogar ajeno no puede puntuar recetas que no ve.
set local "request.jwt.claim.sub" = '43000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
declare target_id uuid;
begin
  select id into target_id from public.recipes where title = 'Ensalada' limit 1;
  begin
    perform public.recipes_set_preference(coalesce(target_id, gen_random_uuid()), true, 5, 'outsider-pref-0001');
    raise exception 'Outsider set a preference on another household recipe';
  exception when serialization_failure then null;
  end;
end;
$$;
reset role;

rollback;
