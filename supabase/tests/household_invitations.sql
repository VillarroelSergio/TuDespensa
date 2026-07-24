-- Seguridad e integridad de las invitaciones de hogar por correo.
-- Solo identidades y correos sintéticos reservados por example.invalid.

begin;

do $$
begin
  if to_regclass('public.household_invitations') is null then
    raise exception 'household_invitations schema is not installed';
  end if;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'owner-a@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'guest-b@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'outsider-c@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- A crea su hogar e invita a B por correo.
set local "request.jwt.claim.sub" = '22000000-0000-0000-0000-000000000001';
set local role authenticated;

select public.create_household_with_onboarding(
  'Hogar de A', '[]'::jsonb, 'create-household-inv-1'
);

do $$
declare
  result jsonb;
begin
  result := public.invite_household_member('Guest-B@Example.Invalid');
  if (result ->> 'email') <> 'guest-b@example.invalid' then
    raise exception 'Invite did not normalize the email';
  end if;
  if (select count(*) from public.household_invitations where status = 'pending') <> 1 then
    raise exception 'Pending invitation was not created';
  end if;

  -- Reenviar reutiliza la misma fila pendiente (índice único parcial).
  perform public.invite_household_member('guest-b@example.invalid');
  if (select count(*) from public.household_invitations where status = 'pending') <> 1 then
    raise exception 'Resend created a duplicate pending invitation';
  end if;

  -- No se puede invitar al propio correo.
  begin
    perform public.invite_household_member('owner-a@example.invalid');
    raise exception 'Owner was allowed to invite themselves';
  exception when sqlstate '22023' then null;
  end;
end;
$$;
reset role;

-- El id real de la invitación se guarda como propietario (RLS lo oculta a otros);
-- la app lo entrega al invitado vía get_my_pending_invitation.
create temp table t_inv as
  select id from public.household_invitations where status = 'pending';

-- Un tercero (C) no ve la invitación por RLS y, aun con el id, no puede aceptarla
-- porque su correo no coincide.
set local "request.jwt.claim.sub" = '22000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$
begin
  if public.get_my_pending_invitation() is not null then
    raise exception 'Outsider sees a pending invitation not addressed to them';
  end if;
  begin
    perform public.accept_household_invitation((select id from t_inv));
    raise exception 'Outsider accepted an invitation addressed to someone else';
  exception when sqlstate '42501' then null;
  end;
end;
$$;
reset role;

-- B ya tiene su propio hogar; al aceptar la invitación cambia de hogar.
set local "request.jwt.claim.sub" = '22000000-0000-0000-0000-000000000002';
set local role authenticated;
select public.create_household_with_onboarding(
  'Hogar propio de B', '[]'::jsonb, 'create-household-inv-2'
);
do $$
declare
  pending jsonb;
  invitation_id uuid;
  target_household uuid;
begin
  pending := public.get_my_pending_invitation();
  if pending is null then
    raise exception 'Invited guest cannot see their pending invitation';
  end if;
  invitation_id := (pending ->> 'invitation_id')::uuid;
  target_household := (pending ->> 'household_id')::uuid;

  perform public.accept_household_invitation(invitation_id);

  if not exists (
    select 1 from public.household_members
    where user_id = '22000000-0000-0000-0000-000000000002'
      and household_id = target_household and status = 'active'
  ) then
    raise exception 'Guest did not become an active member of the inviting household';
  end if;

  if (select count(*) from public.household_members
      where user_id = '22000000-0000-0000-0000-000000000002' and status = 'active') <> 1 then
    raise exception 'Guest kept more than one active household after switching';
  end if;

  if (select status from public.household_invitations where id = invitation_id) <> 'accepted' then
    raise exception 'Invitation was not marked accepted';
  end if;
end;
$$;
reset role;

-- El hogar de A queda lleno (A + B): una nueva invitación se rechaza.
set local "request.jwt.claim.sub" = '22000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$
begin
  begin
    perform public.invite_household_member('outsider-c@example.invalid');
    raise exception 'Invite accepted for a full household';
  exception when check_violation then null;
  end;
end;
$$;
reset role;

rollback;
