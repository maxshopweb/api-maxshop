# Guía de Importación de Datos CSV

## Archivos Creados

1. **`prisma/schema_final.prisma`** - Schema de Prisma con todas las tablas necesarias
2. **`src/scripts/importarCSV.ts`** - Script de importación desde CSV

## Estructura del Schema

### Tablas de Referencia (desde CSV)
- **categoria** - Con `codi_categoria` (CODICATE) como código único
- **marca** - Con `codi_marca` (CODIMARC) como código único
- **grupo** - Con `codi_grupo` (CODIGRAR) como código único
- **iva** - Con `codi_impuesto` (CODIIMPU) como código único

### Tabla Productos
La tabla `productos` incluye:
- `codi_arti` (CODIARTI) - Código único del producto
- `nombre` (DESCARTI)
- Relaciones por código: `codi_categoria`, `codi_marca`, `codi_grupo`, `codi_impuesto`
- **Listas de precio:** `precio_venta` (V), `precio_especial` (O), `precio_pvp` (P), `precio_campanya` (Q), `lista_precio_activa` (V|O|P|Q)
- `unidad_medida` (UNMEARTI), `unidades_por_producto` (UNENARTI)
- `codi_barras` (PARTARTI), `stock` (desde MAESSTOK), `img_principal` (IMAGARTI), `activo` (ACTIARTI)

Ver `docs/PRISMA_SCHEMA.md` para la migración de listas de precio.

## Pasos para Importar

### 1. Generar el Schema en la Base de Datos

```bash
cd backend
npx prisma migrate dev --name import_csv_data --schema=prisma/schema_final.prisma
```

O si prefieres usar el schema final como principal:

```bash
# Copiar schema_final.prisma a schema.prisma (hacer backup primero)
cp prisma/schema.prisma prisma/schema_backup.prisma
cp prisma/schema_final.prisma prisma/schema.prisma

# Generar migración
npx prisma migrate dev --name import_csv_data
```

### 2. Generar el Cliente de Prisma

```bash
npx prisma generate --schema=prisma/schema_final.prisma
```

### 3. Ejecutar la Importación

```bash
# Con ts-node
npx ts-node src/scripts/importarCSV.ts

# O compilar y ejecutar
npm run build
node dist/scripts/importarCSV.js
```

## Consultas de Ejemplo

### Obtener productos con todas las relaciones

```typescript
const productos = await prisma.productos.findMany({
  include: {
    categoria: true,  // Relación por codi_categoria (CODICATE)
    marca: true,      // Relación por codi_marca (CODIMARC)
    grupo: true,      // Relación por codi_grupo (CODIGRAR)
    iva: true,       // Relación por codi_impuesto (CODIIMPU)
  },
  where: {
    activo: 'A',
    estado: 1,
  },
});
```

### Obtener productos con filtros usando códigos CSV

```typescript
const productos = await prisma.productos.findMany({
  where: {
    codi_grupo: '0001',      // Filtrar por código de grupo
    codi_categoria: '0002',   // Filtrar por código de categoría
    precio_venta: { gt: 0 },
    stock: { gt: 0 },
  },
  include: {
    grupo: { select: { nombre: true, codi_grupo: true } },
    categoria: { select: { nombre: true, codi_categoria: true } },
    marca: { select: { nombre: true, codi_marca: true } },
    iva: { select: { nombre: true, porcentaje: true, codi_impuesto: true } },
  },
});
```

### Nota importante sobre las relaciones

Las relaciones se hacen usando los **códigos del CSV directamente**:
- `codi_categoria` (CODICATE) → relaciona con `categoria.codi_categoria`
- `codi_marca` (CODIMARC) → relaciona con `marca.codi_marca`
- `codi_grupo` (CODIGRAR) → relaciona con `grupo.codi_grupo`
- `codi_impuesto` (CODIIMPU) → relaciona con `iva.codi_impuesto`

Cada tabla de referencia tiene su `id` autoincrement para ordenamiento interno, pero las relaciones se hacen por los códigos únicos del CSV.

## Notas

- El script procesa los productos en lotes de 100 para mejor rendimiento
- Usa `upsert` para evitar duplicados (basado en `codi_arti`)
- El cálculo de IVA se hace automáticamente basado en el porcentaje del impuesto
- El stock se suma de todos los depósitos en MAESSTOK.csv

### Variable de entorno para pruebas (stock)

Si MAESSTOK aún viene en 0 y quieres probar con stock fijo, en el `.env` del backend puedes definir:

```env
IMPORT_STOCK_OVERRIDE=100
```

En la importación/sincronización, todos los productos usarán ese valor como stock. **Quita o comenta esta variable cuando tengas el archivo MAESSTOK final** para que se use el stock real del CSV.

