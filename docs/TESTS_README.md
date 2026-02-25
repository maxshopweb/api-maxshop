# Tests del API MaxShop

Documentación corta: qué prueba cada archivo, cómo ejecutarlo y qué esperar.

---

## Cómo ejecutar

Desde `api-maxshop`:

| Comando | Qué hace |
|---------|----------|
| `npm test` | Todos los tests |
| `npm test -- payment-webhook` | Solo webhook de pagos |
| `npm test -- payment-processing` | Solo confirmación de pago |
| `npm test -- factura-sync` | Solo sincronización de facturas |
| `npm test -- andreani.api` | Solo cliente HTTP Andreani |
| `npm test -- --watch` | Modo watch (re-ejecuta al guardar) |
| `npm test -- --silent` | Sin `console.log`/`console.error` del código |

---

## 1. Payment Processing (`payment-processing.service.spec.ts`)

**Qué prueba:** Flujo al **confirmar un pago** (después de que Mercado Pago aprueba).

- Descuenta stock, actualiza estado de la venta y dispara handlers (Andreani, Excel, etc.).
- Envía **un solo** email de confirmación al cliente.
- El email **siempre** lleva el número de pedido (`orderId`).
- Si la venta tiene envío (no es retiro), el email incluye `trackingCode` y `carrier` (Andreani).
- Si la venta ya estaba aprobada, no se vuelve a ejecutar nada (idempotencia).

**Qué esperar:** 6 tests. No toca BD, Redis ni envía emails reales (todo mockeado).

**Uso:** `npm test -- payment-processing`

---

## 2. Payment Webhook (`payment-webhook.service.spec.ts`)

**Qué prueba:** Procesamiento de **webhooks de Mercado Pago** (entrada del evento de pago).

- **Validación:** Rechaza payload sin `action` o `data.id`; ignora eventos que no son `type=payment` o que no incluyen `"payment"` en la acción.
- **Idempotencia:** Si el mismo pago llega dos veces con el mismo estado → se salta (skipped), no se duplica confirmación ni email.
- **Flujo aprobado:** Llama a `confirmPayment`, guarda en `mercado_pago_payments` con `payment_id` y `venta_id` correctos.
- **Flujo rechazado:** No llama a `confirmPayment`; actualiza la venta a `rechazado`.
- **Errores:** Si falla MP o no hay venta, guarda en `failed_webhooks` y devuelve `success: false` sin lanzar (para poder responder 200 a MP).
- **Lock:** Dos webhooks del mismo pago en paralelo → uno se procesa, el otro sale skipped.

**Qué esperar:** 14 tests. Prisma, MP y `confirmPayment` mockeados.

**Uso:** `npm test -- payment-webhook`

---

## 3. Factura Sync (`factura-sync.service.spec.ts`)

**Qué prueba:** Sincronización de **facturas desde FTP** (Tekno): matching, emails y limpieza.

- Sin ventas pendientes → no conecta al FTP; resultado con 0 procesadas.
- Con ventas pendientes: conecta/desconecta FTP una vez; busca PDF por `F4-0004-{cod_interno}.pdf` o por `F4-0004-{id_venta 8 dígitos}.pdf` si no hay `cod_interno`.
- Si encuentra factura: descarga, envía email con factura adjunta, envía email de tracking, borra del FTP, actualiza venta a "facturado".
- Si no encuentra PDF: incrementa `noEncontradas` y actualiza intentos.
- Si hay error en una venta: resultado con `errores: 1` y **siempre** desconecta FTP en `finally`.

**Qué esperar:** 6 tests. Prisma, FTP y mail mockeados.

**Uso:** `npm test -- factura-sync`

---

## 4. Andreani API (`andreani.api.service.spec.ts`)

**Qué prueba:** Cliente HTTP de **Andreani** (token, reintentos, parsing).

- Incluye `x-authorization-token` en cada request.
- Ante 401 o 403: renueva token y reintenta la request.
- Si la respuesta no es OK → devuelve `success: false` con status y error.
- Parsea JSON cuando `Content-Type` es `application/json`.
- **getBinary:** Devuelve buffer y contentType para PDF; ante 401 renueva token y reintenta.

**Qué esperar:** 8 tests. Auth y `fetch` mockeados.

**Uso:** `npm test -- andreani.api`

---

## Resumen por archivo

| Archivo | Tests | Qué garantiza |
|---------|-------|----------------|
| `payment-processing.service.spec.ts` | 6 | Confirmación de pago: stock, estado, 1 email con orderId y tracking si hay envío, idempotencia |
| `payment-webhook.service.spec.ts` | 14 | Webhook MP: validación, idempotencia, aprobado/rechazado, errores a `failed_webhooks`, lock |
| `factura-sync.service.spec.ts` | 6 | Sync facturas FTP: matching cod_interno/id_venta, emails, disconnect en finally |
| `andreani.api.service.spec.ts` | 8 | Cliente Andreani: token, retry 401/403, JSON/PDF |

**Total:** 34 tests.

---

## Configuración

- **Jest:** `jest.config.js` en la raíz de `api-maxshop`.
- **Patrón de archivos:** `**/__tests__/**/*.spec.ts` y `**/*.spec.ts` bajo `src/`.
- Si aparece **JEST-01 DeprecationWarning** al final: es por limpieza entre archivos; los tests son válidos. Para menos ruido: `npm test -- --silent`.

---

## Añadir o cambiar tests

- Cada spec tiene en el encabezado comentarios de "CÓMO EJECUTAR" y "MOCKS".
- Usa los **builders** (`buildVentaPendiente`, `buildWebhook`, etc.) para datos de prueba.
- Mockea siempre BD, APIs externas y envío de emails; comprueba con `expect(mock.toHaveBeenCalledWith(...))`.
