# Facturas en FTP (Tekno)

## Convenio de nombres

El sistema espera que las facturas subidas al FTP estén en la carpeta **`/Tekno/Facturas`** y sigan este formato de nombre:

```
F4-0004-{cod_interno}.pdf
```

Donde **`cod_interno`** es el **código de operación** de la venta en nuestro sistema.

### Formato de `cod_interno`

- Desde la migración de datos, todas las ventas tienen un código en formato: **`MAX-00000001`** (prefijo `MAX-` + `id_venta` a 8 dígitos).
- Ejemplos:
  - Venta con `id_venta = 1` → `cod_interno = MAX-00000001` → archivo: **`F4-0004-MAX-00000001.pdf`**
  - Venta con `id_venta = 123` → `cod_interno = MAX-00000123` → archivo: **`F4-0004-MAX-00000123.pdf`**

### Coordinación con el ERP / sistema de facturación

El sistema que genera los PDF (ERP, Tekno, etc.) debe:

1. Conocer el **código de operación** de la venta (ej. `MAX-00000001`).
2. Subir el archivo al FTP en `/Tekno/Facturas` con el nombre **`F4-0004-{cod_interno}.pdf`** (sin espacios; el código tal cual, con guión en `MAX-`).

El sync de facturas (`FacturaSyncService`) lista los archivos del FTP, hace coincidencia por ese nombre, descarga la factura, envía el email al cliente (mostrando el mismo número de pedido) y actualiza el estado de la venta a "facturado".

### Compatibilidad con ventas antiguas

Si alguna venta no tuviera `cod_interno` (caso legacy), el sistema busca el archivo usando `id_venta` a 8 dígitos: **`F4-0004-00000123.pdf`**. Se recomienda que todas las ventas tengan `cod_interno` en formato MAX-00000001.
