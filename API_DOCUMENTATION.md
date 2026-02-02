# 📚 Documentación de API - MaxShop

**Base URL:** `http://localhost:3001/api` (desarrollo) | `https://api.vertimar.online/api` (producción)

**Versión:** 1.0.0

---

## 📋 Tabla de Contenidos

1. [Autenticación](#autenticación)
2. [Health Check](#health-check)
3. [Autenticación y Usuarios](#autenticación-y-usuarios)
4. [Productos](#productos)
5. [Categorías](#categorías)
6. [Marcas](#marcas)
7. [Grupos](#grupos)
8. [Ventas](#ventas)
9. [Clientes](#clientes)
10. [Direcciones](#direcciones)
11. [Ubicación (OpenCage)](#ubicación-opencage)
12. [Andreani](#andreani)
13. [Dashboard (Admin)](#dashboard-admin)
14. [Facturas](#facturas)
15. [Webhooks](#webhooks)

---

## 🔐 Autenticación

La mayoría de los endpoints requieren autenticación mediante **Firebase ID Token**.

### Headers Requeridos

```http
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

### Respuesta de Error (401)

```json
{
  "success": false,
  "error": "Token de autorización no proporcionado."
}
```

---

## Health Check

### GET /api/health

Verifica el estado general del servidor.

**Autenticación:** No requerida

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-01-20T12:00:00.000Z",
    "uptime": 3600,
    "environment": "development",
    "version": "1.0.0"
  }
}
```

---

### GET /api/health/db

Verifica el estado de PostgreSQL.

**Autenticación:** No requerida

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "responseTime": "15ms",
    "timestamp": "2026-01-20T12:00:00.000Z"
  }
}
```

---

### GET /api/health/redis

Verifica el estado de Redis.

**Autenticación:** No requerida

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "responseTime": "2ms",
    "timestamp": "2026-01-20T12:00:00.000Z"
  }
}
```

---

### GET /api/health/full

Verifica el estado completo de todos los servicios.

**Autenticación:** No requerida

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "checks": {
      "api": { "status": "ok" },
      "database": { "status": "ok", "responseTime": "15ms" },
      "redis": { "status": "ok", "responseTime": "2ms" }
    },
    "timestamp": "2026-01-20T12:00:00.000Z"
  }
}
```

---

## Autenticación y Usuarios

### POST /api/auth/login/token

Inicia sesión con Firebase ID Token.

**Autenticación:** No requerida (pero requiere token de Firebase)

**Rate Limit:** 5 requests/minuto

**Request Body:**

```json
{
  "idToken": "firebase_id_token_here",
  "data": {
    "uid": "firebase_uid",
    "email": "usuario@example.com",
    "displayName": "Nombre Usuario"
  }
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "nombre": "Nombre",
      "apellido": "Apellido",
      "email": "usuario@example.com",
      "rol": "USER"
    },
    "token": "jwt_token_here"
  }
}
```

---

### POST /api/auth/register

Registra un nuevo usuario con Firebase.

**Autenticación:** Requiere Firebase Token

**Rate Limit:** 5 requests/minuto

**Request Body:**

```json
{
  "idToken": "firebase_id_token_here",
  "data": {
    "uid": "firebase_uid",
    "email": "usuario@example.com",
    "displayName": "Nombre Usuario"
  }
}
```

**Respuesta Exitosa (201):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "nombre": "Nombre",
      "apellido": "Apellido",
      "email": "usuario@example.com"
    },
    "created": true
  },
  "message": "Usuario registrado exitosamente"
}
```

---

### POST /api/auth/complete-profile

Completa el perfil del usuario autenticado.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "data": {
    "nombre": "Nombre",
    "apellido": "Apellido",
    "telefono": "1234567890",
    "nacimiento": "1990-01-01",
    "tipo_documento": "DNI",
    "numero_documento": "12345678"
  }
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id": "user_id",
    "nombre": "Nombre",
    "apellido": "Apellido",
    "telefono": "1234567890"
  },
  "message": "Perfil completado exitosamente"
}
```

---

### GET /api/auth/me

Obtiene el usuario autenticado actual.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "nombre": "Nombre",
      "apellido": "Apellido",
      "email": "usuario@example.com",
      "rol": "USER"
    },
    "needsTokenRefresh": false
  }
}
```

---

### POST /api/auth/check-email

Verifica si un email existe en el sistema.

**Autenticación:** No requerida

**Rate Limit:** 5 requests/minuto

**Request Body:**

```json
{
  "email": "usuario@example.com"
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "exists": true,
    "canLoginAsGuest": false
  }
}
```

---

### POST /api/auth/guest-register

Registra un usuario invitado (guest).

**Autenticación:** Requiere Firebase Token

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "idToken": "firebase_anonymous_token",
  "data": {
    "uid": "firebase_uid"
  }
}
```

**Respuesta Exitosa (201):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "rol": "GUEST"
    },
    "created": true
  },
  "message": "Usuario invitado registrado exitosamente"
}
```

---

### POST /api/auth/convert-guest

Convierte un usuario invitado a usuario completo.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "idToken": "firebase_id_token",
  "data": {
    "email": "usuario@example.com",
    "nombre": "Nombre",
    "apellido": "Apellido"
  }
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "email": "usuario@example.com",
      "rol": "USER"
    }
  },
  "message": "Usuario convertido exitosamente"
}
```

---

## Productos

### GET /api/productos

Lista productos con filtros y paginación.

**Autenticación:** No requerida

**Rate Limit:** 100 requests/minuto

**Query Parameters:**

| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `page` | number | Página (default: 1) | `1` |
| `limit` | number | Items por página (default: 100, max: 100) | `25` |
| `busqueda` | string | Búsqueda por nombre/código | `"martillo"` |
| `id_cat` | number/string | ID o código de categoría | `1` o `"CAT001"` |
| `id_marca` | number/string | ID o código de marca | `4` |
| `codi_grupo` | string | Código de grupo | `"GRP001"` |
| `codi_impuesto` | number/string | Código de impuesto | `1` |
| `precio_min` | number | Precio mínimo | `1000` |
| `precio_max` | number | Precio máximo | `50000` |
| `destacado` | boolean | Solo destacados | `true` |
| `financiacion` | boolean | Solo con financiación | `true` |
| `stock_bajo` | boolean | Solo stock bajo | `true` |
| `activo` | string | Estado: "A" (activo) o "I" (inactivo) | `"A"` |
| `order_by` | string | Campo de ordenamiento | `"precio"` |
| `order` | string | Dirección: "asc" o "desc" | `"desc"` |

**Ejemplo de Request:**

```
GET /api/productos?page=1&limit=25&busqueda=martillo&precio_min=1000&destacado=true
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "productos": [
      {
        "id_producto": 1,
        "codi_arti": "MART001",
        "nombre": "Martillo Profesional",
        "descripcion": "Martillo de acero...",
        "precio": 15000,
        "precio_anterior": 18000,
        "stock": 50,
        "stock_minimo": 10,
        "imagen_principal": "https://...",
        "imagenes": ["https://..."],
        "marca": {
          "id_marca": 4,
          "nombre": "INGCO"
        },
        "categoria": {
          "id_cat": 1,
          "nombre": "Herramientas"
        },
        "destacado": true,
        "activo": "A"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 150,
      "totalPages": 6
    }
  }
}
```

---

### GET /api/productos/:id

Obtiene un producto por ID.

**Autenticación:** No requerida

**Rate Limit:** 100 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id_producto": 1,
    "codi_arti": "MART001",
    "nombre": "Martillo Profesional",
    "descripcion": "Martillo de acero...",
    "precio": 15000,
    "stock": 50,
    "marca": {
      "id_marca": 4,
      "nombre": "INGCO"
    },
    "categoria": {
      "id_cat": 1,
      "nombre": "Herramientas"
    }
  }
}
```

---

### GET /api/productos/codigo/:codigo

Obtiene un producto por código de artículo.

**Autenticación:** No requerida

**Rate Limit:** 100 requests/minuto

**Ejemplo:**

```
GET /api/productos/codigo/MART001
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id_producto": 1,
    "codi_arti": "MART001",
    "nombre": "Martillo Profesional",
    "precio": 15000
  }
}
```

---

### GET /api/productos/destacados

Obtiene productos destacados.

**Autenticación:** No requerida

**Rate Limit:** 100 requests/minuto

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `limit` | number | Cantidad de productos (default: 10) |

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": [
    {
      "id_producto": 1,
      "nombre": "Martillo Profesional",
      "precio": 15000,
      "imagen_principal": "https://..."
    }
  ]
}
```

---

### GET /api/productos/tienda

Obtiene productos para la tienda (marca INGCO con imágenes).

**Autenticación:** No requerida

**Rate Limit:** 100 requests/minuto

**Query Parameters:** Mismos que `GET /api/productos`

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "productos": [...],
    "pagination": {...}
  }
}
```

