# 📚 Documentación de API - MaxShop Backend

## Base URL
```
http://localhost:3000/api
```

---

## 📦 PRODUCTOS

### 1. Obtener todos los productos (con filtros)

**Endpoint:** `GET /api/productos`

**Descripción:** Obtiene una lista paginada de productos con filtros opcionales.

**Query Parameters:**
- `page` (number, opcional): Número de página (default: 1)
- `limit` (number, opcional): Cantidad de productos por página (default: 100)
- `order_by` (string, opcional): Campo para ordenar (`precio`, `nombre`, `creado_en`, `stock`) (default: `creado_en`)
- `order` (string, opcional): Orden (`asc` o `desc`) (default: `desc`)
- `estado` (number, opcional): Estado del producto (0=eliminado, 1=activo, 2=inactivo) (default: 1)
- `busqueda` (string, opcional): Búsqueda por nombre, descripción, código de artículo, código de barras o SKU
- `id_cat` (number | string, opcional): ID o código de categoría
- `id_marca` (number | string, opcional): ID o código de marca
- `codi_grupo` (string, opcional): Código de grupo
- `codi_impuesto` (string | number, opcional): Código o ID de impuesto/IVA
- `precio_min` (number, opcional): Precio mínimo
- `precio_max` (number, opcional): Precio máximo
- `destacado` (boolean, opcional): Filtrar por productos destacados
- `financiacion` (boolean, opcional): Filtrar por productos con financiación
- `stock_bajo` (boolean, opcional): Filtrar productos con stock bajo (stock <= stock_min)

**Ejemplo de solicitud:**
```http
GET /api/productos?page=1&limit=50&id_cat=0001&precio_min=1000&precio_max=50000&order_by=precio&order=asc
```

**Respuesta exitosa (200):**
```json
{
  "data": [
    {
      "id_prod": 1,
      "codi_arti": "621450",
      "nombre": "Producto Ejemplo",
      "descripcion": "Descripción del producto",
      "precio": 25000.00,
      "precio_sin_iva": 21008.40,
      "iva_monto": 3991.60,
      "stock": 15,
      "stock_min": 10,
      "unidad_medida": "UN",
      "unidades_por_producto": 1,
      "codi_barras": "7791234567890",
      "img_principal": "621450-01.png",
      "activo": "A",
      "estado": 1,
      "destacado": true,
      "financiacion": false,
      "codi_categoria": "0001",
      "codi_marca": "010",
      "codi_grupo": "0005",
      "codi_impuesto": "21",
      "categoria": {
        "id_cat": 1,
        "codi_categoria": "0001",
        "nombre": "Categoría Ejemplo",
        "descripcion": "Descripción de categoría"
      },
      "marca": {
        "id_marca": 1,
        "codi_marca": "010",
        "nombre": "Marca Ejemplo",
        "descripcion": "Descripción de marca"
      },
      "grupo": {
        "id_grupo": 1,
        "codi_grupo": "0005",
        "nombre": "Grupo Ejemplo",
        "descripcion": "Descripción de grupo"
      },
      "iva": {
        "id_iva": 1,
        "codi_impuesto": "21",
        "nombre": "IVA 21%",
        "porcentaje": 21
      }
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 50,
  "totalPages": 3
}
```

---

### 2. Obtener producto por ID

**Endpoint:** `GET /api/productos/:id`

**Descripción:** Obtiene un producto específico por su ID.

**Path Parameters:**
- `id` (number, requerido): ID del producto

**Ejemplo de solicitud:**
```http
GET /api/productos/1
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "id_prod": 1,
    "codi_arti": "621450",
    "nombre": "Producto Ejemplo",
    "descripcion": "Descripción del producto",
    "precio": 25000.00,
    "precio_sin_iva": 21008.40,
    "iva_monto": 3991.60,
    "stock": 15,
    "categoria": { ... },
    "marca": { ... },
    "grupo": { ... },
    "iva": { ... }
  }
}
```

**Respuesta de error (404):**
```json
{
  "success": false,
  "error": "Producto no encontrado o inactivo"
}
```

---

### 3. Obtener producto por código (codi_arti)

**Endpoint:** `GET /api/productos/codigo/:codigo`

**Descripción:** Obtiene un producto específico por su código de artículo.

**Path Parameters:**
- `codigo` (string, requerido): Código del producto (codi_arti)

**Ejemplo de solicitud:**
```http
GET /api/productos/codigo/621450
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "id_prod": 1,
    "codi_arti": "621450",
    "nombre": "Producto Ejemplo",
    ...
  }
}
```

