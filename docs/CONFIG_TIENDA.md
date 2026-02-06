# Configuración Tienda (Promos)

## Descripción

Configuración de promociones de la tienda editables desde el admin:

- **Envío gratis**: monto mínimo de compra a partir del cual el envío es gratis.
- **Cuotas sin interés**: cantidad de cuotas (ej. 3) y monto mínimo de compra para acceder.

Los valores se almacenan en la tabla `negocio` (una fila por instalación). Si no hay fila o los campos son `null`, se usan valores por defecto.

## Base de datos

En `negocio` se agregaron:

| Campo                    | Tipo         | Descripción                          |
|--------------------------|--------------|--------------------------------------|
| `envio_gratis_minimo`    | Decimal(12,2)| Monto mínimo para envío gratis       |
| `cuotas_sin_interes`     | Int          | Número de cuotas (ej. 3)             |
| `cuotas_sin_interes_minimo` | Decimal(12,2) | Monto mínimo para cuotas sin interés |

Valores por defecto en código: 100000, 3, 80000.

Migración: `npx prisma migrate dev --name add_negocio_promos`

**Nota:** Si en el schema aparece un bloque huérfano después de `negocio` (líneas que empiezan con `@relation`, `venta_detalle`, `@@index` de productos), es un error previo del archivo: falta el `model productos { ... }` completo. Hay que restaurar ese modelo desde tu copia o control de versiones antes de ejecutar `prisma generate` o `prisma migrate`.

## API

### GET /api/config/tienda

- **Auth**: no requerida (público).
- **Respuesta**: `{ success: true, data: { envio_gratis_minimo, cuotas_sin_interes, cuotas_sin_interes_minimo } }`.
- Los números vienen como number. Si no hay configuración en BD, se devuelven los defaults.

### PUT /api/config/tienda

- **Auth**: Bearer token + rol ADMIN.
- **Body**: `{ envio_gratis_minimo?: number, cuotas_sin_interes?: number, cuotas_sin_interes_minimo?: number }`.
- **Respuesta**: `{ success: true, data: IConfigTienda }`.
- Actualiza la primera fila de `negocio`; si no existe, crea una con los valores enviados (o defaults).

## Frontend

- **Hook**: `useConfigTienda()` – React Query con `queryKey: ['config', 'tienda']`, `staleTime` largo (10 min). Cambia muy poco, por eso el cache es estable.
- **Mutación**: `useConfigTiendaMutation()` – al hacer éxito hace `invalidateQueries(['config', 'tienda'])` para revalidar en toda la app.
- **Helpers**: `getEnvioGratisMensaje(config)`, `getCuotasSinInteresMensaje(config)`, `getPromoMessages(config)` en `utils/promos-messages.ts` para mensajes consistentes en PromoBanner, AddToCartSection, BenefitsCards y admin.
- **Uso**: PromoBanner, AddToCartSection, ProductTabs, BenefitsCards y la página admin/config consumen la misma fuente (hook + helpers).

## Responsabilidades

- **Service**: única responsabilidad de leer/escribir config en BD.
- **Controller**: solo HTTP (request/response).
- **Componentes**: una responsabilidad cada uno; reciben `config` (del hook) y muestran mensajes vía helpers.
