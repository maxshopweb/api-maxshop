-- =============================================================================
-- RESTAURACIÓN MANUAL desde snapshots de auditoría (dato_despues)
-- Fuente: export PRODUCTO_UPDATE entregado por el cliente (marzo 2026).
--
-- IMPORTANTE:
-- 1) Revisar en STAGING antes de producción.
-- 2) Hacer backup / BEGIN antes de ejecutar.
-- 3) id_prod 23438054 (633547): el último registro de auditoría del dump tenía
--    precio_venta = 0; aquí se restaura el snapshot 2026-03-10 14:26:39 con 250000.
-- 4) Ajustar si en producción los id_prod / codi_arti no coinciden.
-- =============================================================================

BEGIN;

-- 633547 — snapshot 2026-03-10 14:26:39 (precio manual 250000; no usar último audit con 0)
UPDATE productos SET
  nombre = 'ROTOMARTILLO 26MM C/ CARG Y BATS+TALADRO ATOR. 10MM+AMOLADORA 115MM-',
  modelo = NULL,
  descripcion = '',
  codi_categoria = '0001',
  codi_marca = '004',
  codi_grupo = '0003',
  codi_impuesto = '01',
  unidad_medida = '1',
  unidades_por_producto = 1,
  codi_barras = '6545674646546546',
  stock = 100,
  stock_min = 0,
  activo = 'A',
  estado = 1,
  destacado = false,
  financiacion = false,
  publicado = true,
  lista_precio_activa = 'V',
  precio_venta = 250000::numeric,
  precio_especial = NULL,
  precio_pvp = NULL,
  precio_campanya = NULL,
  precio_manual = NULL,
  bonificacion_porcentaje = NULL,
  precio_editado_manualmente = true,
  img_principal = NULL,
  imagenes = NULL,
  actualizado_en = NOW()
WHERE id_prod = 23438054 AND codi_arti = '633547';

-- CRISPRUEBA — último audit 2026-03-19 19:12:07
UPDATE productos SET
  nombre = 'PRUEBA CRISTIAN',
  modelo = 'PRUEBA',
  descripcion = '',
  codi_categoria = '0050',
  codi_marca = '004',
  codi_grupo = '0010',
  codi_impuesto = '01',
  unidad_medida = '',
  unidades_por_producto = NULL,
  codi_barras = '1111111111111111111111',
  stock = 2,
  stock_min = NULL,
  activo = NULL,
  estado = 1,
  destacado = false,
  financiacion = false,
  publicado = true,
  lista_precio_activa = 'O',
  precio_venta = 50000::numeric,
  precio_especial = 14999.99::numeric,
  precio_pvp = NULL,
  precio_campanya = 0::numeric,
  precio_manual = NULL,
  bonificacion_porcentaje = NULL,
  precio_editado_manualmente = true,
  img_principal = 'productos/26864647/26864647.jpg',
  imagenes = NULL,
  actualizado_en = NOW()
WHERE id_prod = 26864647 AND codi_arti = 'CRISPRUEBA';

-- 633546 — 2026-03-18 19:12:48
UPDATE productos SET
  nombre = 'CARGADOR DE BATERÍA 2.0',
  modelo = 'FCLI42021-4',
  descripcion = '',
  codi_categoria = '0032',
  codi_marca = '004',
  codi_grupo = '0004',
  codi_impuesto = '01',
  unidad_medida = NULL,
  unidades_por_producto = 0,
  codi_barras = '464646946946',
  stock = 100,
  stock_min = 0,
  activo = 'A',
  estado = 1,
  destacado = false,
  financiacion = false,
  publicado = true,
  lista_precio_activa = 'O',
  precio_venta = 25000::numeric,
  precio_especial = 22000::numeric,
  precio_pvp = NULL,
  precio_campanya = NULL,
  precio_manual = NULL,
  bonificacion_porcentaje = NULL,
  precio_editado_manualmente = true,
  img_principal = 'productos/17464923/17464923.jpg',
  imagenes = '["productos/17464923/17464923_2.png"]'::json,
  actualizado_en = NOW()
WHERE id_prod = 17464923 AND codi_arti = '633546';

