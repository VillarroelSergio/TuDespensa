-- Filtro de recetas por ingrediente principal (petición del hogar, 2026-07-28):
-- clasifica retroactivamente TODAS las recetas ya existentes (semilla y las
-- creadas por cada hogar) en la dimensión `main_ingredient`, a partir de
-- palabras clave en el nombre de sus ingredientes. Es una heurística de una
-- sola vez y puede etiquetar una receta con más de una categoría (p. ej. una
-- tortilla de patatas queda en "Huevo" y en "Verduras"); una receta mal
-- clasificada se corrige a mano desde el editor de receta ("Más detalles" →
-- categorías), que ya soporta esta dimensión sin cambios.

do $$
declare
  keyword record;
begin
  for keyword in
    select * from (values
      ('Pasta', array['pasta','macarron','macarrón','espagueti','spaghetti','tallarin','tallarín','fideo','lasagna','lasaña','fusilli','penne','tagliatelle','canelon','canelón']),
      ('Verduras', array['tomate','pimiento','cebolla','calabacin','calabacín','lechuga','zanahoria','pepino','brocoli','brócoli','espinaca','berenjena','calabaza','judia verde','judía verde','puerro','acelga','coliflor','champiñon','champiñón','seta','ajo','patata']),
      ('Legumbres', array['lenteja','garbanzo','alubia','judia blanca','judía blanca','habas','soja']),
      ('Arroz y cereales', array['arroz','quinoa','cuscus','cuscús','avena','trigo','cebada','maiz','maíz']),
      ('Huevo', array['huevo']),
      ('Aves', array['pollo','pavo','pato']),
      ('Carne', array['ternera','cerdo','vacuno','cordero','carne picada','chorizo','jamon','jamón','morcilla','panceta','bacon','conejo','lomo','solomillo']),
      ('Pescado', array['merluza','salmon','salmón','atun','atún','bacalao','sardina','pescado','gamba','langostino','marisco','pulpo','calamar','sepia','trucha','boqueron','boquerón'])
    ) as k(category_name, patterns)
  loop
    insert into public.recipe_categories (household_id, dimension, name)
    select distinct r.household_id, 'main_ingredient', keyword.category_name
    from public.recipes r
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    where exists (
      select 1 from unnest(keyword.patterns) as p(pattern)
      where lower(ri.name) like '%' || p.pattern || '%'
    )
    on conflict (household_id, dimension, lower(name)) do nothing;

    insert into public.recipe_category_assignments (recipe_id, category_id, household_id)
    select distinct r.id, rc.id, r.household_id
    from public.recipes r
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    join public.recipe_categories rc
      on rc.household_id = r.household_id
     and rc.dimension = 'main_ingredient'
     and rc.name = keyword.category_name
    where exists (
      select 1 from unnest(keyword.patterns) as p(pattern)
      where lower(ri.name) like '%' || p.pattern || '%'
    )
    on conflict do nothing;
  end loop;
end;
$$ language plpgsql;