---

### POST /api/productos

Crea un nuevo producto.

**Autenticación:** Requerida (Admin)

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "codi_arti": "PROD001",
  "nombre": "Nuevo Producto",
  "descripcion": "Descripción del producto",
  "precio": 10000,
  "precio_anterior": 12000,
  "stock": 100,
  "stock_minimo": 10,
  "id_marca": 4,
  "id_cat": 1,
  "codi_grupo": "GRP001",
  "codi_impuesto": 1,
  "destacado": false,
  "activo": "A"
}
```

**Respuesta Exitosa (201):**

```json
{
  "success": true,
  "data": {
    "id_producto": 123,
    "codi_arti": "PROD001",
    "nombre": "Nuevo Producto"
  },
  "message": "Producto creado exitosamente"
}
```

---

### PUT /api/productos/:id

Actualiza un producto existente.

**Autenticación:** Requerida (Admin)

**Rate Limit:** 200 requests/minuto

**Request Body:** (Campos opcionales, solo enviar los que se quieren actualizar)

```json
{
  "nombre": "Producto Actualizado",
  "precio": 12000,
  "stock": 80
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id_producto": 123,
    "nombre": "Producto Actualizado"
  },
  "message": "Producto actualizado exitosamente"
}
```

---

### PATCH /api/productos/:id/stock

Actualiza el stock de un producto.

**Autenticación:** Requerida (Admin)

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "stock": 150
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id_producto": 123,
    "stock": 150
  },
  "message": "Stock actualizado exitosamente"
}
```

