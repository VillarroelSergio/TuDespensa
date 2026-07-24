---
title: Recetario inicial — propuesta editorial para validación
tags: [midespensa, producto, recetas, piloto]
status: review
updated: 2026-07-23
related:
  - "[[PRODUCT-BRIEF]]"
  - "[[DOMAIN-DATA-MODEL]]"
  - "[[FAMILY-RECIPES-REVIEW]]"
---

# Recetario inicial — propuesta editorial para validación

## Propósito y límites

Este catálogo se revisa antes de implementarlo. **No es un seed y no modifica la BBDD.** Tras aprobarlo se redactarán las fichas estructuradas (ingredientes, cantidades, pasos y categorías) y solo entonces se cargará de forma versionada, idempotente y editable por hogar.

Todas las recetas son para **dos personas** como ración base. El planificador podrá ajustar las raciones. El repertorio es mediterráneo y español, equilibrado a nivel culinario —rotación de verduras, legumbres, pescado, huevos, ave y carne moderada—, sin consejo médico ni freidora de aire. No incluye desayunos, platos picantes ni ingredientes difíciles de encontrar en un supermercado estándar español. Las técnicas son horno convencional, fogón, plancha, vapor, crudo y olla. El contenido se redactará expresamente para MiDespensa, sin imágenes ni textos de terceros.

## Reparto

| Grupo | Nº |
| --- | ---: |
| Verduras, cremas y entrantes | 20 |
| Legumbres | 20 |
| Arroces, pasta y cereales | 20 |
| Pescado y marisco | 20 |
| Pollo, pavo y carne moderada | 15 |
| Huevos y cenas rápidas | 15 |
| Platos españoles y regionales | 15 |
| Ensaladas y platos templados | 10 |
| Cenas ligeras y preparaciones cotidianas | 10 |
| Postres y preparaciones básicas | 5 |
| **Total** | **150** |

## Catálogo para validar

La indicación resume la futura ficha: `tiempo · técnica · etiquetas`.

### Verduras, cremas y entrantes

1. Gazpacho andaluz — 15 min · crudo · tomate, verano.
2. Salmorejo cordobés con huevo y jamón — 20 min · batidora · tomate.
3. Pisto manchego con huevo cuajado — 45 min · sartén · verduras.
4. Escalivada de verduras — 50 min · horno · verduras.
5. Menestra de verduras salteada — 30 min · vapor/sartén · verduras.
6. Crema de calabacín y puerro — 30 min · olla · verduras.
7. Crema de calabaza con garbanzos al horno — 35 min · olla/horno · verduras, legumbre.
8. Sopa de tomate y albahaca — 30 min · olla · tomate.
9. Berenjenas rellenas de verduras y tomate — 50 min · horno · verduras.
10. Calabacines rellenos de arroz integral y verduras — 50 min · horno · verduras, cereal.
11. Alcachofas salteadas con ajo y limón — 25 min · sartén · temporada.
12. Judías verdes con patata, huevo y pimentón — 30 min · olla · verduras, huevo.
13. Coliflor al horno con pimentón y yogur — 35 min · horno · verduras.
14. Brócoli con ajo, limón y almendras — 20 min · sartén · verduras.
15. Espinacas con pasas y piñones — 15 min · sartén · clásico.
16. Acelgas rehogadas con patata y garbanzos — 35 min · olla/sartén · legumbre.
17. Tomates asados con queso fresco y orégano — 30 min · horno · tomate.
18. Champiñones al ajillo con perejil — 15 min · sartén · rápido.
19. Espárragos trigueros con huevo poché — 20 min · plancha · verduras, huevo.
20. Sopa juliana de verduras — 35 min · olla · invierno.

### Legumbres

