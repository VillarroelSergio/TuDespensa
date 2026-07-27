-- El catálogo de alimentos (Fase 3) se pensó para adivinar la zona de compra y
-- solo cubre ~58 productos típicos. Al enganchar recetas↔despensa a este mismo
-- catálogo (ver suggestions.ts `matches`), faltaban alimentos muy comunes en
-- las fichas de receta (agua, vinagre, mozzarella, caldo...). Se amplía con lo
-- más frecuente; no pretende cubrir el 100% del catálogo de recetas de golpe.

insert into public.catalog_foods (canonical_name, category, default_zone, consume_soon_after) values
  ('Agua', 'dry', 'pantry', null),
  ('Vinagre', 'dry', 'pantry', null),
  ('Mozzarella', 'dairy', 'fridge', '7 days'),
  ('Caldo de pollo', 'dry', 'pantry', null),
  ('Caldo de verduras', 'dry', 'pantry', null),
  ('Cerveza', 'other', 'pantry', null),
  ('Boniato', 'produce', 'pantry', null),
  ('Limón', 'produce', 'fridge', '14 days'),
  ('Sandía', 'produce', 'fridge', '5 days'),
  ('Espinacas', 'produce', 'fridge', '5 days'),
  ('Maíz dulce', 'dry', 'pantry', null),
  ('Aguacate', 'produce', 'fridge', '5 days'),
  ('Pepino', 'produce', 'fridge', '7 days'),
  ('Pechuga de pavo', 'protein', 'fridge', '3 days'),
  ('Remolacha cocida', 'produce', 'fridge', '5 days'),
  ('Fuet', 'protein', 'fridge', '15 days')
on conflict (lower(canonical_name)) do nothing;

insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'agua mineral', 'botella de agua', 'agua con gas']) as alias
where cf.canonical_name = 'Agua';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'vinagre de vino', 'vinagre de manzana', 'vinagre balsámico']) as alias
where cf.canonical_name = 'Vinagre';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'mozarela', 'bola de mozzarella', 'burrata', 'ricotta']) as alias
where cf.canonical_name = 'Mozzarella';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'caldo de ave', 'pastillas de caldo de pollo']) as alias
where cf.canonical_name = 'Caldo de pollo';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'caldo vegetal', 'pastillas de caldo de verduras']) as alias
where cf.canonical_name = 'Caldo de verduras';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'cerveza sin alcohol', 'lata de cerveza', 'pack de cerveza']) as alias
where cf.canonical_name = 'Cerveza';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'boniatos', 'batata']) as alias
where cf.canonical_name = 'Boniato';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'limones', 'limon']) as alias
where cf.canonical_name = 'Limón';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'sandia', 'sandia rayada']) as alias
where cf.canonical_name = 'Sandía';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'espinaca', 'espinacas frescas', 'espinacas congeladas']) as alias
where cf.canonical_name = 'Espinacas';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'maiz', 'maiz dulce', 'elote', 'lata de maiz']) as alias
where cf.canonical_name = 'Maíz dulce';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'aguacates', 'palta']) as alias
where cf.canonical_name = 'Aguacate';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'pepinos']) as alias
where cf.canonical_name = 'Pepino';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'pechuga de pavo bipack', 'filetes de pavo', 'pavo fileteado']) as alias
where cf.canonical_name = 'Pechuga de pavo';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'remolacha']) as alias
where cf.canonical_name = 'Remolacha cocida';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'fuet tarradellas', 'salchichón', 'longaniza']) as alias
where cf.canonical_name = 'Fuet';
insert into public.food_aliases (catalog_food_id, alias)
select cf.id, alias from public.catalog_foods cf cross join unnest(array[
  'queso semicurado', 'queso tierno']) as alias
where cf.canonical_name = 'Queso curado';
