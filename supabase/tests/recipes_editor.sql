-- Integración SQL de Fase 4B. Ejecutar después de las migraciones; nunca persiste datos.
begin;

do $$
begin
  if to_regclass('public.recipes') is null then raise exception 'Recipes schema is not installed'; end if;
end;
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '42000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'editor-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '42000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'editor-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local "request.jwt.claim.sub" = '42000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.create_household_with_onboarding('Editor household', '[]'::jsonb, 'editor-household-0001');

do $$
declare recipe_id_value uuid; save_result jsonb; replay_result jsonb;
begin
  recipe_id_value := (public.recipes_create_recipe('Gazpacho', null, null, null, 'editor-create-0001'))->>'recipe_id';

  -- Guardado estructurado: sube la versión, escribe ingredientes y pasos y es idempotente.
  save_result := public.recipes_save_recipe(recipe_id_value, 'Gazpacho andaluz', 'starter', 10, 4, null,
    '[{"name":"Tomate","quantity":1,"unit_code":"kg"},{"name":"Pan","quantity":100,"unit_code":"g"}]'::jsonb,
    '["Trocear","Triturar y enfriar"]'::jsonb, 1, 'editor-save-0001');
  replay_result := public.recipes_save_recipe(recipe_id_value, 'Gazpacho andaluz', 'starter', 10, 4, null,
    '[{"name":"Tomate","quantity":1,"unit_code":"kg"},{"name":"Pan","quantity":100,"unit_code":"g"}]'::jsonb,
    '["Trocear","Triturar y enfriar"]'::jsonb, 1, 'editor-save-0001');
  if save_result <> replay_result then raise exception 'Save was not idempotent'; end if;
  if (save_result->>'version')::int <> 2 then raise exception 'Save did not bump version'; end if;
  if (select count(*) from public.recipe_ingredients where recipe_id = recipe_id_value) <> 2
     or (select count(*) from public.recipe_steps where recipe_id = recipe_id_value) <> 2 then
    raise exception 'Ingredients/steps were not stored';
  end if;

  -- Reemplazo: una segunda edición sustituye las colecciones sin dejar huérfanos.
  perform public.recipes_save_recipe(recipe_id_value, 'Gazpacho andaluz', 'starter', 10, 4, null,
    '[{"name":"Tomate","quantity":1,"unit_code":"kg"}]'::jsonb, '["Trocear"]'::jsonb, 2, 'editor-save-0002');
  if (select count(*) from public.recipe_ingredients where recipe_id = recipe_id_value) <> 1 then
    raise exception 'Collection replacement left orphan rows';
  end if;

  -- Versión obsoleta: conflicto (serialization_failure).
  begin
    perform public.recipes_save_recipe(recipe_id_value, 'Gazpacho', null, null, null, null, '[]'::jsonb, '[]'::jsonb, 1, 'editor-save-0003');
    raise exception 'Stale version was accepted';
  exception when serialization_failure then null;
  end;

  -- Unidad desconocida: rechazada.
  begin
    perform public.recipes_save_recipe(recipe_id_value, 'Gazpacho', null, null, null, null,
      '[{"name":"Tomate","quantity":1,"unit_code":"taza"}]'::jsonb, '[]'::jsonb, 3, 'editor-save-0004');
    raise exception 'Unknown unit was accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Captura de enlace: crea una receta pending para revisión.
  if (public.recipes_capture_link('https://example.com/receta', 'editor-link-0001'))->>'recipe_id' is null then
    raise exception 'Link capture did not return a recipe';
  end if;
  if (select count(*) from public.recipes where status = 'pending' and source_url = 'https://example.com/receta') <> 1 then
    raise exception 'Captured link is not a pending recipe';
  end if;
end;
$$;
reset role;

-- Un hogar ajeno no puede guardar sobre recetas que no ve.
set local "request.jwt.claim.sub" = '42000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
declare target_id uuid;
begin
  select id into target_id from public.recipes where title = 'Gazpacho andaluz' limit 1;
  begin
    perform public.recipes_save_recipe(target_id, 'Robo', null, null, null, null, '[]'::jsonb, '[]'::jsonb, 3, 'outsider-save-0001');
    raise exception 'Outsider saved another household recipe';
  exception when serialization_failure then null;
  end;
end;
$$;
reset role;

rollback;