21. Lentejas pardinas estofadas con verduras — 60 min · olla · cuchara.
22. Lentejas con calabaza y espinacas — 50 min · olla · verduras.
23. Lentejas beluga con verduras asadas y limón — 45 min · horno/olla · templada.
24. Garbanzos con espinacas y comino — 35 min · sartén · rápido.
25. Garbanzos guisados con acelgas — 45 min · olla · verduras.
26. Potaje de garbanzos con bacalao y espinacas — 55 min · olla · pescado.
27. Ensalada templada de garbanzos, pimiento y atún — 20 min · sartén · pescado.
28. Garbanzos al horno con berenjena y tomate — 45 min · horno · verduras.
29. Alubias blancas con verduras y romero — 55 min · olla · cuchara.
30. Alubias con calabaza y acelgas — 50 min · olla · verduras.
31. Fabes ligeras con almejas — 50 min · olla · marisco.
32. Ensalada de alubias, tomate, pepino y huevo — 20 min · crudo · verano.
33. Judías pintas con verduras y arroz integral — 60 min · olla · cereal.
34. Alubias rojas guisadas con verduras y pimentón dulce — 45 min · olla · verduras.
35. Hummus con crudités y pan integral — 15 min · batidora · rápido.
36. Falafel al horno con ensalada de yogur — 45 min · horno · mediterránea.
37. Hamburguesas de lentejas y avena — 40 min · sartén · cena.
38. Albóndigas de garbanzo en salsa de tomate — 45 min · horno/olla · verduras.
39. Guiso de guisantes con alcachofas y huevo — 35 min · olla · verduras.
40. Habas tiernas con jamón, cebolla y menta — 25 min · sartén · temporada.

### Arroces, pasta y cereales

41. Arroz caldoso de verduras — 45 min · cazuela · verduras.
42. Arroz con pollo, verduras y limón — 45 min · cazuela · ave.
43. Arroz al horno con garbanzos y tomate — 50 min · horno · legumbre.
44. Arroz meloso de setas y espinacas — 40 min · cazuela · verduras.
45. Paella de verduras de temporada — 50 min · paellera · verduras.
46. Arroz con sepia, guisantes y alcachofas — 50 min · paellera · pescado.
47. Arroz negro con calamar y alioli de yogur — 50 min · paellera · marisco.
48. Fideuá de verduras y pescado blanco — 40 min · paellera · pescado.
49. Cuscús integral con verduras asadas y garbanzos — 35 min · horno · legumbre.
50. Cuscús de verduras con tomate, pepino y queso fresco — 20 min · crudo · fresco.
51. Arroz integral con calabacín, tomate y huevo — 30 min · olla/sartén · huevo.
52. Pasta integral con tomate cherry, albahaca y atún — 25 min · olla · pescado.
53. Espaguetis integrales con calabacín y limón — 25 min · sartén · verduras.
54. Macarrones con boloñesa de lentejas — 40 min · olla · legumbre.
55. Pasta con espinacas, requesón y nueces — 25 min · olla · verduras.
56. Pasta con sardinas, tomate y pasas — 30 min · sartén · pescado.
57. Canelones de espinaca y setas — 55 min · horno · verduras.
58. Lasaña de verduras asadas — 60 min · horno · verduras.
59. Migas con verduras, uvas y huevo — 35 min · sartén · aprovechamiento.
60. Arroz al horno con calabaza, queso fresco y avellanas — 35 min · horno · verduras.

### Pescado y marisco

61. Merluza al horno con patata, tomate y aceitunas — 40 min · horno · mediterránea.
62. Merluza en salsa verde con guisantes — 30 min · cazuela · clásico.
63. Bacalao con tomate casero y pimientos — 40 min · cazuela · español.
64. Bacalao al horno con garbanzos y espinacas — 40 min · horno · legumbre.
65. Dorada a la espalda con verduras — 35 min · horno · rápido.
66. Lubina al horno con limón y calabacín — 40 min · horno · mediterránea.
67. Salmón a la plancha con judías verdes y patata — 30 min · plancha · cena.
68. Salmón al horno con naranja y eneldo — 30 min · horno · rápido.
69. Caballa al horno con pimientos asados — 35 min · horno · temporada.
70. Sardinas al horno con ensalada de tomate — 25 min · horno · verano.
71. Bonito con tomate y pimiento verde — 35 min · cazuela · español.
72. Atún a la plancha con pisto — 30 min · plancha · verduras.
73. Marmitako ligero de bonito y patata — 45 min · olla · cuchara.
74. Calamares guisados en su tinta con arroz — 45 min · cazuela · arroz.
75. Sepia a la plancha con guisantes y limón — 25 min · plancha · rápido.
76. Chipirones encebollados — 35 min · cazuela · español.
77. Mejillones al vapor con tomate y vino blanco — 20 min · olla · rápido.
78. Almejas a la marinera con perejil — 20 min · cazuela · clásico.
79. Langostinos con ajo, limón y brócoli — 20 min · sartén · verduras.
80. Cazuela de pescado blanco con patata y azafrán — 45 min · cazuela · cuchara.

