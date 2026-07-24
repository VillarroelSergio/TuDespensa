-- Integración SQL de Fase 4A. Ejecutar después de las migraciones; nunca persiste datos.
begin;

do $$
begin
  if to_regclass('public.recipes') is null
     or to_regclass('public.recipe_ingredients') is null
     or to_regclass('public.recipe_steps') is null then
    raise exception 'Recipes schema is not installed';
  end if;
end;
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '41000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'recipes-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '41000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'recipes-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '41000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'recipes-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local "request.jwt.claim.sub" = '41000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.create_household_with_onboarding('Recipes household', '[]'::jsonb, 'recipes-household-0001');
reset role;

insert into public.household_members (household_id, user_id, role, status)
select id, '41000000-0000-0000-0000-000000000002', 'member', 'active' from public.households where name = 'Recipes household';

-- La creación es idempotente: el reintento devuelve el mismo resultado sin duplicar.
set local "request.jwt.claim.sub" = '41000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$
declare first_result jsonb; replay_result jsonb;
begin
  first_result := public.recipes_create_recipe('Tortilla de patatas', 'main', 30, 4, 'recipes-create-0001');
  replay_result := public.recipes_create_recipe('Tortilla de patatas', 'main', 30, 4, 'recipes-create-0001');
  if first_result <> replay_result
     or (select count(*) from public.recipes) <> 1 then
    raise exception 'Recipe creation was not idempotent';
  end if;
end;
$$;

-- Un tipo de plato desconocido se rechaza.
do $$
begin
  begin
    perform public.recipes_create_recipe('Receta inválida', 'snack', null, null, 'recipes-create-0002');
    raise exception 'Invalid dish type was accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
reset role;

-- El segundo miembro del hogar ve la receta compartida.
set local "request.jwt.claim.sub" = '41000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
begin
  if (select count(*) from public.recipes) <> 1 then
    raise exception 'Active member cannot read household recipes';
  end if;
end;
$$;
reset role;

-- Un tercer hogar no ve ni puede crear recetas ajenas.
set local "request.jwt.claim.sub" = '41000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$
begin
  if (select count(*) from public.recipes) <> 0 then
    raise exception 'Third household can read recipe data';
  end if;
  begin
    perform public.recipes_create_recipe('Receta ajena', null, null, null, 'recipes-outsider-0001');
    raise exception 'Third household created a recipe without an active household';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- La tabla de recetas se publica para las dos sesiones del hogar.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recipes') then
    raise exception 'Recipes realtime publication is missing';
  end if;
end;
$$;

rollback;
