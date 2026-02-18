# Módulo de subida de imágenes

Documentación del flujo de upload de imágenes (productos y banners) en **backend** y **front**: configuración, endpoints, servicios, hooks y UI.

---

## Backend

### Configuración centralizada

**Archivo:** `src/config/upload.config.ts`

| Variable | Uso |
|----------|-----|
| `UPLOAD_ROOT` | Ruta base en disco de archivos públicos (ej. `/opt/files`). Por defecto `../files` respecto a `process.cwd()`. En producción usar `process.env.UPLOAD_ROOT`. |
| `FILES_BASE_URL` | URL base para servir archivos (ej. `https://files.maxshop.com.ar`). El front concatena esta URL + path de BD. |
| `UPLOAD_MAX_FILE_SIZE` | Tamaño máximo por archivo (bytes). Por defecto 5 MB. |
| `UPLOAD_ALLOWED_MIMES` | MIME permitidos: `image/jpeg`, `image/png`, `image/webp`. |
| `UPLOAD_MAX_PER_DAY` | Máximo de imágenes que un usuario puede subir por día (productos + banners). Por defecto 150. |
| `UPLOAD_AUDIT_ACTION` | Valor de `accion` en tabla `auditoria` para contar uploads diarios. |
| `UPLOAD_FIELD_NAME` | Nombre del campo en el formulario multipart: `"image"`. |

**Cambio de carpeta o dominio:** ajustar solo `UPLOAD_ROOT` y/o `FILES_BASE_URL` (o sus env).

---

### Utilidades (`src/utils/upload.utils.ts`)

| Función | Descripción |
|---------|-------------|
| `getMimeAndExtensionFromBuffer(buffer)` | Detecta MIME por magic bytes (JPEG/PNG/WebP). Devuelve `{ mime, ext }` o `null`. |
| `buildProductImagePath(idProd, extension)` | Path relativo imagen principal: `productos/[id]/[id].[ext]`. |
| `buildProductSecondaryImagePath(idProd, index, extension)` | Path relativo imagen secundaria: `productos/[id]/[id]_[N].[ext]` (N = 2, 3, …). |
| `getNextProductSecondaryIndex(idProd)` | Siguiente índice para secundaria leyendo la carpeta del producto en disco. |
| `buildBannerPath(index, extension)` | Path relativo banner: `banners/banner-[N].[ext]`. |
| `getNextBannerIndex()` | Siguiente número para banner (1, 2, …) leyendo carpeta banners. |
| `isAllowedExtension(ext)` | Comprueba extensión en whitelist. |

---

### Servicio (`src/services/upload.service.ts`)

| Método | Descripción |
|--------|-------------|
| `uploadProductImage(idProd, file, userId)` | Valida producto, límite diario y archivo; guarda como `[id].[ext]`; actualiza `productos.img_principal`; auditoría e invalidación de cache. |
| `uploadProductSecondaryImage(idProd, file, userId)` | Igual validación; guarda como `[id]_[N].[ext]` (siguiente N); **appendea** el path a `productos.imagenes` (JSON); auditoría e invalidación de cache. |
| `uploadBanner(file, userId)` | Guarda en `banners/banner-[N].[ext]`; no actualiza BD; devuelve path. |

---

### Controlador y rutas

| Ruta | Método | Descripción |
|------|--------|-------------|
| `POST /upload/productos/:id` | `uploadProductImage` | Imagen principal; actualiza `productos.img_principal`. |
| `POST /upload/productos/:id/imagenes` | `uploadProductSecondaryImage` | Imagen secundaria; appendea a `productos.imagenes`. |
| `POST /upload/banners` | `uploadBanner` | Banner; devuelve path. |

Todas requieren: `verifyFirebaseToken` → `loadUserFromDatabase` → `requireRole('ADMIN')` y multipart con campo `image`. Multer en memoria para validar por magic bytes.

---

### Base de datos (productos)

- **`img_principal`:** un path relativo (ej. `productos/123/123.jpg`). Posición 1.
- **`imagenes`:** JSON array de paths relativos (ej. `["productos/123/123_2.jpg","productos/123/123_3.jpg"]`). Posiciones 2, 3, …

El front concatena `FILES_BASE_URL + "/" + path` para mostrar la imagen.

---

## Front (client)

### Configuración y utilidad

| Archivo | Uso |
|---------|-----|
| `src/app/lib/upload.ts` | `FILES_BASE_URL` (env `NEXT_PUBLIC_FILES_BASE_URL` o default `https://files.maxshop.com.ar`). `buildImageUrl(path)` devuelve la URL pública para mostrar imágenes. |
| `src/app/types/upload.type.ts` | `UploadResponse`, `UploadResult` para respuestas del API. |

