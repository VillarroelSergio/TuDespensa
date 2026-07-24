-- Integración SQL de Fase 10. Ejecutar después de las migraciones; nunca persiste datos.
begin;

do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'shopping_add_ticket_items'
  ) then
    raise exception 'shopping_add_ticket_items is not installed';
  end if;
end;
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '56000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ticket-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '56000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ticket-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local "request.jwt.claim.sub" = '56000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.create_household_with_onboarding('Ticket household', '[]'::jsonb, 'ticket-household-0001');

do $$
declare
  first_result jsonb; replay_result jsonb;
  aceite public.shopping_items; tomate public.shopping_items;
begin
  -- Un producto manual pendiente que también aparece en el ticket.
  perform public.shopping_add_item('Aceite', 'manual', 'ticket-manual-0001');

  first_result := public.shopping_add_ticket_items(
    '[{"name":"Tomate","quantity":500,"unit_code":"g"},
      {"name":"Aceite","quantity":null,"unit_code":null},
      {"name":"Sal","quantity":null,"unit_code":null}]'::jsonb,
    'ticket-0001'
  );
  -- Aceite ya estaba: nuevos = Tomate + Sal = 2.
  if (first_result->>'added')::int <> 2 then
    raise exception 'Expected two new products, got %', first_result->>'added';
  end if;

  -- El ticket registra lo comprado: los productos nuevos entran ya marcados.
  select si.* into tomate from public.shopping_items si
    join public.household_foods hf on hf.id = si.food_id where lower(hf.name) = 'tomate';
  if not tomate.is_purchased or tomate.source <> 'ticket' then
    raise exception 'Ticket item was not marked purchased or lost its source';
  end if;

  -- El manual conserva su origen pero el ticket lo marca comprado.
  select si.* into aceite from public.shopping_items si
    join public.household_foods hf on hf.id = si.food_id where lower(hf.name) = 'aceite';
  if aceite.source <> 'manual' then
    raise exception 'Ticket overwrote a manual product source';
  end if;
  if not aceite.is_purchased then
    raise exception 'Ticket did not mark the existing manual product as purchased';
  end if;

  -- Idempotencia: repetir el mismo ticket no añade ni duplica.
  replay_result := public.shopping_add_ticket_items(
    '[{"name":"Tomate","quantity":500,"unit_code":"g"},
      {"name":"Aceite","quantity":null,"unit_code":null},
      {"name":"Sal","quantity":null,"unit_code":null}]'::jsonb,
    'ticket-0001'
  );
  if replay_result <> first_result then
    raise exception 'shopping_add_ticket_items was not idempotent';
  end if;
  if (select count(*) from public.shopping_items) <> 3 then
    raise exception 'Replay duplicated shopping items';
  end if;

  -- Reimportar el mismo tomate (clave distinta) acumula por unidades compatibles.
  perform public.shopping_add_ticket_items(
    '[{"name":"Tomate","quantity":300,"unit_code":"g"}]'::jsonb, 'ticket-0002'
  );
  select si.* into tomate from public.shopping_items si
    join public.household_foods hf on hf.id = si.food_id where lower(hf.name) = 'tomate';
  if tomate.quantity <> 800 or tomate.unit_code <> 'g' then
    raise exception 'Compatible quantities were not summed: % %', tomate.quantity, tomate.unit_code;
  end if;
end;
$$;
reset role;

-- Un hogar ajeno no ve ni toca la lista del otro.
set local "request.jwt.claim.sub" = '56000000-0000-0000-0000-000000000002';
set local role authenticated;
select public.create_household_with_onboarding('Outsider ticket', '[]'::jsonb, 'ticket-household-0002');
do $$
begin
  perform public.shopping_add_ticket_items(
    '[{"name":"Tomate","quantity":500,"unit_code":"g"}]'::jsonb, 'outsider-ticket-0001'
  );
  if (select count(*) from public.shopping_items si
      join public.household_foods hf on hf.id = si.food_id
      where lower(hf.name) = 'aceite') <> 0 then
    raise exception 'Outsider can read another household shopping list';
  end if;
end;
$$;
reset role;

rollback;