---

### PATCH /api/productos/:id/destacado

Alterna el estado destacado de un producto.

**Autenticación:** Requerida (Admin)

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id_producto": 123,
    "destacado": true
  },
  "message": "Estado destacado actualizado"
}
```

---

### DELETE /api/productos/:id

Elimina (soft delete) un producto.

**Autenticación:** Requerida (Admin)

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "message": "Producto eliminado exitosamente"
}
```

---

## Categorías

### GET /api/categorias

Lista todas las categorías.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": [
    {
      "id_cat": 1,
      "codi_cat": "CAT001",
      "nombre": "Herramientas",
      "descripcion": "Categoría de herramientas"
    }
  ]
}
```

---

### GET /api/categorias/:id

Obtiene una categoría por ID.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id_cat": 1,
    "codi_cat": "CAT001",
    "nombre": "Herramientas"
  }
}
```

---

### POST /api/categorias

Crea una nueva categoría.

**Autenticación:** Requerida (Admin)

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "codi_cat": "CAT002",
  "nombre": "Nueva Categoría",
  "descripcion": "Descripción"
}
```

**Respuesta Exitosa (201):**

```json
{
  "success": true,
  "data": {
    "id_cat": 2,
    "codi_cat": "CAT002",
    "nombre": "Nueva Categoría"
  },
  "message": "Categoría creada exitosamente"
}
```

---

## Marcas

### GET /api/marcas

Lista todas las marcas.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": [
    {
      "id_marca": 4,
      "codi_marca": "004",
      "nombre": "INGCO",
      "descripcion": "Marca de herramientas"
    }
  ]
}
```

---

### POST /api/marcas

Crea una nueva marca.