### Pollo, pavo y carne moderada

81. Pollo al horno con limón, romero y verduras — 50 min · horno · mediterránea.
82. Pollo guisado con alcachofas y guisantes — 50 min · cazuela · verduras.
83. Pollo con tomate, aceitunas y albahaca — 40 min · cazuela · mediterránea.
84. Pollo salteado con calabacín y almendras — 25 min · sartén · rápido.
85. Brochetas de pollo con pimientos y yogur de limón — 30 min · plancha · cena.
86. Pavo guisado con zanahoria y champiñones — 40 min · cazuela · verduras.
87. Albóndigas de pavo en salsa de tomate — 45 min · cazuela · clásico.
88. Pechuga de pavo rellena de espinacas y queso fresco — 40 min · horno · cena.
89. Conejo al ajillo con patatas y ensalada — 45 min · cazuela · español.
90. Conejo guisado con tomate y romero — 55 min · cazuela · mediterránea.
91. Lomo de cerdo con manzana y cebolla — 40 min · horno · otoño.
92. Solomillo de cerdo con verduras al horno — 35 min · horno · cena.
93. Ternera guisada con zanahoria y guisantes — 70 min · olla · cuchara.
94. Filetes de ternera con tomate y patata — 25 min · plancha · sencillo.
95. Berenjenas rellenas de carne magra y verduras — 55 min · horno · verduras.

### Huevos y cenas rápidas

96. Tortilla española de patata y cebolla — 40 min · sartén · clásico.
97. Tortilla de calabacín y cebolla — 25 min · sartén · verduras.
98. Tortilla de espinacas, queso fresco y nueces — 20 min · sartén · rápido.
99. Revuelto de setas y espárragos — 20 min · sartén · verduras.
100. Huevos al plato con tomate, garbanzos y espinacas — 30 min · horno · legumbre.
101. Huevos flamencos con verduras y guisantes — 35 min · horno · español.
102. Huevos en salsa de tomate y pimiento — 30 min · sartén · verduras.
103. Frittata de verduras asadas — 35 min · horno · aprovechamiento.
104. Tortilla de bacalao y pimiento verde — 25 min · sartén · pescado.
105. Tortilla de guisantes, menta y cebolla tierna — 20 min · sartén · primavera.
106. Tosta de tomate, aguacate y huevo poché — 15 min · fogón · rápido.
107. Tosta de escalivada y anchoas — 20 min · horno · pescado.
108. Quesadillas de verduras, alubias y queso — 25 min · sartén · legumbre.
109. Bocadillo integral de tortilla, tomate y rúcula — 20 min · sartén · rápido.
110. Pita integral con hummus, verduras y huevo duro — 20 min · crudo · cena.

### Platos españoles y regionales

111. Cocido ligero de garbanzos, verduras y pollo — 75 min · olla · cuchara.
112. Ajo blanco con uvas y almendras — 15 min · batidora · verano.
113. Porra antequerana con huevo y atún — 20 min · batidora · tomate.
114. Pipirrana de tomate, pimiento y huevo — 20 min · crudo · Andalucía.
115. Tumbet mallorquín de verduras — 55 min · horno · regional.
116. Escudella vegetal con judías blancas — 55 min · olla · cuchara.
117. Marmitako de bonito — 45 min · olla · País Vasco.
118. Suquet de pescado con patata y almendras — 50 min · cazuela · Cataluña.
119. Caldereta sencilla de pescado y marisco — 50 min · cazuela · Mediterráneo.
120. Zarangollo murciano de calabacín, cebolla y huevo — 25 min · sartén · regional.
121. Ajoblanco de melón y almendras — 15 min · batidora · verano.
122. Patatas a la importancia con verduras — 45 min · cazuela · clásico.
123. Espinacas con garbanzos al estilo sevillano — 35 min · sartén · Andalucía.
124. Trinxat de col y patata con huevo — 35 min · sartén · Cataluña.
125. Pimientos del piquillo rellenos de merluza — 45 min · horno · pescado.

