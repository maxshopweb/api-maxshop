# Tests del API MaxShop

Documentación de la suite de tests automatizados: qué cubre cada archivo, cómo ejecutarlo y cómo extenderla.

**Última actualización:** mayo 2026 — suite ampliada (pagos, MP, checkout, facturas, Andreani).

---

## Cómo ejecutar

Desde `api-maxshop`:

| Comando | Qué hace |
|---------|----------|
| `npm test` | Todos los tests (8 suites, 86+ tests) |
| `npm test -- pricing.service` | Solo cálculo unificado de precios / bonificación |
| `npm test -- money.utils` | Solo utilidades de montos |
| `npm run test:ci` | CI: `--ci --forceExit --detectOpenHandles` |
| `npm run test:coverage` | Reporte de cobertura en `coverage/` |
| `npm run test:payment` | Solo specs relacionados con `payment` en el nombre |
| `npm test -- mercado-pago` | Solo Mercado Pago |
| `npm test -- payment-webhook` | Solo webhook de pagos |
| `npm test -- payment-processing` | Solo confirmación de pago |
| `npm test -- ventas.checkout` | Solo validación Zod del checkout |
| `npm test -- factura-sync` | Solo sincronización de facturas |
| `npm test -- andreani.api` | Solo cliente HTTP Andreani |
| `npm test -- --watch` | Modo watch (re-ejecuta al guardar) |
| `npm test -- --silent` | Sin `console.log` / `console.error` del código bajo test |

### Client (Next.js)

En `client/` hay tests de Vitest para el hook de resultado de checkout:

```bash
cd client
npm test
```

Archivo: `src/app/hooks/checkout/useCheckoutResult.test.ts` (6 tests).

---

## Estructura de archivos

```
api-maxshop/
├── jest.config.js
├── src/
│   ├── schemas/
│   │   └── checkout.schema.ts          # Zod de POST /ventas/checkout (compartido con routes)
│   ├── routes/
│   │   ├── ventas.routes.ts
│   │   └── __tests__/
│   │       └── ventas.checkout.schema.spec.ts
│   └── services/
│       ├── __mocks__/
│       │   └── productos.service.ts    # Mock manual para asserts de stock
│       └── __tests__/
│           ├── pricing.service.spec.ts
│           ├── mercado-pago.service.spec.ts
│           ├── payment-processing.service.spec.ts
│           ├── payment-webhook.service.spec.ts
│           └── factura-sync.service.spec.ts
│       └── utils/__tests__/
│           └── money.utils.spec.ts
│       └── andreani/__tests__/
│           └── andreani.api.service.spec.ts
```

---

## 1. Payment Processing (`payment-processing.service.spec.ts`)

**Qué prueba:** Flujo al **confirmar un pago** (`confirmPayment`), usado por webhooks MP, confirmación manual admin y vencimientos.

| Área | Casos |
|------|--------|
| Validación envío | Rechaza si falta dirección (venta con envío, no retiro) |
| Stock | Valida con `assertStockDisponibleParaLineas`, descuenta con `updateStock(-cantidad)` |
| Stock insuficiente | Lanza error; no actualiza venta ni descuenta |
| Estados | Rechaza `cancelado` y estados no confirmables; acepta `vencido` |
| Idempotencia | Si ya está `aprobado`, no email ni handlers |
| Email | Un solo envío; siempre `orderId`; tracking si hay envío Andreani; sin tracking en retiro |
| Resiliencia | Si falla el email SMTP, `confirmPayment` igual resuelve |

**Mocks:** Prisma, cache, mail, handlers, `VentasService.getById`, `ProductosService` (manual mock en `__mocks__/productos.service.ts`).

**Tests:** 12 · **Uso:** `npm test -- payment-processing`

---

## 2. Payment Webhook (`payment-webhook.service.spec.ts`)

**Qué prueba:** Procesamiento de **webhooks de Mercado Pago** (entrada del evento de pago).

| Área | Casos |
|------|--------|
| Validación | Payload sin `action` o `data.id`; ignora `type` distinto de `payment`; ignora acciones sin `"payment"` |
| Idempotencia | Mismo `paymentId` + mismo `status_mp` → `skipped`; distinto status → `updated` |
| Aprobado | `approved` → valida `transaction_amount` ≈ `total_neto` → `confirmPayment` + registro en `mercado_pago_payments` |
| Monto distinto | `approved` pero monto MP ≠ `total_neto` → no `confirmPayment`, nota en `observaciones`, venta sigue `pendiente` |
| Estados MP | `pending` / `in_process` → registra pago, no confirma, no cambia venta |
| | `authorized` → confirma como aprobado |
| | `cancelled` / `refunded` / `charged_back` → venta `cancelado`, sin confirmar |
| | Transición `pending` → `approved` → `updated` + confirmación |
| Rechazado | `rejected` → venta `rechazado`, sin `confirmPayment` |
| Errores | Fallo MP → `failed_webhooks` + `success: false`; sin `external_reference` → skipped |
| Lock | Dos webhooks en paralelo → uno procesa, otro `skipped` (fake timers) |