---

### 4. Obtener productos con imágenes

**Endpoint:** `GET /api/productos/con-imagenes`

**Descripción:** Obtiene solo los productos que tienen imágenes en la carpeta `resources/IMAGENES/img-art/`. Verifica si existe alguna imagen cuyo nombre comience con el `codi_arti` del producto.

**Query Parameters:** (Mismos que el endpoint GET /api/productos)

**Ejemplo de solicitud:**
```http
GET /api/productos/con-imagenes?page=1&limit=50&id_cat=0001
```

**Respuesta exitosa (200):**
```json
{
  "data": [
    {
      "id_prod": 1,
      "codi_arti": "621450",
      "nombre": "Producto Ejemplo",
      ...
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 50,
  "totalPages": 1
}
```

---

### 5. Obtener productos destacados

**Endpoint:** `GET /api/productos/destacados`

**Descripción:** Obtiene productos destacados con stock disponible.

**Query Parameters:**
- `limit` (number, opcional): Cantidad de productos (default: 10)

**Ejemplo de solicitud:**
```http
GET /api/productos/destacados?limit=20
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": [
    {
      "id_prod": 1,
      "codi_arti": "621450",
      "nombre": "Producto Destacado",
      "destacado": true,
      ...
    }
  ]
}
```

---

### 6. Obtener productos con stock bajo

**Endpoint:** `GET /api/productos/stock-bajo`

**Descripción:** Obtiene productos donde el stock es menor o igual al stock mínimo.

**Ejemplo de solicitud:**
```http
GET /api/productos/stock-bajo
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": [
    {
      "id_prod": 1,
      "codi_arti": "621450",
      "nombre": "Producto con Stock Bajo",
      "stock": 5,
      "stock_min": 10,
      ...
    }
  ]
}
```

---

### 7. Crear producto

**Endpoint:** `POST /api/productos`

**Descripción:** Crea un nuevo producto.

**Body (JSON):**
```json
{
  "codi_arti": "621450",
  "nombre": "Nuevo Producto",
  "descripcion": "Descripción del nuevo producto",
  "precio": 25000.00,
  "codi_categoria": "0001",
  "codi_marca": "010",
  "codi_grupo": "0005",
  "codi_impuesto": "21",
  "stock": 20,
  "unidad_medida": "UN",
  "unidades_por_producto": 1,
  "codi_barras": "7791234567890",
  "img_principal": "621450-01.png",
  "destacado": false,
  "precio_mayorista": 20000.00,
  "precio_minorista": 25000.00
}
```

**Campos requeridos:**
- `codi_arti` (string): Código único del producto
- `nombre` (string): Nombre del producto
- `precio` (number): Precio del producto

**Campos opcionales:**
- `descripcion` (string)
- `codi_categoria` (string): Código de categoría
- `codi_marca` (string): Código de marca
- `codi_grupo` (string): Código de grupo
- `codi_impuesto` (string): Código de impuesto/IVA
- `stock` (number)
- `unidad_medida` (string)
- `unidades_por_producto` (number)
- `codi_barras` (string)
- `img_principal` (string)
- `destacado` (boolean)
- `precio_mayorista` (number)
- `precio_minorista` (number)

**Ejemplo de solicitud:**
```http
POST /api/productos
Content-Type: application/json

{
  "codi_arti": "621450",
  "nombre": "Nuevo Producto",
  "precio": 25000.00,
  "codi_categoria": "0001",
  "codi_marca": "010"
}
```

**Respuesta exitosa (201):**
```json
{
  "success": true,
  "data": {
    "id_prod": 1,
    "codi_arti": "621450",
    "nombre": "Nuevo Producto",
    ...
  },
  "message": "Producto creado exitosamente"
}
```

**Respuesta de error (400):**
```json
{
  "success": false,
  "error": "La marca especificada (código: 010) no existe"
}
```

---

### 8. Actualizar producto

**Endpoint:** `PUT /api/productos/:id`

**Descripción:** Actualiza un producto existente.

**Path Parameters:**
- `id` (number, requerido): ID del producto

**Body (JSON):** (Mismos campos que crear producto, todos opcionales)

**Ejemplo de solicitud:**
```http
PUT /api/productos/1
Content-Type: application/json

{
  "nombre": "Producto Actualizado",
  "precio": 30000.00,
  "stock": 25
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "id_prod": 1,
    "nombre": "Producto Actualizado",
    "precio": 30000.00,
    "stock": 25,
    ...
  },
  "message": "Producto actualizado exitosamente"
}
```