**Autenticación:** Requerida (Admin)

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "codi_marca": "005",
  "nombre": "Nueva Marca",
  "descripcion": "Descripción"
}
```

**Respuesta Exitosa (201):**

```json
{
  "success": true,
  "data": {
    "id_marca": 5,
    "codi_marca": "005",
    "nombre": "Nueva Marca"
  },
  "message": "Marca creada exitosamente"
}
```

---

## Grupos

### GET /api/grupos

Lista todos los grupos.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": [
    {
      "codi_grupo": "GRP001",
      "nombre": "Grupo 1"
    }
  ]
}
```

---

## Ventas

### GET /api/ventas

Lista ventas con filtros y paginación.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `page` | number | Página (default: 1) |
| `limit` | number | Items por página (default: 25) |
| `busqueda` | string | Búsqueda |
| `id_cliente` | string | ID de cliente |
| `id_usuario` | string | ID de usuario |
| `fecha_desde` | string | Fecha desde (YYYY-MM-DD) |
| `fecha_hasta` | string | Fecha hasta (YYYY-MM-DD) |
| `estado_pago` | string | Estado: "pendiente", "aprobado", "rechazado", "facturado" |
| `estado_envio` | string | Estado: "pendiente", "enviado", "entregado" |
| `metodo_pago` | string | Método: "mercadopago", "transferencia" |
| `total_min` | number | Total mínimo |
| `total_max` | number | Total máximo |

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "ventas": [
      {
        "id_venta": 1,
        "cod_interno": "00000001",
        "total_neto": 15000,
        "total_general": 18150,
        "estado_pago": "aprobado",
        "estado_envio": "pendiente",
        "metodo_pago": "mercadopago",
        "fecha": "2026-01-20T12:00:00.000Z",
        "cliente": {
          "nombre": "Juan",
          "apellido": "Pérez",
          "email": "juan@example.com"
        },
        "detalles": [
          {
            "id_detalle": 1,
            "producto": {
              "nombre": "Martillo",
              "precio_unitario": 15000
            },
            "cantidad": 1,
            "sub_total": 15000
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 100,
      "totalPages": 4
    }
  }
}
```

---

### GET /api/ventas/mis-pedidos

Obtiene las ventas del usuario autenticado.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Query Parameters:** Mismos que `GET /api/ventas`

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "ventas": [...],
    "pagination": {...}
  }
}
```

---

### GET /api/ventas/:id

Obtiene una venta por ID.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id_venta": 1,
    "cod_interno": "00000001",
    "total_neto": 15000,
    "estado_pago": "aprobado",
    "cliente": {...},
    "detalles": [...],
    "envio": {
      "cod_envio": "360000102051709",
      "estado": "Pendiente"
    }
  }
}
```

---

### POST /api/ventas/checkout

Crea una venta desde el checkout.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "direccion_envio": {
    "direccion": "Calle Falsa 123",
    "ciudad": "Buenos Aires",
    "provincia": "Buenos Aires",
    "cod_postal": "1000",
    "pais": "ARGENTINA",
    "direccion_formateada": "Calle Falsa 123, Buenos Aires - C.P.: 1000, Buenos Aires"
  },
  "detalles": [
    {
      "id_producto": 1,
      "cantidad": 2,
      "precio_unitario": 15000
    }
  ],
  "tipo_documento": "DNI",
  "numero_documento": "12345678",
  "metodo_pago": "mercadopago"
}
```

**Respuesta Exitosa (201):**

```json
{
  "success": true,
  "data": {
    "id_venta": 1,
    "cod_interno": "00000001",
    "preference_id": "mercadopago_preference_id",
    "init_point": "https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
    "total_neto": 30000
  },
  "message": "Venta creada exitosamente"
}
```

---

### PATCH /api/ventas/:id/estado-pago

Actualiza el estado de pago de una venta.

**Autenticación:** Requerida (Admin)

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "estado_pago": "aprobado"
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id_venta": 1,
    "estado_pago": "aprobado"
  },
  "message": "Estado de pago actualizado exitosamente"
}
```

---

### PATCH /api/ventas/:id/estado-envio

Actualiza el estado de envío de una venta.

**Autenticación:** Requerida (Admin)

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "estado_envio": "enviado"
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id_venta": 1,
    "estado_envio": "enviado"
  },
  "message": "Estado de envío actualizado exitosamente"
}
```