**Mapeo de referencia:** `MP_STATUS_TO_VENTA_STATUS` en `src/types/index.ts`.

**Mocks:** Prisma, `mercadoPagoService.getPayment`, `MercadoPagoService.extractVentaIdFromExternalReference`, `paymentProcessingService.confirmPayment`.

**Tests:** 21 · **Uso:** `npm test -- payment-webhook`

---

## 3. Mercado Pago (`mercado-pago.service.spec.ts`)

**Qué prueba:** Servicio de integración con la API de MP (preferencias y utilidades). **No** procesa webhooks.

### Utilidades estáticas

- `extractVentaIdFromExternalReference` (`venta_{id}` válido / inválido)
- `generateExternalReference`
- `isApprovedStatus`, `isPendingStatus`, `isRejectedStatus`

### `createPreferenceFromVenta`

- Happy path: items, `external_reference`, `currency_id: ARS`, `back_urls`
- **Precio final:** `unit_price` = `sub_total / cantidad` (no `precio_unitario` de lista); caso bonificación 10% (venta #49: cobra 1089, no 1210)
- Validación: suma ítems + envío debe coincidir con `total_neto` antes de llamar a MP
- Ítem **Envío** separado si `total_neto` > suma de líneas
- Errores: `total_neto` inválido, sin detalles, desajuste de totales
- Imágenes: ignora rutas locales Windows; acepta URLs `https://`
- Payer: sandbox sin email; producción con email
- Cuotas: `payment_methods.installments` cuando `maxInstallments > 1`
- `backUrls.success` obligatorio; `auto_return` cuando `useAutoReturn`

**Mocks:** `createPreference` espiado (sin HTTP real). Variables de entorno: `MERCADOPAGO_ENV`, `MERCADOPAGO_ACCESS_TOKEN_TEST`.

**Uso:** `npm test -- mercado-pago`

---

## 4. Checkout — validación (`ventas.checkout.schema.spec.ts`)

**Qué prueba:** Schema Zod de `POST /ventas/checkout` (mismo que usa el middleware de `ventas.routes.ts`).

Definido en: `src/schemas/checkout.schema.ts` (exportado como `checkoutBodySchema`).

| Caso | Resultado esperado |
|------|-------------------|
| Payload mínimo (`metodo_pago` + `detalles`) | Válido |
| Sin `metodo_pago` | Inválido |
| `detalles` vacío | Inválido |
| `cantidad` ≤ 0 | Inválido |
| Transferencia + dirección + `costo_envio` | Válido |
| Campos extra (`.strict()`) | Inválido |

**Tests:** 6 · **Uso:** `npm test -- ventas.checkout`

> **Nota:** No cubre aún `VentasService.createFromCheckout` (creación de venta, preferencia MP, invitado). Eso requiere mocks pesados de Prisma y quedó planificado para una siguiente iteración.

---

## 5. Factura Sync (`factura-sync.service.spec.ts`)

**Qué prueba:** Sincronización de **facturas desde FTP** (Tekno).

- Sin ventas pendientes → no conecta FTP
- Con ventas: conecta/desconecta una vez; busca `F4-0004-{cod_interno}.pdf` o `F4-0004-{id_venta 8 dígitos}`
- Encuentra PDF: descarga, emails (factura + tracking), borra FTP, estado `facturado`
- Sin PDF: `noEncontradas` + actualiza intentos
- Error en venta: `errores: 1` y **siempre** desconecta FTP en `finally`

**Tests:** 7 · **Uso:** `npm test -- factura-sync`

---

## 6. Pricing / bonificación (`pricing.service.spec.ts`)

**Qué prueba:** Cálculo unificado de precios (`buildPrecioPresentacion`, `computeLineaVentaPricing`).

- Producto lista $1210 con 10% bonificación → final $1089
- Línea de venta: `precio_unitario` lista, `descuento_aplicado` = monto bonificación, `sub_total` = final
- Coherencia con catálogo, carrito online y cobro MP (`sub_total / cantidad`)

**Uso:** `npm test -- pricing.service`

---

## 7. Money utils (`money.utils.spec.ts`)

**Qué prueba:** `roundMoney`, `amountsMatch`, `sumPreferenceItems` (integridad de montos MP/ventas).

**Uso:** `npm test -- money.utils`

---

## 8. Andreani API (`andreani.api.service.spec.ts`)

**Qué prueba:** Cliente HTTP de **Andreani** (token, reintentos, parsing). No cubre lógica de negocio (pre-envío, cotización en checkout).

- Header `x-authorization-token`
- Retry en 401 / 403
- `success: false` si respuesta no OK
- Parseo JSON y PDF binario

**Tests:** 8 · **Uso:** `npm test -- andreani.api`

---

## Resumen por archivo

| Archivo | Tests | Qué garantiza |
|---------|-------|----------------|
| `payment-processing.service.spec.ts` | 12 | Confirmación: stock, estados, email, idempotencia |
| `payment-webhook.service.spec.ts` | — | Webhook MP: estados, monto vs total_neto, idempotencia, lock |
| `mercado-pago.service.spec.ts` | — | Preferencia MP con precio final + utilidades |
| `pricing.service.spec.ts` | — | Lista, bonificación visible, subtotal final (caso #49) |
| `money.utils.spec.ts` | 3 | Redondeo y comparación de montos |
| `ventas.checkout.schema.spec.ts` | 6 | Payload válido/inválido del checkout |
| `factura-sync.service.spec.ts` | 7 | Sync facturas FTP |
| `andreani.api.service.spec.ts` | 8 | Cliente HTTP Andreani |

**Total API:** ejecutar `npm test` para el conteo actual (incluye pricing MP y validación de monto en webhook).

---

## Instalación con pnpm (recomendado)

El proyecto usa **pnpm** con `onlyBuiltDependencies` en `package.json` para permitir scripts nativos (Prisma, bcrypt). No mezcles `npm install` y `pnpm install` en el mismo folder.

```bash
cd api-maxshop
rm -rf node_modules
pnpm install          # ejecuta postinstall → prisma generate
npm run build
npm test
```

Si ves `ERR_PNPM_IGNORED_BUILDS`, los paquetes ya están listados en `package.json` → `pnpm.onlyBuiltDependencies`. Borrá `node_modules` y volvé a instalar.

**Jest:** versiones alineadas vía `pnpm.overrides` (jest 30.4.2). Si falla `clearMocksOnScope`, reinstalá limpio con pnpm.

**No instalar** `@types/csv-parse`: `csv-parse` v6 trae tipos propios; el stub en DefinitelyTyped rompe `tsc` con `typeRoots` custom.

### Client (Next.js)

```bash
cd client
rm -rf node_modules
pnpm install          # sharp, esbuild, firebase
pnpm run build
pnpm test
```

`pnpm.onlyBuiltDependencies` incluye: `sharp`, `esbuild`, `@firebase/util`, `protobufjs`.

---

## Configuración

- **Runner:** Jest 30 + `ts-jest`, entorno `node`
- **Config:** `jest.config.js` en la raíz de `api-maxshop`
- **Patrón:** `**/__tests__/**/*.spec.ts` y `**/*.spec.ts` bajo `src/`
- **Timeout por test:** 10 s

### Avisos conocidos

| Aviso | Causa | Acción |
|-------|--------|--------|
| `console.error` en salida | Tests que fuerzan errores esperados | Normal; usar `--silent` en CI si molesta |
| Worker no sale gracefully | Timers del test de lock del webhook | Usar `npm run test:ci` (`--forceExit`) |
| JEST-01 DeprecationWarning | Limpieza entre archivos | Tests válidos; ignorar o `--silent` |

---

## Añadir o cambiar tests

1. Crear `src/.../__tests__/mi-modulo.spec.ts` siguiendo el patrón existente.
2. Encabezado del archivo: objetivo, cómo ejecutar, qué se mockea.
3. Usar **builders** reutilizables (`buildVentaPendiente`, `buildWebhook`, `buildMpPayment`, `buildVenta` para MP).
4. Mockear siempre BD, APIs externas y emails; assert con `expect(mock).toHaveBeenCalledWith(...)`.
5. Para `ProductosService` en tests de `confirmPayment`, usar el mock manual:
   ```ts
   jest.mock('../productos.service', () => require('../__mocks__/productos.service'));
   import { productosMocks } from '../__mocks__/productos.service';
   ```
6. No importar `ventas.routes.ts` en tests de schema: importar desde `schemas/checkout.schema.ts` para evitar cargar Express/Firebase.

---

## Cobertura actual y huecos

### Cubierto con confianza

- Confirmación de pago post-aprobación (stock, email, envío)
- Webhook MP (idempotencia, estados, errores, concurrencia)
- Creación de preferencia MP desde venta (payload)
- Validación del body de checkout
- Sync de facturas FTP
- Cliente HTTP Andreani

### Pendiente (recomendado antes de prod solo con tests)

| Área | Prioridad |
|------|-----------|
| `VentasService.createFromCheckout` (crear venta + URL MP) | Alta |
| Retry de `failed_webhooks` | Media |
| Tests RTL en client (resultado checkout, layout admin) | Media |
| QA manual en MP sandbox (flujo E2E) | Obligatorio |

Checklist staging: ver `MERCADOPAGO_SETUP.md` y probar invitado, envío, retiro, transferencia y doble webhook.

---

## Referencias

- Setup MP: [MERCADOPAGO_SETUP.md](./MERCADOPAGO_SETUP.md)
- Cuotas MP: [CUOTAS_MERCADOPAGO.md](./CUOTAS_MERCADOPAGO.md)
- Facturas FTP: [FACTURAS_FTP.md](./FACTURAS_FTP.md)
- Andreani: [ANDREANI_INTEGRATION.md](./ANDREANI_INTEGRATION.md)
