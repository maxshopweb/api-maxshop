# 📥 Sincronización de Bases de Datos desde FTP

Este sistema permite descargar automáticamente archivos .DBF desde el FTP del cliente, convertirlos a CSV, importarlos a la BD y mantener el catálogo actualizado.

## 🚀 Uso

### Opción 1: Worker automático (recomendado)

Al levantar el servidor (`npm run dev` o `npm start`), el **catalogo-sync-worker** (`src/services/catalogo-sync-worker.service.ts`):
- Ejecuta una sincronización completa **15 segundos** después del arranque.
- Luego repite la sincronización **cada 20 minutos** (cron).
- Si una ejecución sigue en curso, se omite la siguiente hasta que termine.

### Opción 2: Endpoints API (sincronización)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/sincronizacion/completa` | FTP → DBF → CSV → BD (completo). Body opcional: `{ "force": boolean }`. |
| POST | `/api/sincronizacion/actualizar-catalogo` | Mismo flujo que `completa`. |
| POST | `/api/sincronizacion/importar` | Solo importa CSV a BD (CSV en `backend/data/csv`). Body opcional: `{ "csvDir": string }`. |
| GET | `/api/sincronizacion/estado` | Estado de la última sincronización. |

Ejemplo:
```bash
POST http://localhost:3000/api/sincronizacion/completa
GET  http://localhost:3000/api/sincronizacion/estado
```

### Opción 3: Script desde línea de comandos

```bash
cd backend
npm run sincronizar-bases
```

### Opción 4: Conversión DBF manual (dbf-converter)

```bash
POST http://localhost:3000/api/dbf-converter/sincronizar
```
Descarga .DBF de `/Tekno/Bases`, convierte a CSV y guarda en `backend/data/csv/` (no importa a BD).

```bash
POST http://localhost:3000/api/dbf-converter/convert
Content-Type: multipart/form-data
Body: { dbfFile: <archivo.dbf> }
```
Sube un .DBF local y lo convierte a CSV.

## 📋 Configuración

Las credenciales FTP están en `backend/.env`:

```env
FTP_HOST="181.4.229.169"
FTP_USER="maxshop"
FTP_PASSWORD="ShopCBA2025**"
FTP_PORT=21
```

## 📁 Estructura

- **FTP**: `/Tekno/Bases` - Archivos .DBF del cliente
- **Temporal**: `backend/temp/dbf/` - Archivos descargados (se limpian automáticamente)
- **Salida**: `backend/data/csv/` - Archivos CSV convertidos

## 🔄 Formato CSV

El formato CSV generado replica exactamente el formato de los archivos de referencia en `data/csv/`:

1. **Primera línea**: Metadatos de columnas en formato `"NOMBRE,TIPO,LONGITUD,PRECISION"`
2. **Resto de líneas**: Datos separados por comas
3. **Números con decimales**: Entre comillas con coma como separador (ej: `"11382,746835"`)
4. **Números enteros**: Sin comillas
5. **Fechas**: Formato DD/MM/YYYY
6. **Encoding**: UTF-8

## 🛠️ Componentes

- **`ftp.service.ts`**: Maneja la conexión y descarga desde FTP
- **`dbf-converter.service.ts`**: Convierte DBF a CSV con formato exacto
- **`sincronizar-bases.ts`**: Script principal que orquesta todo el proceso
- **`dbf-converter.controller.ts`**: Endpoints API para conversión manual

## ⚠️ Notas

- Los archivos temporales se eliminan automáticamente después de la conversión
- Si un archivo falla en la conversión, el proceso continúa con los demás
- El formato CSV debe ser exacto para que los scripts de importación funcionen correctamente