---

## Clientes

### GET /api/clientes

Lista todos los clientes.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": [
    {
      "id_usuario": "user_id",
      "nombre": "Juan",
      "apellido": "Pérez",
      "email": "juan@example.com",
      "telefono": "1234567890"
    }
  ]
}
```

---

### GET /api/clientes/:id

Obtiene un cliente por ID.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id_usuario": "user_id",
    "nombre": "Juan",
    "apellido": "Pérez",
    "email": "juan@example.com",
    "ventas": [...]
  }
}
```

---

## Direcciones

### GET /api/direcciones

Obtiene las direcciones del usuario autenticado.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": [
    {
      "id_direccion": 1,
      "direccion": "Calle Falsa 123",
      "ciudad": "Buenos Aires",
      "provincia": "Buenos Aires",
      "cod_postal": "1000",
      "pais": "ARGENTINA",
      "direccion_formateada": "Calle Falsa 123, Buenos Aires - C.P.: 1000, Buenos Aires"
    }
  ]
}
```

---

### POST /api/direcciones

Crea una nueva dirección.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "direccion": "Calle Falsa 123",
  "ciudad": "Buenos Aires",
  "provincia": "Buenos Aires",
  "cod_postal": "1000",
  "pais": "ARGENTINA",
  "direccion_formateada": "Calle Falsa 123, Buenos Aires - C.P.: 1000, Buenos Aires"
}
```

**Respuesta Exitosa (201):**

```json
{
  "success": true,
  "message": "Dirección creada exitosamente"
}
```

---

### PUT /api/direcciones/:id

Actualiza una dirección.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Request Body:** (Campos opcionales)

```json
{
  "direccion": "Calle Nueva 456",
  "ciudad": "Córdoba"
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "id_direccion": 1,
    "direccion": "Calle Nueva 456"
  },
  "message": "Dirección actualizada exitosamente"
}
```

---

### DELETE /api/direcciones/:id

Elimina una dirección.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "message": "Dirección eliminada exitosamente"
}
```

---

## Ubicación (OpenCage)

### GET /api/location/search

Busca direcciones mediante OpenCage.

**Autenticación:** No requerida

**Rate Limit:** 100 requests/minuto

**Query Parameters:**

| Parámetro | Tipo | Descripción | Requerido |
|-----------|------|-------------|-----------|
| `q` | string | Término de búsqueda (mínimo 3 caracteres) | Sí |
| `limit` | number | Cantidad de resultados (1-10, default: 5) | No |
| `country` | string | Código de país (default: "ar") | No |

**Ejemplo:**

```
GET /api/location/search?q=Catamarca+955+Cordoba&limit=5&country=ar
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": [
    {
      "formatted": "Catamarca 955, Córdoba, Argentina",
      "components": {
        "road": "Catamarca",
        "house_number": "955",
        "city": "Córdoba",
        "state": "Córdoba",
        "postcode": "5000",
        "country": "Argentina"
      },
      "geometry": {
        "lat": -31.4201,
        "lng": -64.1888
      }
    }
  ]
}
```

---

### POST /api/location/reverse

Geocodificación inversa (coordenadas → dirección).

**Autenticación:** No requerida

**Rate Limit:** 100 requests/minuto

**Request Body:**

```json
{
  "lat": -31.4201,
  "lng": -64.1888,
  "country": "ar"
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "formatted": "Catamarca 955, Córdoba, Argentina",
    "components": {
      "road": "Catamarca",
      "house_number": "955",
      "city": "Córdoba",
      "state": "Córdoba",
      "postcode": "5000"
    }
  }
}
```

---

## Andreani

### POST /api/andreani/envios/cotizar

Cotiza un envío con Andreani.

**Autenticación:** Requerida

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "codigoPostalOrigen": "1000",
  "codigoPostalDestino": "5000",
  "volumen": 1000,
  "peso": 2.5
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "tarifa": 1500,
    "tiempoEstimado": "3-5 días hábiles"
  }
}
```

