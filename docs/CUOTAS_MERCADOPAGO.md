# Cuotas sin interés y Mercado Pago

Este documento describe **solo** la funcionalidad de **3 cuotas sin interés** y su integración con Mercado Pago en MaxShop.

---

## Resumen

La tienda puede ofrecer **3 cuotas sin interés** en el checkout de Mercado Pago. La regla puede ser:

1. **Global:** según monto mínimo de compra (configuración en Admin → Configuración).
2. **Por producto:** cada producto puede forzar “siempre 3 cuotas”, “nunca 3 cuotas” o “usar la regla general”.

Lo importante: no es solo visual. Se envían a Mercado Pago los parámetros que **limitan** las opciones de cuotas en el checkout, de modo que el cliente solo vea hasta 3 cuotas cuando aplica, o ninguna cuando no aplica.

---

## Configuración global (Admin → Configuración)

En **Configuración del sistema** → **Reglas de negocio** → **Cuotas sin interés**:

- **Cantidad de cuotas:** número de cuotas (ej. 3).
- **Monto mínimo (pesos):** ej. 80.000.

Por defecto, las 3 cuotas se ofrecen **solo si el total de la venta es mayor o igual** a ese monto mínimo.

---

## Regla por producto

Cada producto tiene un campo **Cuotas** (en la edición del producto, paso “Estado”):

| Valor            | Significado                                                                 |
|------------------|-----------------------------------------------------------------------------|
| **Regla general**| Usar solo la configuración global: si el total de la venta ≥ mínimo, 3 cuotas. |
| **Siempre 3 cuotas** | Este producto hace que se ofrezcan 3 cuotas aunque el total del carrito no alcance el mínimo. |
| **No 3 cuotas**  | Si este producto está en el carrito, **no** se ofrecen 3 cuotas (aunque el total supere el mínimo). |

Se puede editar:

- **Por producto:** en el modal de edición, pestaña “Estado” → “3 cuotas sin interés (Mercado Pago)”.
- **En bulk:** en la tabla de productos, seleccionar varios y usar “3 cuotas sí”, “3 cuotas no” o “Regla general”.

---

## Cómo se envía a Mercado Pago

Al crear la **preferencia de pago** (cuando el cliente confirma el carrito y paga con Mercado Pago), el backend:

1. Obtiene la configuración global (cantidad de cuotas y monto mínimo).
2. Revisa los productos del carrito y sus `cuotas_habilitadas`.
3. Decide si esta venta aplica para 3 cuotas o no:
   - Si **algún** producto tiene “No 3 cuotas” → no ofrecer cuotas (solo 1 pago).
   - Si el **total ≥ mínimo** O **algún** producto tiene “Siempre 3 cuotas” → ofrecer N cuotas (ej. 3).
   - En cualquier otro caso → no ofrecer cuotas.
4. Envía a la API de Mercado Pago, dentro de la preferencia, el objeto `payment_methods`:

```json
{
  "payment_methods": {
    "default_installments": 3,
    "installments": 3
  }
}
```

- **`default_installments`:** cuotas que Mercado Pago sugiere por defecto (ej. 3).
- **`installments`:** **máximo** de cuotas que el usuario puede elegir. Si se envía `3`, el checkout solo muestra hasta 3 cuotas.

Así la oferta de 3 cuotas es **real**: el checkout de Mercado Pago solo muestra hasta ese número de cuotas (o 1 cuando no aplica).

---

## Dónde está implementado

| Parte | Archivo / lugar |
|-------|------------------|
| Config global (cuotas y monto mínimo) | Admin → Configuración; tabla `negocio`; `config-tienda.service.ts` |
| Decisión de cuotas por venta | `api-maxshop/src/services/ventas.service.ts` (antes de crear la preferencia) |
| Envío a Mercado Pago | `api-maxshop/src/services/mercado-pago.service.ts` (`payment_methods` con `installments` y `default_installments`) |
| Campo por producto | `productos.cuotas_habilitadas` (Prisma); edición en modal producto y bulk en tabla productos) |
| Bulk API | `PATCH /api/productos/bulk/cuotas` con `{ ids: number[], cuotas_habilitadas: true \| false \| null }` |

---

## Flujo resumido

1. El cliente arma el carrito y elige pagar con Mercado Pago.
2. El backend crea la venta y, para esa venta, calcula si aplican 3 cuotas según:
   - Config global (monto mínimo).
   - Override por producto (`cuotas_habilitadas` de cada ítem).
3. Crea la preferencia en Mercado Pago con `payment_methods.installments` y `payment_methods.default_installments` según ese resultado.
4. El usuario es redirigido al checkout de MP y ve solo las opciones de cuotas permitidas (ej. hasta 3, o 1).
5. El webhook y el procesamiento del pago no cambian; solo se usa la preferencia ya creada con las cuotas correctas.

---

## Referencia API Mercado Pago

- [Preferencias - payment_methods](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro/create-payment-preference): `installments` (máximo de cuotas) y `default_installments` (cuotas por defecto sugeridas).