---

### 9. Eliminar producto (soft delete)

**Endpoint:** `DELETE /api/productos/:id`

**Descripción:** Realiza un soft delete del producto (cambia estado a 0).

**Path Parameters:**
- `id` (number, requerido): ID del producto

**Ejemplo de solicitud:**
```http
DELETE /api/productos/1
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "message": "Producto eliminado exitosamente"
}
```

---

### 10. Actualizar stock

**Endpoint:** `PATCH /api/productos/:id/stock`

**Descripción:** Actualiza el stock de un producto (suma o resta cantidad).

**Path Parameters:**
- `id` (number, requerido): ID del producto

**Body (JSON):**
```json
{
  "cantidad": 10
}
```

**Nota:** Si `cantidad` es positivo, suma al stock. Si es negativo, resta del stock.

**Ejemplo de solicitud:**
```http
PATCH /api/productos/1/stock
Content-Type: application/json

{
  "cantidad": -5
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "id_prod": 1,
    "stock": 10,
    ...
  },
  "message": "Stock actualizado exitosamente"
}
```

**Respuesta de error (400):**
```json
{
  "success": false,
  "error": "Stock insuficiente. Stock actual: 5, intentando reducir: 10"
}
```

---

### 11. Toggle destacado

**Endpoint:** `PATCH /api/productos/:id/destacado`

**Descripción:** Cambia el estado destacado de un producto (true ↔ false).

**Path Parameters:**
- `id` (number, requerido): ID del producto

**Ejemplo de solicitud:**
```http
PATCH /api/productos/1/destacado
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "id_prod": 1,
    "destacado": true,
    ...
  },
  "message": "Producto marcado como destacado"
}
```

---

### 12. Obtener contenido para crear producto

**Endpoint:** `GET /api/productos/contenido-crear`

**Descripción:** Obtiene todas las opciones disponibles para crear un producto (marcas, categorías, grupos, IVAs).

**Ejemplo de solicitud:**
```http
GET /api/productos/contenido-crear
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "marcas": [
      {
        "id_marca": 1,
        "codi_marca": "010",
        "nombre": "Marca Ejemplo",
        "descripcion": "Descripción de marca"
      }
    ],
    "categorias": [
      {
        "id_cat": 1,
        "codi_categoria": "0001",
        "nombre": "Categoría Ejemplo",
        "descripcion": "Descripción de categoría"
      }
    ],
    "grupos": [
      {
        "id_grupo": 1,
        "codi_grupo": "0005",
        "nombre": "Grupo Ejemplo",
        "descripcion": "Descripción de grupo"
      }
    ],
    "ivas": [
      {
        "id_iva": 1,
        "codi_impuesto": "21",
        "nombre": "IVA 21%",
        "porcentaje": 21
      }
    ]
  }
}
```

---

## 📁 CATEGORÍAS

### 1. Obtener todas las categorías

**Endpoint:** `GET /api/categorias`

**Descripción:** Obtiene todas las categorías.

**Ejemplo de solicitud:**
```http
GET /api/categorias
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": [
    {
      "id_cat": 1,
      "codi_categoria": "0001",
      "nombre": "Categoría Ejemplo",
      "descripcion": "Descripción de categoría",
      "activo": true,
      "creado_en": "2024-01-01T00:00:00.000Z",
      "actualizado_en": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 2. Obtener categoría por ID

**Endpoint:** `GET /api/categorias/:id`

**Path Parameters:**
- `id` (number, requerido): ID de la categoría

**Ejemplo de solicitud:**
```http
GET /api/categorias/1
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "id_cat": 1,
    "codi_categoria": "0001",
    "nombre": "Categoría Ejemplo",
    ...
  }
}
```

---

### 3. Obtener categoría por código

**Endpoint:** `GET /api/categorias/codigo/:codigo`

**Path Parameters:**
- `codigo` (string, requerido): Código de la categoría (codi_categoria)

**Ejemplo de solicitud:**
```http
GET /api/categorias/codigo/0001
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "id_cat": 1,
    "codi_categoria": "0001",
    "nombre": "Categoría Ejemplo",
    ...
  }
}
```

---

### 4. Crear categoría

**Endpoint:** `POST /api/categorias`

**Body (JSON):**
```json
{
  "codi_categoria": "0001",
  "nombre": "Nueva Categoría",
  "descripcion": "Descripción de la categoría"
}
```

**Campos requeridos:**
- `codi_categoria` (string): Código único de la categoría
- `nombre` (string): Nombre de la categoría

**Ejemplo de solicitud:**
```http
POST /api/categorias
Content-Type: application/json

