-- Datos exclusivamente locales, deterministas y sintéticos.
-- `npm run dev:reset` aplica migraciones y vuelve a crear esta cuenta.
-- Nunca se ejecuta contra el proyecto remoto.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000101',
  'authenticated', 'authenticated', 'admin@midespensa.local',
  extensions.crypt('admin', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101',
  '{"sub":"00000000-0000-0000-0000-000000000101","email":"admin@midespensa.local"}'::jsonb,
  'email', 'admin@midespensa.local', now(), now(), now()
);

insert into public.profiles (user_id, display_name)
values ('00000000-0000-0000-0000-000000000101', 'Admin local');

insert into public.households (id, name, onboarding_status, baseline_confirmed_at, created_by)
values (
  '00000000-0000-0000-0000-000000000201', 'Casa de pruebas', 'completed', now(),
  '00000000-0000-0000-0000-000000000101'
);

insert into public.household_members (household_id, user_id, role, status)
values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101', 'owner', 'active'
);

insert into public.pantry_locations (id, household_id, kind) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 'fridge'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000201', 'freezer'),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000201', 'pantry');

insert into public.household_foods (id, household_id, name) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000201', 'Leche'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000201', 'Huevos'),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000201', 'Tomates'),
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000201', 'Arroz');

insert into public.pantry_items (
  id, household_id, location_id, food_id, tracking_mode, presence, quantity, unit_code,
  approximate_state, attention_state, confirmed_at, confirmed_by
) values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000401', 'measure', true, 1, 'l', null, 'none', now(), '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000402', 'units', true, 6, 'unit', null, 'none', now(), '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000403', 'approximate', true, null, null, 'some', 'none', now(), '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000404', 'approximate', true, null, null, 'low', 'low', now(), '00000000-0000-0000-0000-000000000101');