---

### POST /api/andreani/pre-envios

Crea un pre-envío para una venta confirmada.

**Autenticación:** Requerida (Admin)

**Rate Limit:** 200 requests/minuto

**Request Body:**

```json
{
  "id_venta": 1,
  "datosEnvio": {
    "codigoPostalOrigen": "1000",
    "codigoPostalDestino": "5000"
  }
}
```

**Respuesta Exitosa (201):**

```json
{
  "success": true,
  "message": "Pre-envío creado exitosamente"
}
```

---

### GET /api/andreani/pre-envios/:numeroDeEnvio

Consulta un pre-envío por número de envío.

**Autenticación:** Requerida (Admin)

**Rate Limit:** 200 requests/minuto

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "numeroDeEnvio": "360000102051709",
    "agrupador": "API0000000483410",
    "estado": "Pendiente",
    "fechaCreacion": "2026-01-20T12:00:00-03:00"
  }
}
```

---

## Dashboard (Admin)

Todos los endpoints del dashboard requieren autenticación y rol **ADMIN**.

**Rate Limit:** 50 requests/minuto

### GET /api/admin/dashboard/kpis

Obtiene KPIs principales.

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "ventasTotales": 150000,
    "ventasMes": 50000,
    "clientesActivos": 120,
    "productosVendidos": 450
  }
}
```

---

### GET /api/admin/dashboard/sales-over-time

Obtiene ventas en el tiempo.

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `period` | string | "day", "week", "month" (default: "month") |
| `startDate` | string | Fecha inicio (YYYY-MM-DD) |
| `endDate` | string | Fecha fin (YYYY-MM-DD) |

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": [
    {
      "date": "2026-01-01",
      "ventas": 50000,
      "cantidad": 25
    }
  ]
}
```

---

### GET /api/admin/dashboard/order-status

Obtiene estado de órdenes.

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "pendientes": 10,
    "aprobadas": 50,
    "enviadas": 30,
    "entregadas": 100
  }
}
```

---

### GET /api/admin/dashboard/top-products

Obtiene productos más vendidos.

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `limit` | number | Cantidad (default: 10) |

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": [
    {
      "id_producto": 1,
      "nombre": "Martillo",
      "cantidadVendida": 150,
      "totalVendido": 2250000
    }
  ]
}
```

---

## Facturas

Todos los endpoints de facturas requieren autenticación y rol **ADMIN**.

**Rate Limit:** 
- `/sync`: 5 requests/minuto
- Otros: 50 requests/minuto

### POST /api/facturas/sync

Sincroniza facturas pendientes manualmente.

**Autenticación:** Requerida (Admin)

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "procesadas": 5,
    "noEncontradas": 2,
    "errores": 0
  },
  "message": "Sincronización completada"
}
```

---

### GET /api/facturas/pendientes

Lista ventas pendientes de factura.

**Autenticación:** Requerida (Admin)

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "venta_id": 1,
      "estado": "pendiente",
      "fecha_creacion": "2026-01-20T12:00:00.000Z"
    }
  ]
}
```

---

### GET /api/facturas/estadisticas

Obtiene estadísticas de facturas.

**Autenticación:** Requerida (Admin)

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "pendientes": 10,
    "procesando": 2,
    "completados": 150,
    "errores": 1
  }
}
```

---

## Webhooks

### POST /api/webhooks/mercadopago

Recibe webhooks de Mercado Pago.

**Autenticación:** No requerida (validación de firma de MP)

**Rate Limit:** 10 requests/minuto

**Headers Requeridos:**

```http
x-signature: <hmac_signature>
x-request-id: <request_id>
```

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del recurso (payment o merchant_order) |
| `topic` | string | Tipo: "payment" o "merchant_order" |
| `type` | string | Tipo de evento (para payment) |

**Request Body:** (Enviado por Mercado Pago)

```json
{
  "action": "payment.created",
  "api_version": "v1",
  "data": {
    "id": "123456789"
  },
  "date_created": "2026-01-20T12:00:00.000Z",
  "id": 1,
  "live_mode": false,
  "type": "payment",
  "user_id": "user_id"
}
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "message": "Webhook procesado"
}
```