{
  "codi_categoria": "0001",
  "nombre": "Nueva Categoría"
}
```

**Respuesta exitosa (201):**
```json
{
  "success": true,
  "data": {
    "id_cat": 1,
    "codi_categoria": "0001",
    "nombre": "Nueva Categoría",
    ...
  },
  "message": "Categoría creada exitosamente"
}
```

---

### 5. Actualizar categoría

**Endpoint:** `PUT /api/categorias/:id`

**Path Parameters:**
- `id` (number, requerido): ID de la categoría

**Body (JSON):**
```json
{
  "nombre": "Categoría Actualizada",
  "descripcion": "Nueva descripción"
}
```

**Ejemplo de solicitud:**
```http
PUT /api/categorias/1
Content-Type: application/json

{
  "nombre": "Categoría Actualizada"
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "id_cat": 1,
    "nombre": "Categoría Actualizada",
    ...
  },
  "message": "Categoría actualizada exitosamente"
}
```

---

### 6. Eliminar categoría

**Endpoint:** `DELETE /api/categorias/:id`

**Path Parameters:**
- `id` (number, requerido): ID de la categoría

**Ejemplo de solicitud:**
```http
DELETE /api/categorias/1
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "message": "Categoría eliminada exitosamente"
}
```

**Respuesta de error (400):**
```json
{
  "success": false,
  "error": "No se puede eliminar la categoría porque tiene 5 producto(s) asociado(s)"
}
```

---

## 🏷️ MARCAS

### 1. Obtener todas las marcas

**Endpoint:** `GET /api/marcas`

**Ejemplo de solicitud:**
```http
GET /api/marcas
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": [
    {
      "id_marca": 1,
      "codi_marca": "010",
      "nombre": "Marca Ejemplo",
      "descripcion": "Descripción de marca",
      "activo": true,
      "creado_en": "2024-01-01T00:00:00.000Z",
      "actualizado_en": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 2. Obtener marca por ID

**Endpoint:** `GET /api/marcas/:id`

**Path Parameters:**
- `id` (number, requerido): ID de la marca

**Ejemplo de solicitud:**
```http
GET /api/marcas/1
```

---

### 3. Obtener marca por código

**Endpoint:** `GET /api/marcas/codigo/:codigo`

**Path Parameters:**
- `codigo` (string, requerido): Código de la marca (codi_marca)

**Ejemplo de solicitud:**
```http
GET /api/marcas/codigo/010
```

---

### 4. Crear marca

**Endpoint:** `POST /api/marcas`

**Body (JSON):**
```json
{
  "codi_marca": "010",
  "nombre": "Nueva Marca",
  "descripcion": "Descripción de la marca"
}
```

**Campos requeridos:**
- `codi_marca` (string): Código único de la marca
- `nombre` (string): Nombre de la marca

**Ejemplo de solicitud:**
```http
POST /api/marcas
Content-Type: application/json

{
  "codi_marca": "010",
  "nombre": "Nueva Marca"
}
```

---

### 5. Actualizar marca

**Endpoint:** `PUT /api/marcas/:id`

**Path Parameters:**
- `id` (number, requerido): ID de la marca

**Body (JSON):**
```json
{
  "nombre": "Marca Actualizada",
  "descripcion": "Nueva descripción"
}
```

---

### 6. Eliminar marca

**Endpoint:** `DELETE /api/marcas/:id`

**Path Parameters:**
- `id` (number, requerido): ID de la marca

**Respuesta de error (400):**
```json
{
  "success": false,
  "error": "No se puede eliminar la marca porque tiene 10 producto(s) asociado(s)"
}
```

---

## 📦 GRUPOS

### 1. Obtener todos los grupos

**Endpoint:** `GET /api/grupos`

**Ejemplo de solicitud:**
```http
GET /api/grupos
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": [
    {
      "id_grupo": 1,
      "codi_grupo": "0005",
      "nombre": "Grupo Ejemplo",
      "descripcion": "Descripción de grupo",
      "activo": true,
      "creado_en": "2024-01-01T00:00:00.000Z",
      "actualizado_en": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 2. Obtener grupo por ID

**Endpoint:** `GET /api/grupos/:id`

**Path Parameters:**
- `id` (number, requerido): ID del grupo

**Ejemplo de solicitud:**
```http
GET /api/grupos/1
```

---

### 3. Obtener grupo por código

**Endpoint:** `GET /api/grupos/codigo/:codigo`

**Path Parameters:**
- `codigo` (string, requerido): Código del grupo (codi_grupo)

**Ejemplo de solicitud:**
```http
GET /api/grupos/codigo/0005
```

---

### 4. Crear grupo

**Endpoint:** `POST /api/grupos`

**Body (JSON):**
```json
{
  "codi_grupo": "0005",
  "nombre": "Nuevo Grupo",
  "descripcion": "Descripción del grupo"
}
```

**Campos requeridos:**
- `codi_grupo` (string): Código único del grupo
- `nombre` (string): Nombre del grupo

**Ejemplo de solicitud:**
```http
POST /api/grupos
Content-Type: application/json

{
  "codi_grupo": "0005",
  "nombre": "Nuevo Grupo"
}
```

---

### 5. Actualizar grupo

**Endpoint:** `PUT /api/grupos/:id`

**Path Parameters:**
- `id` (number, requerido): ID del grupo

**Body (JSON):**
```json
{
  "nombre": "Grupo Actualizado",
  "descripcion": "Nueva descripción"
}
```

---

### 6. Eliminar grupo

**Endpoint:** `DELETE /api/grupos/:id`

**Path Parameters:**
- `id` (number, requerido): ID del grupo

**Respuesta de error (400):**
```json
{
  "success": false,
  "error": "No se puede eliminar el grupo porque tiene 8 producto(s) asociado(s)"
}
```

---

## 🔍 FILTROS Y BÚSQUEDAS

### Ejemplos de uso de filtros en productos

**Filtrar por categoría:**
```http
GET /api/productos?id_cat=0001
```

**Filtrar por marca:**
```http
GET /api/productos?id_marca=010
```

**Filtrar por grupo:**
```http
GET /api/productos?codi_grupo=0005
```

**Filtrar por IVA:**
```http
GET /api/productos?codi_impuesto=21
```

**Filtrar por rango de precio:**
```http
GET /api/productos?precio_min=1000&precio_max=50000
```

**Filtrar por múltiples criterios:**
```http
GET /api/productos?id_cat=0001&id_marca=010&precio_min=1000&precio_max=50000&order_by=precio&order=asc
```

**Buscar por texto:**
```http
GET /api/productos?busqueda=taladro
```

**Filtrar productos destacados:**
```http
GET /api/productos?destacado=true
```

**Filtrar productos con stock bajo:**
```http
GET /api/productos?stock_bajo=true
```

**Filtrar productos con imágenes:**
```http
GET /api/productos/con-imagenes?page=1&limit=50
```

---

## ⚠️ CÓDIGOS DE ESTADO HTTP

- `200` - OK: Solicitud exitosa
- `201` - Created: Recurso creado exitosamente
- `400` - Bad Request: Error en la solicitud (datos inválidos)
- `404` - Not Found: Recurso no encontrado
- `500` - Internal Server Error: Error del servidor

---

## 📝 NOTAS IMPORTANTES

1. **Relaciones por códigos CSV**: Las relaciones entre productos y categorías/marcas/grupos/IVAs se realizan usando los códigos del CSV (`codi_categoria`, `codi_marca`, `codi_grupo`, `codi_impuesto`), no por IDs autoincrementales.

2. **Filtros flexibles**: Los filtros `id_cat` e `id_marca` aceptan tanto números (ID) como strings (código CSV). El sistema detecta automáticamente el tipo.

3. **Límite por defecto**: El endpoint `GET /api/productos` tiene un límite por defecto de 100 productos.

4. **Productos con imágenes**: El endpoint `/api/productos/con-imagenes` verifica si existe alguna imagen en `src/resources/IMAGENES/img-art/` cuyo nombre comience con el `codi_arti` del producto.

5. **Soft Delete**: La eliminación de productos es un soft delete (cambia `estado` a 0), no elimina físicamente el registro.

6. **Stock**: El stock se maneja como `Decimal` en la base de datos, pero se convierte a `number` en las respuestas JSON.

7. **Paginación**: Todos los endpoints de listado soportan paginación con `page` y `limit`.

---

## 🔗 ESTRUCTURA DE RESPUESTAS

### Respuesta exitosa estándar:
```json
{
  "success": true,
  "data": { ... },
  "message": "Mensaje opcional"
}
```

### Respuesta de error:
```json
{
  "success": false,
  "error": "Mensaje de error"
}
```

### Respuesta paginada:
```json
{
  "data": [ ... ],
  "total": 150,
  "page": 1,
  "limit": 50,
  "totalPages": 3
}
```

---

**Última actualización:** 2024-11-20