### Ensaladas y platos templados

126. Ensalada mediterránea de tomate, pepino, aceitunas y queso fresco — 15 min · crudo.
127. Ensalada griega con garbanzos — 20 min · crudo · legumbre.
128. Ensalada de patata, judía verde, huevo y caballa — 30 min · olla · pescado.
129. Ensalada de lentejas con zanahoria, manzana y nueces — 20 min · crudo.
130. Ensalada de arroz integral, atún y verduras — 30 min · olla · pescado.
131. Ensalada de arroz integral, calabaza asada y queso fresco — 35 min · horno.
132. Ensalada de remolacha, naranja y nueces — 15 min · crudo · invierno.
133. Ensalada templada de judías verdes, tomate y almendras — 25 min · olla.
134. Coliflor picada con tomate, hierbas y garbanzos — 20 min · crudo · legumbre.
135. Ensalada de pasta integral con verduras y mozzarella — 25 min · olla.

### Cenas ligeras y preparaciones cotidianas

136. Sopa de verduras con fideos integrales — 30 min · olla · cena ligera.
137. Crema de zanahoria y naranja — 30 min · olla · cena ligera.
138. Ensalada caprese con pan integral — 15 min · crudo · cena ligera.
139. Bocadillo integral de pechuga de pollo, tomate y lechuga — 20 min · plancha · cena rápida.
140. Tosta de queso fresco, tomate y orégano — 15 min · horno · cena rápida.
141. Puré de patata y zanahoria con huevo duro — 30 min · olla · cena ligera.
142. Sándwich integral de pavo, queso y tomate — 15 min · plancha · cena rápida.
143. Sopa de pollo con verduras y arroz — 40 min · olla · cena ligera.
144. Ensalada de tomate, atún, huevo y aceitunas — 15 min · crudo · cena rápida.
145. Crema de puerro y patata con picatostes integrales — 35 min · olla · cena ligera.

### Postres y preparaciones básicas

146. Fruta asada con canela y yogur natural — 25 min · horno.
147. Compota de manzana y pera sin azúcar añadido — 30 min · olla.
148. Yogur natural con naranja, canela y almendras — 10 min · crudo.
149. Macedonia de fruta de temporada con menta — 15 min · crudo.
150. Bizcocho integral de yogur, limón y aceite de oliva — 50 min · horno.

## Ficha completa obligatoria antes de la carga

El índice aprobado no se transformará en recetas vacías ni en descripciones genéricas. Cada una de las 150 fichas se redactará como si se hubiera introducido manualmente en la aplicación y contendrá:

1. título, tipo de plato, tiempo total y **2 raciones** como valor base;
2. ingredientes concretos, con cantidades y unidades cuando aporten una compra útil;
3. tres a seis pasos breves, ordenados y realizables con la técnica indicada;
4. categorías de tipo, ingrediente principal, técnica, tiempo, temporada y orientación mediterránea;
5. una clave estable de carga y la procedencia `Recetas base del proyecto MiDespensa`.

La revisión se hará sobre esas fichas completas en un documento de contenido separado. Solo después se convertirá en la carga versionada para Supabase. Así, el piloto no verá títulos sin instrucciones ni importará recetas que el hogar no haya revisado.

Las recetas manuscritas del hogar se revisan de forma independiente en [[FAMILY-RECIPES-REVIEW]]. Se cargarán además del catálogo base y como favoritas para las dos cuentas del hogar.

## Criterio de aprobación

La validación aprueba el tamaño, la ración base, los títulos, el reparto y los límites culinarios. Podrán eliminarse, sustituirse o marcarse como imprescindibles recetas concretas. Solo con esa aprobación se redactarán fichas completas, con ingredientes y cantidades para dos, y se implementará su carga en la base de datos.
