# Vencimiento de ventas pendientes

## Descripción

Módulo que expira automáticamente las ventas con pago manual (efectivo/transferencia) que permanecen en estado **pendiente** más de N días sin confirmación. Las marca como **vencido** y registra la acción en auditoría y en `event_logs`.

- **Estados finales:** aprobado y cancelado no se modifican.
- **De vencido solo se puede pasar a aprobado** (revocación manual por admin).

## Variable de entorno

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `DIAS_VENCIMIENTO_VENTA` | number | 3 | Días sin confirmación después de los cuales una venta pendiente (efectivo/transferencia) se marca como vencida. |

## Cuándo se vence una venta

La condición para vencer es:

- `estado_pago = 'pendiente'`
- `metodo_pago` en `['efectivo', 'transferencia']`
- `creado_en` **estrictamente menor** que la **fecha límite**

La **fecha límite** se calcula como: **hoy − N días**, a las **00:00:00**.

El job corre **una vez al día a las 02:00** (timezone `America/Argentina/Buenos_Aires`).

### Ejemplo con `DIAS_VENCIMIENTO_VENTA=1`

- Creas una venta **miércoles 19/02 a las 15:00** (efectivo/transferencia, pendiente).
- **Jueves 20/02 a las 02:00** (próxima corrida del cron):
  - Fecha límite = 19/02 00:00.
  - Tu venta: `creado_en` = 19/02 15:00 → 15:00 no es &lt; 00:00 del mismo día → **no se vence**.
- **Viernes 21/02 a las 02:00**:
  - Fecha límite = 20/02 00:00.
  - Tu venta: `creado_en` = 19/02 15:00 → 19/02 15:00 &lt; 20/02 00:00 → **se marca como vencida**.

En la práctica: con **1 día**, una venta creada “ahora” se vence en la **madrugada del día siguiente a cumplir 1 día** (la segunda noche después de creada).

### Resumen por valor de N

| N (días) | Comportamiento |
|----------|----------------|
| 1 | Vence en la corrida de las 02:00 que ocurre cuando ya pasó más de 1 día desde `creado_en` (ej. creada el día 1 → vence en la madrugada del día 3). |
| 3 (default) | Igual lógica: vence cuando `creado_en` &lt; (hoy − 3 días) a las 00:00 en la corrida de las 02:00. |
| 0 | Fecha límite = hoy 00:00 → ventas creadas “hoy” no se vencerían en la corrida de hoy (creado_en no sería &lt; hoy 00:00); sí las de ayer. |

## API

### POST /api/ventas/expirar

Ejecuta manualmente el job de vencimiento (misma lógica que el cron).

- **Auth:** Bearer token + rol **ADMIN**.
- **Body:** ninguno.
- **200:** `{ success: true, data: { vencidasCount, ids, duracionMs } }`.
- **500:** error interno.

### POST /api/ventas/:id/aprobar-desde-vencido

Revoca el vencimiento: pasa la venta de **vencido** a **aprobado**. Solo permitido si la venta está en estado `vencido`.

- **Auth:** Bearer token + rol **ADMIN**.
- **Params:** `id` = `id_venta`.
- **Body:** ninguno.
- **200:** `{ success: true, data: { id_venta, estado_pago_anterior: 'vencido', estado_pago: 'aprobado' } }`.
- **400:** la venta no está en estado vencido (mensaje indica estado actual).
- **404:** venta no encontrada.
- **500:** error interno.

## Auditoría y logs

- Cada venta marcada como vencida genera un registro en **auditoria** con `accion: 'VENTA_VENCIDA'`, `tabla_afectada: 'venta'`.
- Cada ejecución del job (cron o POST /expirar) genera un registro en **event_logs** con `event_type: 'VENCIMIENTO_VENTAS_JOB'`, `payload` con `vencidasCount`, `ids`, `duracionMs`, `diasConfigurados`, `source: 'vencimiento-cron'` o desde el endpoint.
- La acción **VENTA_VENCIDA_APROBADA** se registra en auditoría cuando un admin aprueba una venta desde vencido.

## Integración

- **Cron:** se inicia en `index.ts` al arrancar el servidor (solo si no es Vercel). Schedule: `0 2 * * *` (02:00 diario).
- **Rutas:** definidas en `src/routes/vencimiento.routes.ts`, montadas en `/ventas` (antes de las rutas CRUD de ventas para que `/ventas/expirar` y `/ventas/:id/aprobar-desde-vencido` matcheen correctamente).
