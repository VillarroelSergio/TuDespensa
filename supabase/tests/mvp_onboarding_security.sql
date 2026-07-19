-- Integración SQL del vertical slice de onboarding.
-- Solo usa identidades y correos sintéticos reservados por example.invalid.

begin;

do $$
begin
  if to_regclass('public.households') is null
     or to_regclass('public.household_members') is null
     or to_regclass('public.pantry_items') is null
     or to_regclass('public.onboarding_progress') is null then
    raise exception 'MVP onboarding schema is not installed';
  end if;
end;
$$;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '21000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'member-a@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '21000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'member-b@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '21000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'outsider@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

set local "request.jwt.claim.sub" = '21000000-0000-0000-0000-000000000001';
set local role authenticated;

select public.create_household_with_onboarding(
  'Synthetic household',
  '["Synthetic child"]'::jsonb,
  'create-household-0001'
);

select public.onboarding_add_pantry_item(
  'fridge',
  'Synthetic tomatoes',
  'add-pantry-item-0001'
);

do $$
declare
  duplicate_result jsonb;
begin
  duplicate_result := public.onboarding_add_pantry_item(
    'fridge',
    'synthetic tomatoes',
    'add-pantry-item-0002'
  );

  if coalesce((duplicate_result ->> 'duplicate')::boolean, false) is not true
     or (select count(*) from public.pantry_movements) <> 1 then
    raise exception 'Duplicate pantry item was not handled idempotently';
  end if;
end;
$$;

reset role;

insert into public.household_members (household_id, user_id, role, status)
select id, '21000000-0000-0000-0000-000000000002', 'member', 'active'
from public.households;

-- Las dos identidades autorizadas ven el mismo hogar y la misma despensa.
set local "request.jwt.claim.sub" = '21000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$
begin
  if (select count(*) from public.households) <> 1
     or (select count(*) from public.pantry_items where presence) <> 1 then
    raise exception 'First member cannot read the shared household';
  end if;
end;
$$;
reset role;

set local "request.jwt.claim.sub" = '21000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
begin
  if (select count(*) from public.households) <> 1
     or (select count(*) from public.pantry_items where presence) <> 1 then
    raise exception 'Second member cannot read the shared household';
  end if;
end;
$$;
reset role;

-- Una identidad ajena no lee ninguna fila privada.
set local "request.jwt.claim.sub" = '21000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$
begin
  if (select count(*) from public.households) <> 0
     or (select count(*) from public.pantry_items) <> 0
     or (select count(*) from public.onboarding_progress) <> 0 then
    raise exception 'Outsider can read private onboarding data';
  end if;
end;
$$;
reset role;

-- Una tercera membresía activa se rechaza sin modificar el hogar.
do $$
begin
  begin
    insert into public.household_members (household_id, user_id, role, status)
    select id, '21000000-0000-0000-0000-000000000003', 'member', 'active'
    from public.households;
    raise exception 'Third active member was accepted';
  exception
    when check_violation then null;
  end;

  if (select count(*) from public.household_members where status = 'active') <> 2 then
    raise exception 'Household member limit was not preserved';
  end if;
end;
$$;

-- La primera retirada gana; una segunda con versión antigua recibe conflicto.
set local "request.jwt.claim.sub" = '21000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.onboarding_remove_pantry_item(
  (select id from public.pantry_items limit 1),
  1
);
reset role;

set local "request.jwt.claim.sub" = '21000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
begin
  begin
    perform public.onboarding_remove_pantry_item(
      (select id from public.pantry_items limit 1),
      1
    );
    raise exception 'Stale pantry mutation was accepted';
  exception
    when serialization_failure then null;
  end;
end;
$$;
reset role;

do $$
begin
  if (select presence from public.pantry_items limit 1) is not false
     or (select version from public.pantry_items limit 1) <> 2
     or (select count(*) from public.pantry_movements) <> 2 then
    raise exception 'Optimistic concurrency did not preserve the confirmed removal';
  end if;
end;
$$;

-- Las tres zonas vacías se revisan mediante transiciones válidas.
set local "request.jwt.claim.sub" = '21000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.onboarding_set_zone_state(zone, 'in_progress')
from unnest(array['fridge', 'freezer', 'pantry']) as zone;
select public.onboarding_set_zone_state(zone, 'reviewed_empty')
from unnest(array['fridge', 'freezer', 'pantry']) as zone;

do $$
declare
  first_result jsonb;
  replay_result jsonb;
  first_confirmed_at timestamptz;
begin
  first_result := public.confirm_baseline('confirm-baseline-0001');
  select baseline_confirmed_at into first_confirmed_at from public.households;
  replay_result := public.confirm_baseline('confirm-baseline-0001');

  if first_result <> replay_result
     or (select baseline_confirmed_at from public.households) <> first_confirmed_at
     or (
       select count(*)
       from public.idempotency_keys
       where operation = 'confirm_baseline'
     ) <> 1
     or (select global_state from public.onboarding_progress) <> 'completed' then
    raise exception 'Baseline confirmation replay changed state more than once';
  end if;
end;
$$;
reset role;

-- La despensa compartida publica cambios por Realtime.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pantry_items'
  ) then
    raise exception 'pantry_items is not published to Realtime';
  end if;
end;
$$;

rollback;
