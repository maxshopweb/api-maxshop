# Esquema Prisma y migraciones

Resumen del modelo de datos y migraciones recientes para que el equipo pueda aplicar cambios y entender la estructura.

## Migración: Productos – Listas de precio (20260202120000)

**Carpeta:** `prisma/migrations/20260202120000_productos_listas_precio/`

### Cambios en la tabla `productos`

- **Columnas añadidas:**
  - `precio_venta` (DECIMAL) — lista V
  - `precio_especial` (DECIMAL) — lista O
  - `precio_pvp` (DECIMAL) — lista P
  - `precio_campanya` (DECIMAL) — lista Q
  - `lista_precio_activa` (VARCHAR(1)) — `"V"` | `"O"` | `"P"` | `"Q"`

- **Migración de datos:** El antiguo `precio` se copió a `precio_venta` y `lista_precio_activa` se fijó en `'V'` por defecto.

- **Columnas eliminadas:**  
  `precio`, `precio_sin_iva`, `iva_monto`, `id_interno`, `cod_sku`, `modelo`, `precio_mayorista`, `precio_minorista`, `precio_evento`, `stock_mayorista`.

### Aplicar la migración

```bash
cd backend
npx prisma migrate deploy
# o en desarrollo:
npx prisma migrate dev
```

---

## Tablas de referencia (desde CSV)

El schema incluye tablas de referencia importadas desde CSV del sistema externo:

| Tabla Prisma      | Uso principal                          |
|-------------------|----------------------------------------|
| `lista_precio`    | Listas de precio (V, O, P, Q, etc.)    |
| `situacion_fiscal`| Situación fiscal (códigos/impositivo)  |
| `provincia`       | Provincias (códigos/alícuotas)         |
| `plataforma_pago` | Plataformas de pago                    |
| `forma_pago`      | Formas de pago                         |

Las relaciones con **productos** siguen siendo por códigos: `codi_categoria`, `codi_marca`, `codi_grupo`, `codi_impuesto`. Los productos usan `lista_precio_activa` para indicar qué precio está en uso (V/O/P/Q).

---

## Resumen para el equipo

- Después de hacer pull: ejecutar `npx prisma migrate deploy` (o `migrate dev` en desarrollo) para aplicar la migración de listas de precio.
- Crear/actualizar productos requiere al menos uno de: `precio_venta`, `precio_especial`, `precio_pvp`, `precio_campanya`. Ver `docs/API_DOCUMENTATION.md` (Productos).

**Última actualización:** 2026-02-03
