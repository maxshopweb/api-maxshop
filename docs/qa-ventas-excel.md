# QA: Excel de ventas (`Ventas.xlsx` / FTP)

Guía para generar **ventas de prueba realistas** y validar que el Excel quede bien rellenado antes de que el cliente lo consuma en su sistema interno.

## Qué genera el sistema

- Al dispararse el handler `ExcelHandler` (evento `SALE_CREATED` con las reglas actuales), se descarga `Ventas.xlsx` del FTP (si existe), se agregan filas desde la **fila 4** y se vuelve a subir.
- Si el archivo **no existe** en el FTP, se crea un libro nuevo con **fila 1 vacía**, **filas 2–3** de cabecera (alineadas a `Venta_fgb_detallada.xlsx`) y los datos desde la fila 4.

## Archivos de referencia

| Archivo | Uso |
|---------|-----|
| `Venta_fgb_detallada.xlsx` (raíz del repo o el que entregó el cliente) | Texto exacto de cabeceras filas 2–3 y expectativa de columnas A–AS |
| `ventas_sistema.xlsx` | Ejemplo de datos “bien” generados por el sistema (sin cabeceras en filas 1–3) |

## Columnas clave a revisar en cada fila de venta (desde fila 4)

| Col Excel | Contenido esperado |
|-----------|-------------------|
| A | Código de venta (`cod_interno` o `id` rellenado a 8 dígitos) |
| B | Fecha en formato largo español |
| F | Cantidad (entero, sin formato decimal de moneda) |
| G | Subtotal línea o total cabecera |
| H | Importe de descuento en dinero (negativo) si aplica; en cabecera multi-producto, descuento global |
| K | **Debe estar vacío** (solo espacio si no hay dato): ya no se escribe el código interno que confundía al cliente |
| L | Estado (subtotal si un solo artículo; 0 si varios) |
| N | SKU (`codi_arti` del producto) |
| O–P–Q | Neto / IVA / % descuento línea |
| T–U–V–W | Provincia facturación (código), nombre, tipo+número doc, dirección facturación |
| X–Y–Z | CF, nombre repetido, **mismo texto que V** (ej. `DNI 12345678`) |
| AA–AE | Domicilio envío (si no hay dirección de envío en BD, se usa dirección de facturación del cliente) |
| AF | `ANDREANI` si hay envío Andreani; si no, `RETIRO` |
| AG | `MP` / `TRANS` / `EFECTIVO` según `metodo_pago` |
| AH–AS | Datos de pago MP solo si existen; **AS titular tarjeta solo desde MP**, sin rellenar con el nombre del cliente |
| AT–AV | Código y sucursales Andreani solo si la integración / BD aportan datos |

Las celdas obligatorias vacías se rellenan con **un espacio** (`' '`) para que lectores externos vean la celda “presente”.

---

## Escenario 1 — Efectivo + retiro en local + cliente completo

**Objetivo:** fila con `AG = EFECTIVO`, `AF = RETIRO`, dirección y provincia completas, sin columnas MP ni Andreani (solo espacios donde no aplica).

### Pasos sugeridos

1. **Cliente / usuario**
   - Alta o edición de cliente con: **provincia** que exista en tabla `provincia` (nombre coincidente tras normalización), **dirección, altura, ciudad, código postal**, usuario con **tipo_documento** y **numero_documento** (o solo número para inferir DNI/CUIT).

2. **Producto**
   - Un producto con `codi_arti`, IVA configurado, `lista_precio_activa` si aplica (V/O/P/Q/E).

3. **Venta**
   - Crear pedido desde checkout o admin con **método de pago = efectivo** (texto que el backend reconozca como efectivo, p. ej. contiene `efectivo`).
   - **Retiro en local / sin envío Andreani:** no debe existir envío Andreani ni `cod_seguimiento` para esa venta.
   - Opcional: sin `direcciones` en la venta — el Excel debe usar igual la **dirección de facturación** en columna AA (domicilio envío).

