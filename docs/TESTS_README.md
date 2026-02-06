# Tests del API MaxShop

## Qué está implementado

- **Tests de confirmación de pago** (`src/services/__tests__/payment-processing.service.spec.ts`): garantizan que al confirmar un pago se descuenta stock, se actualiza el estado, se ejecutan los handlers (Andreani, etc.) y, **sobre todo**, que se envía **un email al cliente** con:
  - **Número de pedido (orderId)** siempre.
  - **Número de seguimiento (trackingCode) y transportista (carrier)** cuando la venta tiene envío (no es retiro en tienda).

Así se asegura que el cliente reciba el correo con el número de pedido y, si aplica, el código para hacer seguimiento del envío.

## Cómo ejecutar los tests

Desde la raíz del backend (`api-maxshop`):

```bash
npm test
```

Solo el archivo de payment-processing:

```bash
npx jest payment-processing
```

Modo watch (re-ejecuta al guardar):

```bash
npm run test:watch
```

## Cómo cambiar o ampliar los tests

### Añadir un nuevo caso

1. Abre `src/services/__tests__/payment-processing.service.spec.ts`.
2. Dentro del `describe` que corresponda, añade un bloque:
   ```ts
   it('descripción del comportamiento', async () => {
     // Configurar ventasState.getById con mockResolvedValueOnce / mockResolvedValue
     // Llamar a service.confirmPayment(idVenta)
     // expect(mailService.sendOrderConfirmation).toHaveBeenCalledWith(...)
   });
   ```

### Probar otra venta (más productos, otro cliente)

- Usa las funciones helper `buildVentaPendiente()`, `buildVentaAprobadaSinEnvio()`, `buildVentaAprobadaConEnvio()` y pásales un objeto con `overrides` para cambiar campos.
- Configura `ventasState.getById` con `mockResolvedValueOnce(venta1).mockResolvedValueOnce(venta2)...` en el orden en que el servicio llama a `getById` (primera vez: venta pendiente; segunda: después de actualizar estado; tercera: después de `runHandlersAndEmit`, si hay envío).

### Comprobar que se envió el email con datos concretos

```ts
const call = (mailService.sendOrderConfirmation as jest.Mock).mock.calls[0][0];
expect(call.orderId).toBe(999);
expect(call.trackingCode).toBe('...');
expect(call.cliente.email).toBe('...');
```

### Qué está mockeado (y por qué)

| Módulo | Qué se simula | Motivo |
|--------|----------------|--------|
| `prisma` | `venta.update` | No usar BD real en tests |
| `cache.service` | `delete`, `deletePattern` | No depender de Redis |
| `mail` | `sendOrderConfirmation` | No enviar emails; solo comprobar que se llama con los datos correctos |
| `handler-executor.service` | `runHandlersAndEmit` | No llamar a Andreani ni otros handlers reales |
| `ventas.service` | `VentasService().getById` | Controlar qué venta “devuelve” la BD en cada paso |
| `productos.service` | `ProductosService().updateStock` | No modificar stock real |

## Cambio de flujo: email con número de seguimiento

Para que el cliente reciba el número de seguimiento en el mismo email de confirmación, el flujo hace lo siguiente:

1. **Antes:** Se emitía `SALE_CREATED` al event bus y se enviaba el email de inmediato con la venta actual. Como los handlers (Andreani) se ejecutaban en paralelo, la venta aún no tenía `envio.cod_seguimiento` y el email salía sin tracking.

2. **Ahora:** En `PaymentProcessingService.confirmPayment` se llama a `handlerExecutorService.runHandlersAndEmit(SALE_CREATED, payload)`, que **espera** a que terminen todos los handlers (incluido Andreani). Luego se vuelve a leer la venta con `getById` y se envía el email con esa venta ya actualizada (con `envio.cod_seguimiento` si Andreani creó el envío).

Los tests verifican que, cuando la venta tiene envío, el payload de `sendOrderConfirmation` incluye `trackingCode` y `carrier`.

## Configuración de Jest

- **Archivo:** `jest.config.js` en la raíz de `api-maxshop`.
- **Tests:** por defecto se ejecutan los `*.spec.ts` bajo `src/`.
- Para cambiar timeout, cobertura o qué archivos se incluyen, edita `jest.config.js`.