-- 221203 — 2026-03-26 19:35:34
UPDATE productos SET
  nombre = 'CORTADORA DE PELO REMINGTON HC1095',
  modelo = 'HC1095',
  descripcion = $desc6893$Cortadora de Pelo Remington HC1095 13 Piezas 220V Roja | Kit completo para cortes precisos en casa

La Cortadora de Pelo Remington HC1095 en color rojo es una herramienta confiable para quienes buscan realizar cortes de cabello desde la comodidad del hogar con resultados prolijos y consistentes. Equipada con cuchillas de acero inoxidable de corte lineal, garantiza un deslizamiento suave y parejo, evitando tirones incluso en cabellos más gruesos. Su diseño ergonómico con mango antideslizante permite un manejo cómodo y seguro durante el uso. Incluye una completa variedad de peines guía que permiten personalizar el largo del corte, lo que la hace ideal tanto para retoques simples como para cortes más definidos. Al funcionar conectada mediante cable, ofrece potencia constante sin necesidad de recarga, lo que la convierte en una opción ideal para el hogar.

¿Qué incluye la caja?
-Cortadora Remington HC1095 (unidad principal)
-6 peines guía de diferentes longitudes (aproximadamente 3 mm a 12 mm)
-Aceite lubricante para cuchillas
-Cepillo de limpieza
-2 pinzas de sujeción
-Palanca de ajuste de longitud
-Protector de cuchillas
-Estuche o bolsa de almacenamiento (según versión)

Beneficios clave:
-Uso profesional en casa gracias a cuchillas de acero inoxidable y corte lineal que facilitan un acabado uniforme
-Versatilidad para distintos estilos de largo gracias a múltiples peines guía
-Diseño ergonómico con mango antideslizante que mejora el control y confort al usar

Ficha técnica:
-Modelo: HC1095
-Número de piezas: 13
-Cuchillas: acero inoxidable autoafilables
-Longitudes de corte: 3 mm a 12 mm mediante peines guía
-Tipo de alimentación: cableado (uso conectado a red eléctrica)

Por qué es el producto ideal$desc6893$,
  codi_categoria = '0115',
  codi_marca = NULL,
  codi_grupo = '0022',
  codi_impuesto = '04',
  unidad_medida = '1',
  unidades_por_producto = 1,
  codi_barras = '074590540079',
  stock = 9,
  stock_min = 0,
  activo = 'A',
  estado = 1,
  destacado = false,
  financiacion = false,
  publicado = true,
  lista_precio_activa = 'O',
  precio_venta = 29628.95::numeric,
  precio_especial = 21628.95::numeric,
  precio_pvp = NULL,
  precio_campanya = NULL,
  precio_manual = NULL,
  bonificacion_porcentaje = NULL,
  precio_editado_manualmente = true,
  img_principal = NULL,
  imagenes = NULL,
  actualizado_en = NOW()
WHERE id_prod = 6893 AND codi_arti = '221203';

-- 633389 — 2026-03-26 19:42:26
UPDATE productos SET
  nombre = 'ROTOMARTILLO SDS PLUS 2.5J (P20S) 20V INDUSTRIAL CRHLI20268',
  modelo = 'CRHLI20268',
  descripcion = $desc8047$ROTOMARTILLO A BATERIA 26MM P20S 20V SDS PLUS BRUSHLESS MOTOR S/BAT S/CARGADOR
-Motor sin carbones.
-Voltaje: 20 V.
-Velocidad sin carga: 0-1100 rpm.
-Frecuencia de impacto: 0-5000 bpm.
-Energía de impacto: 2,5 J.
-Capacidad máxima de perforación:
-Hormigón: 26 mm.
-Acero: 13 mm.
-Madera: 30 mm.
-Sistema de mandril SDS plus.
-Incluye:
-3 brocas.
-1 cincel.
-Batería y cargador se venden por separado$desc8047$,
  codi_categoria = '0030',
  codi_marca = '004',
  codi_grupo = '0004',
  codi_impuesto = '04',
  unidad_medida = '1',
  unidades_por_producto = 1,
  codi_barras = '6942141814198',
  stock = 4,
  stock_min = 0,
  activo = 'A',
  estado = 1,
  destacado = false,
  financiacion = false,
  publicado = true,
  lista_precio_activa = 'P',
  precio_venta = 134869.041234::numeric,
  precio_especial = 142985.520362::numeric,
  precio_pvp = 145472.7436::numeric,
  precio_campanya = NULL,
  precio_manual = NULL,
  bonificacion_porcentaje = NULL,
  precio_editado_manualmente = true,
  img_principal = 'IMAGENES/INGCO/633389-CRHLI20268.PNG',
  imagenes = NULL,
  actualizado_en = NOW()