4. **Disparar el Excel**
   - Tras crear la venta, el flujo normal ejecuta `SALE_CREATED` y el `ExcelHandler` (pendiente no-MP según reglas actuales).
   - Si la venta ya existía y hay que reprocesar: usar el mismo mecanismo que use el proyecto para re-ejecutar handlers (p. ej. confirmación de pago que vuelva a llamar al executor) o una prueba local que invoque `handlerExecutorService.runHandlersAndEmit` con payload de venta completa — según entorno.

5. **Verificación**
   - Descargar `Ventas.xlsx` del FTP (ruta configurada en `ftp-paths.config.ts`).
   - Abrir y comprobar fila de la venta: **AG = EFECTIVO**, **AF = RETIRO**, **V y Z iguales** (`DNI …` o `CUIT …`), **K vacío/espacio**, **H** con descuento en dinero si el detalle tiene `descuento_aplicado`, **Q** con % si aplica.
   - Comparar con `Venta_fgb_detallada.xlsx` que las columnas A–AS no queden “huecos” injustificados (espacio cuenta como celda presente).

---

## Escenario 2 — Transferencia + envío Andreani + cliente completo

**Objetivo:** `AG = TRANS`, `AF = ANDREANI`, **AT–AU–AV** con datos de envío si el pre-envío / BD los aportan.

### Pasos sugeridos

1. Mismo cliente y producto que en escenario 1.

2. **Método de pago:** transferencia (texto que contenga `transferencia`).

3. **Envío Andreani**
   - Flujo que cree envío con empresa Andreani y `cod_seguimiento`, o datos en `context.handlerData['andreani-handler']` en la misma ejecución de handlers (orden: Andreani antes que Excel por prioridad — verificar en `sale-created/index.ts`).
   - Si Excel corre sin Andreani en el mismo request, el handler ya busca `envios` en BD por `id_venta` y empresa Andreani.

4. **Verificación**
   - **AF = ANDREANI**, **AG = TRANS**.
   - Columnas **AT, AU, AV** con valores reales si la integración los devolvió; si no, deben quedar como espacio (no inventar datos).

---

## Escenario 3 — Mercado Pago + envío Andreani + cliente completo

**Objetivo:** `AG = MP`, filas de pago **AH–AS** con datos reales de MP (estado, forma de pago, titular tarjeta solo si MP lo envía), Andreani en AT–AV si aplica.

### Pasos sugeridos

1. Cliente y producto completos (igual que arriba).

2. Pago con **Mercado Pago** hasta estado que deje registro en `mercado_pago_payments` con los campos que mapea el handler (`payment_id`, `status_mp`, `payment_method_id`, `card_info`, etc.).

3. Envío Andreani como en escenario 2.

4. **Verificación**
   - **AG = MP**.
   - **AS** solo con nombre del titular de tarjeta si viene en `card_info.cardholder.name`; si no hay tarjeta / titular, debe ser espacio, **no** el nombre del cliente.
   - **H** descuento línea + **Q** % descuento.
   - Liquidación **BW–BY** si el modelo de pago expone esos campos.

---

## Ventas adicionales recomendadas (4 y 5)

4. **Un solo artículo con descuento en línea:** verificar **H** (importe negativo) y **Q** (%).
5. **Varios artículos distintos (≥2):** debe aparecer **fila cabecera** con texto en C (“Paquete de N productos”), totales en G/H/J/L, y **filas detalle** con F, N, O, P, Q, R, S, H por línea.

---

## Problemas frecuentes (datos de prueba “vacíos”)

| Síntoma | Causa probable |
|---------|----------------|
| Columna T vacía | Cliente o dirección sin provincia mapeable a `provincia.codi_provincia` |
| W vacía | Cliente sin dirección en BD |
| AA vacía | Sin `direcciones` y sin dirección de cliente para fallback |
| AO (total neto) solo espacio | `venta.total_neto` null en BD — no se duplica `total_con_iva` a propósito |
| Andreani vacío | No hubo integración / envío aún — correcto si no hay datos |

---

## Checklist rápido antes de entregar al cliente

- [ ] Tres archivos generados (o tres filas nuevas en el mismo `Ventas.xlsx`) para escenarios 1–3.
- [ ] Revisión visual / comparación con `Venta_fgb_detallada.xlsx` (cabeceras filas 2–3 en archivo nuevo).
- [ ] Cliente confirma importación en su sistema interno sin el error de “0 filas” o “1 fila”.