---

### Servicio (`src/app/services/upload.service.ts`)

| Función | Descripción |
|---------|-------------|
| `uploadProductImage(idProd, file)` | `POST /upload/productos/:id` con FormData `image`. Devuelve `{ path, url }`. |
| `uploadProductSecondaryImage(idProd, file)` | `POST /upload/productos/:id/imagenes` con FormData `image`. Devuelve `{ path, url }`. |
| `uploadBanner(file)` | `POST /upload/banners`. Devuelve `{ path, url }`. |

Usa `axiosInstance` (token y base URL ya configurados).

---

### Hooks (`src/app/hooks/upload/`)

| Hook | Uso |
|------|-----|
| `useUploadProductImage(options?)` | Mutación para imagen principal; invalida queries de productos; toast; devuelve `uploadProductImage`, `uploadProductImageAsync`, `isUploading`, etc. |
| `useUploadProductSecondaryImage(options?)` | Mutación para imagen secundaria; misma invalidación; toast; devuelve `uploadSecondaryImage`, `uploadSecondaryImageAsync`, `isUploading`, etc. |
| `useUploadBanner(options?)` | Mutación para banner; toast; devuelve `uploadBanner`, `uploadBannerAsync`, `isUploading`, etc. |

Re-export en `hooks/upload/index.ts`.

---

### UI: producto (imagen principal + secundarias)

**Numeración:** 1 = imagen principal (`img_principal`), 2+ = galería (`imagenes[]`). Todas las previsualizaciones usan **`object-contain`** para mantener la proporción.

#### Componente reutilizable: `ProductoImagenesEditor`

**Ubicación:** `src/app/components/modals/Producto/ProductoImagenesEditor.tsx`

- **Props:** `mode: 'create' | 'edit'`, `product?`, `mainFile`, `setMainFile`, `secondaryFiles`, `setSecondaryFiles`, `existingSecondaryPaths?`, `setExistingSecondaryPaths?`.
- **Create:** solo slots para principal (1) y secundarias (2+); estado local con `File` y `File[]`.
- **Edit:** muestra imagen principal actual y lista de secundarias; permite reemplazar principal, agregar secundarias y quitar secundarias existentes (actualiza `existingSecondaryPaths`).

Se usa en el **step final de creación** y en el **modal “Cambiar imagen”** al editar.

#### Crear producto (CreateWrapper)

- **Step 3 “Imágenes”:** contenido = `ProductoImagenesEditor` en modo `create` con estado `mainFile` y `secondaryFiles` del wrapper.
- **Al completar (step 3):** 1) crear producto con datos del form (sin imágenes); 2) si hay `mainFile` → `uploadService.uploadProductImage(id, mainFile)`; 3) por cada `secondaryFiles` → `uploadService.uploadProductSecondaryImage(id, file)`; 4) invalidar queries, toast, cerrar y resetear estado.

#### Editar imágenes (Cambiar imagen)

- **Acción en tabla:** en el menú de acciones del producto se añadió “Cambiar imagen” (opcional: solo si se pasa `onCambiarImagen` al wrapper).
- **Modal:** `CambiarImagenModal` recibe `product` y `onClose`. Usa `ProductoImagenesEditor` en modo `edit` con `existingSecondaryPaths` (inicialmente `product.imagenes`) y permite quitar secundarias.
- **Al guardar:** si hay `mainFile` → upload principal; por cada `secondaryFiles` → upload secundaria; luego `productosService.update(id, { img_principal, imagenes })` con `imagenes = existingSecondaryPaths + newPaths` (array final deseado).

---

## Cambios a futuro

1. **Cambiar carpeta o dominio:** Back: `UPLOAD_ROOT` / `FILES_BASE_URL`. Front: `FILES_BASE_URL` o `NEXT_PUBLIC_FILES_BASE_URL`.
2. **Más formatos (ej. AVIF):** Back: magic bytes y config; front: aceptar en inputs si el back los permite.
3. **Límite por tipo (productos vs banners):** Contar por tipo en auditoría y aplicar límites distintos.
4. **Asociar banner a evento:** Endpoint o flujo que actualice `eventos.banner_img` con el path devuelto por upload de banners.
5. **Redimensionado/optimización:** Back: post-upload con sharp/jimp para thumbs o WebP.
6. **Eliminar imagen antigua al reemplazar:** En `uploadProductImage` (y opcionalmente al actualizar `imagenes`), borrar del disco los archivos que ya no estén en BD.
7. **Rate limit por IP** en rutas `/upload/*`.