---

### GET /api/webhooks/mercadopago/health

Health check del servicio de webhooks.

**Autenticación:** No requerida

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-01-20T12:00:00.000Z"
  }
}
```

---

## Códigos de Estado HTTP

| Código | Descripción |
|--------|-------------|
| `200` | OK - Request exitoso |
| `201` | Created - Recurso creado exitosamente |
| `400` | Bad Request - Error en los datos enviados |
| `401` | Unauthorized - Token inválido o no proporcionado |
| `403` | Forbidden - No tienes permisos |
| `404` | Not Found - Recurso no encontrado |
| `409` | Conflict - Conflicto (ej: recurso ya existe) |
| `413` | Payload Too Large - Payload excede el límite (10MB) |
| `429` | Too Many Requests - Rate limit excedido |
| `500` | Internal Server Error - Error del servidor |
| `503` | Service Unavailable - Servicio no disponible |

---

## Formato de Respuesta Estándar

Todas las respuestas siguen este formato:

### Respuesta Exitosa

```json
{
  "success": true,
  "data": { ... },
  "message": "Mensaje opcional"
}
```

### Respuesta con Paginación

```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 100,
      "totalPages": 4
    }
  }
}
```

### Respuesta de Error

```json
{
  "success": false,
  "error": "Mensaje de error descriptivo"
}
```

### Respuesta de Error con Detalles (Validación)

```json
{
  "success": false,
  "error": "Error de validación",
  "details": [
    {
      "field": "email",
      "message": "Email inválido"
    }
  ]
}
```

---

## Rate Limiting

El sistema implementa rate limiting para proteger la API:

| Tipo de Endpoint | Límite |
|------------------|--------|
| Públicos (productos, location) | 100 req/min |
| Autenticados | 200 req/min |
| Autenticación (login/register) | 5 req/min |
| Webhooks | 10 req/min |
| Admin | 50 req/min |
| Sincronización | 5 req/min |

**Headers de Respuesta:**

```http
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1642680000
```

Si se excede el límite, recibirás:

```json
{
  "success": false,
  "error": "Demasiadas solicitudes. Por favor, intenta nuevamente en un momento."
}
```

---

## Notas Importantes

1. **Autenticación:** La mayoría de endpoints requieren el header `Authorization: Bearer <token>`
2. **Content-Type:** Todos los requests con body deben usar `Content-Type: application/json`
3. **Fechas:** Se usan en formato ISO 8601: `YYYY-MM-DDTHH:mm:ss.sssZ`
4. **IDs:** Los IDs numéricos son enteros positivos
5. **Paginación:** Por defecto, `page=1` y `limit` varía según el endpoint
6. **Filtros:** Los filtros de búsqueda son case-insensitive
7. **Soft Delete:** Los productos eliminados se marcan como inactivos, no se borran físicamente

---

## Ejemplos de Uso

### Ejemplo: Crear una venta desde checkout

```bash
curl -X POST http://localhost:3001/api/ventas/checkout \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "direccion_envio": {
      "direccion": "Calle Falsa 123",
      "ciudad": "Buenos Aires",
      "provincia": "Buenos Aires",
      "cod_postal": "1000",
      "pais": "ARGENTINA",
      "direccion_formateada": "Calle Falsa 123, Buenos Aires - C.P.: 1000, Buenos Aires"
    },
    "detalles": [
      {
        "id_producto": 1,
        "cantidad": 2,
        "precio_unitario": 15000
      }
    ],
    "tipo_documento": "DNI",
    "numero_documento": "12345678",
    "metodo_pago": "mercadopago"
  }'
```

### Ejemplo: Buscar productos

```bash
curl "http://localhost:3001/api/productos?page=1&limit=25&busqueda=martillo&precio_min=1000&destacado=true"
```

### Ejemplo: Buscar direcciones

```bash
curl "http://localhost:3001/api/location/search?q=Catamarca+955+Cordoba&limit=5&country=ar"
```

---

**Última actualización:** 2026-01-20

**Versión de API:** 1.0.0