WHERE id_prod = 8047 AND codi_arti = '633389';

-- 625053 — 2026-03-26 21:29:01
UPDATE productos SET
  nombre = 'LIJADORA ORBITAL 180W DISCO 5" - BDERO100 BLACK & DECKER',
  modelo = 'BDERO100-A',
  descripcion = $desc5816$* Potencia: 180 WATTS
* Órbitas: 12000 O.p.m
* Lija: 5" (125 mm)
* Incluye: Recolector de Polvo - lija
* Base autofijante de 5", 125 mm.
* Velocidad: 12000 opm.
* Al combinar las órbitas con la rotación la terminación es 100% sin rayas.
* Bolsa recolectora de polvo de gran capacidad.
* Carcaza anti-deslizante y texturizada.
* Acción para alta tasa de eliminación y un acabado de alta calidad.
* Interruptor sellado a mantener fuera polvo y basura, y extender la vida útil de la herramienta.$desc5816$,
  codi_categoria = '0003',
  codi_marca = '003',
  codi_grupo = '0002',
  codi_impuesto = '01',
  unidad_medida = '1',
  unidades_por_producto = 1,
  codi_barras = '885911599665',
  stock = 8,
  stock_min = 0,
  activo = 'A',
  estado = 1,
  destacado = false,
  financiacion = false,
  publicado = true,
  lista_precio_activa = 'V',
  precio_venta = 171615.31::numeric,
  precio_especial = 184526.28::numeric,
  precio_pvp = 193671.54::numeric,
  precio_campanya = NULL,
  precio_manual = NULL,
  bonificacion_porcentaje = NULL,
  precio_editado_manualmente = true,
  img_principal = NULL,
  imagenes = NULL,
  actualizado_en = NOW()
WHERE id_prod = 5816 AND codi_arti = '625053';

-- 633387 — 2026-03-27 13:31:27
UPDATE productos SET
  nombre = 'TALADRO PERCUTOR 13MM 680W - ID6808-4 INGCO',
  modelo = 'ID6808-4',
  descripcion = $desc8044$-Voltaje: 220-240V ~ 50 / 60Hz
-Potencia de entrada: 680W
-Velocidad sin carga: 0-3000 rpm
-Capacidad máx. De perforación: 13 mm
-Velocidad variable
-Conmutador Froward / Reverse
-Función de martillo$desc8044$,
  codi_categoria = '0001',
  codi_marca = '004',
  codi_grupo = '0002',
  codi_impuesto = '01',
  unidad_medida = '1',
  unidades_por_producto = 1,
  codi_barras = '6941640169952',
  stock = 100,
  stock_min = 0,
  activo = 'A',
  estado = 1,
  destacado = false,
  financiacion = false,
  publicado = true,
  lista_precio_activa = 'V',
  precio_venta = 60098.7916::numeric,
  precio_especial = 51238.842975::numeric,
  precio_pvp = 56652.106::numeric,
  precio_campanya = NULL,
  precio_manual = NULL,
  bonificacion_porcentaje = NULL,
  precio_editado_manualmente = true,
  img_principal = 'IMAGENES/INGCO/633387-ID6808-4.JPG',
  imagenes = NULL,
  actualizado_en = NOW()
WHERE id_prod = 8044 AND codi_arti = '633387';

-- Verificación rápida (opcional: descomentar)
-- SELECT id_prod, codi_arti, nombre, precio_venta, precio_especial, lista_precio_activa, precio_editado_manualmente
-- FROM productos WHERE id_prod IN (23438054, 26864647, 17464923, 6893, 8047, 5816, 8044);

COMMIT;
