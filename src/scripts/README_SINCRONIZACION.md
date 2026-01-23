# 📥 Sincronización de Bases de Datos desde FTP

Este sistema permite descargar automáticamente archivos .DBF desde el FTP del cliente, convertirlos a CSV y guardarlos en `backend/data/csv/`.

## 🚀 Uso

### Opción 1: Script desde línea de comandos

```bash
cd backend
npm run sincronizar-bases
```

### Opción 2: Endpoint API (Sincronización completa)

```bash
POST http://localhost:3001/api/dbf-converter/sincronizar
```

Este endpoint:
1. Se conecta al FTP
2. Descarga todos los archivos .DBF de `/Tekno/Bases`
3. Los convierte a CSV
4. Los guarda en `backend/data/csv/`

### Opción 3: Endpoint API (Conversión manual de un archivo)

```bash
POST http://localhost:3001/api/dbf-converter/convert
Content-Type: multipart/form-data
Body: { dbfFile: <archivo.dbf> }
```

Este endpoint permite subir un archivo .DBF local y convertirlo a CSV para ajustar el formato si es necesario.

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
