# Integración con Andreani

Esta documentación describe la integración completa con la API de Andreani para la gestión de envíos..

## 📋 Índice

- [Configuración](#configuración) (incluye [Modo mock](#modo-mock-andreani_mock))
- [Arquitectura](#arquitectura) (incluye Handlers del Event Bus SALE_CREATED)
- [Conceptos](#conceptos)
- [Pre-envíos](#pre-envíos)
- [Envíos Reales](#envíos-reales)
- [Tracking y Trazas](#tracking-y-trazas)
- [Cotización](#cotización)
- [Reglas de Negocio](#reglas-de-negocio)

## 🔧 Configuración

### Variables de Entorno

Agrega las siguientes variables a tu archivo `.env`:

```env
# Credenciales de Andreani
ANDREANI_USERNAME=tu_usuario
ANDREANI_PASSWORD=tu_password
ANDREANI_BASE_URL=https://apisqa.andreani.com  # QA
# ANDREANI_BASE_URL_PROD=https://apis.andreani.com  # PROD

# Contratos de Andreani
ANDREANI_CONTRATO_DOM=400006709  # Para envíos a domicilio
ANDREANI_CONTRATO_SUC=400006711  # Para envíos a sucursal

# Código Cliente (obligatorio para cotización)
ANDREANI_CLIENTE=tu_codigo_cliente

# Datos de origen (opcional)
ANDREANI_ORIGEN_CP=0000
ANDREANI_ORIGEN_LOCALIDAD=
ANDREANI_ORIGEN_REGION=

# Modo mock (pruebas sin API real / credenciales vencidas)
# ANDREANI_MOCK=true   # Cuando está en true: cotización $1000 fijo, pre-envío devuelve JSON de ejemplo, etiquetas suben backend/data/etiqueta_1.pdf al FTP
# Para volver al sistema normal: ANDREANI_MOCK=false o quitar la variable
```

### Modo mock (ANDREANI_MOCK)

Cuando `ANDREANI_MOCK=true` no se llama a la API de Andreani. Sirve para probar todo el flujo con credenciales vencidas o sin conectividad:

| Acción | Comportamiento en mock |
|--------|------------------------|
| **Cotización** (checkout) | Devuelve costo fijo $1000 (el envío gratis por mínimo se sigue aplicando). |
| **Crear pre-envío** (al confirmar venta) | No hace POST a Andreani; devuelve el JSON de ejemplo de esta doc, persiste en BD el código de seguimiento de ejemplo (`360000102000579`) y envía el email al cliente. |
| **Etiquetas** | No descarga desde Andreani; sube el archivo `backend/data/etiqueta_1.pdf` al FTP en `/Tekno/Andreani/{cod_interno}/` (una copia por bulto: `etiqueta_1.pdf`, `etiqueta_2.pdf`, etc.). |

Para volver al sistema normal: poner `ANDREANI_MOCK=false` o eliminar la variable.

### Base de Datos

El token de autenticación se guarda automáticamente en la tabla `negocio`, campo `token_envio`.

**IMPORTANTE**: Asegúrate de que exista al menos un registro en la tabla `negocio`.

## 🏗️ Arquitectura

La integración está organizada en servicios separados según la funcionalidad:

```
src/
 ├── config/
 │   └── andreani.config.ts              # Configuración centralizada
 ├── services/
 │   └── andreani/
 │       ├── andreani.types.ts            # Tipos TypeScript y enums
 │       ├── andreani.auth.service.ts     # Autenticación
 │       ├── andreani.api.service.ts      # API centralizada con retry
 │       ├── andreani.preenvio.service.ts # Pre-envíos (POST y GET)
 │       ├── andreani.envio.service.ts    # Envíos reales (GET estado, GET etiqueta, GET trazas)
 │       └── andreani.envios.service.ts   # Cotización (temporal)
 ├── controllers/
 │   └── andreani.controller.ts          # Controladores HTTP
 └── routes/
     └── andreani.routes.ts               # Rutas de la API
```

### Flujo de Autenticación

1. **Primera vez**: El sistema obtiene el token desde la BD (`negocio.token_envio`)
2. **Si no existe**: Se autentica contra Andreani usando Basic Auth
3. **Token guardado**: El token se guarda en la BD para uso futuro
4. **Token expirado**: Si una request devuelve 401/403, se renueva automáticamente y se reintenta

### Handlers del Event Bus (SALE_CREATED)

Cuando se confirma una venta se emite el evento `SALE_CREATED`. Dos handlers usan Andreani:

1. **AndreaniHandler** (prioridad 20): Crea el pre-envío en Andreani para la venta (envío a domicilio o sucursal; retiro en tienda se omite).
2. **EtiquetasAndreaniHandler** (prioridad 25): Tras el pre-envío exitoso, descarga las etiquetas desde los links en la respuesta de Andreani y las sube al FTP en `/Tekno/Andreani/{cod_interno}/etiqueta_N.pdf` (o `.png`). La carpeta se nombra con el código de venta (`cod_interno`), no con el código de seguimiento Andreani. Si hay varios bultos, sube una etiqueta por bulto; los errores por bulto no detienen el flujo ni a los demás handlers.

El servicio `andreani.api.service` expone `getBinary(endpoint)` para descargar binarios (etiquetas) con el mismo token y retry que el resto de la API.

## 📚 Conceptos

### Pre-envío vs Envío Real

**Pre-envío (Orden de envío):**
- Es la solicitud inicial que se envía a Andreani
- Estados: `Pendiente`, `Solicitado`, `Creada`, `Rechazado`
- Endpoint: `/v2/ordenes-de-envio`
- Se crea cuando se confirma el pago de una venta

**Envío Real:**
- Es el envío físico que existe cuando el pre-envío fue aceptado (estado "Creada")
- Solo existe cuando el pre-envío fue procesado por el TMS
- Endpoint: `/v2/envios/{numeroAndreani}`
- Permite consultar estado, obtener etiquetas y ver trazas

### Estados del Pre-envío

| Estado | Descripción | Color Badge |
|--------|-------------|-------------|
| **Pendiente** | La API aún no se comunicó con el TMS | `warning` |
| **Solicitado** | La API se comunicó con el TMS pero aún no tuvo respuesta | `info` |
| **Creada** | El TMS ACEPTÓ el pre-envío y ya es posible admitirlo físicamente | `success` |
| **Rechazado** | El TMS NO ACEPTÓ el pre-envío (contratos incorrectos, falta de datos, etc.) | `error` |

## 📦 Pre-envíos

### 1. Crear Pre-envío

**POST** `/api/andreani/pre-envios`

Crea un pre-envío para una venta confirmada. Se ejecuta automáticamente cuando se confirma el pago.

**Body:**
```json
{
  "id_venta": 123,
  "datosEnvio": {
    // Opcional: datos adicionales para personalizar el envío
  }
}
```

**Respuesta exitosa (201):**
```json
{
  "success": true,
  "data": {
    "estado": "Solicitada",
    "tipo": "B2C",
    "sucursalDeDistribucion": {
      "nomenclatura": "COR",
      "descripcion": "CORDOBA - RECANALIZACION",
      "id": "245"
    },
    "sucursalDeRendicion": {
      "nomenclatura": "PSD",
      "descripcion": "PROCESAMIENTO CIT POSTAL",
      "id": "1"
    },
    "fechaCreacion": "2026-01-12T15:55:51-03:00",
    "numeroDePermisionaria": "RNPSP Nº 586",
    "descripcionServicio": "LI CAMBIO",
    "bultos": [
      {
        "numeroDeBulto": "1",
        "numeroDeEnvio": "360000102000579",
        "totalizador": "1/1",
        "linking": [
          {
            "meta": "Etiqueta",
            "contenido": "https://apisqa.andreani.com/v2/ordenes-de-envio/API0000000479719/etiquetas?bulto=1"
          }
        ]
      }
    ],
    "agrupadorDeBultos": "API0000000479719",
    "etiquetasPorAgrupador": "https://apisqa.andreani.com/v2/ordenes-de-envio/API0000000479719/etiquetas"
  },
  "message": "Pre-envío creado exitosamente"
}
```

**Errores:**
- `400`: Venta no confirmada o datos inválidos
- `404`: Venta no encontrada
- `409`: Ya existe un pre-envío para esta venta

### 2. Consultar Pre-envío

**GET** `/api/andreani/pre-envios/:numeroDeEnvio`

Consulta un pre-envío por número de envío. Siempre funciona, independientemente del estado.

**Ejemplo:**
```
GET /api/andreani/pre-envios/360000102000579
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "estado": "Creada",
    "tipo": "B2C",
    "sucursalDeDistribucion": { ... },
    "bultos": [ ... ],
    "agrupadorDeBultos": "API0000000479719"
  }
}
```

## 🚚 Envíos Reales

### 1. Consultar Estado de Envío

**GET** `/api/andreani/envios/:numeroAndreani/estado`

Consulta el estado de un envío real. **Solo funciona si el pre-envío fue aceptado** (estado "Creada").

**IMPORTANTE**: Si el pre-envío está en "Pendiente" o "Solicitado", este endpoint retornará 404.

**Ejemplo:**
```
GET /api/andreani/envios/360000102000579/estado
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "numeroDeTracking": "360000102000579",
    "contrato": "400006709",
    "ciclo": "Distribution",
    "estado": "En distribución",
    "estadoId": 6,
    "fechaEstado": "2021-03-09T11:59:04",
    "sucursalDeDistribucion": {
      "nomenclatura": "MONSERRAT",
      "descripcion": "Monserrat",
      "id": "12"
    },
    "destino": {
      "Postal": {
        "localidad": "C.A.B.A.",
        "pais": "Argentina",
        "direccion": "AV J MANUEL DE ROSAS 380",
        "codigoPostal": "1002"
      }
    },
    "destinatario": {
      "nombreYApellido": "Juana Gonzalez",
      "tipoYNumeroDeDocumento": "PAS783297632",
      "eMail": "destinatario@andreani.com"
    }
  }
}
```

### 2. Obtener Etiqueta

**GET** `/api/andreani/envios/:agrupadorDeBultos/etiquetas?bulto=1`

Obtiene la etiqueta de un envío para imprimir.

**Ejemplo:**
```
GET /api/andreani/envios/API0000000479719/etiquetas?bulto=1
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "numeroDeEnvio": "360000102000579",
    "etiqueta": {
      "url": "https://...",
      "numero": "ETI-123"
    }
  }
}
```

## 📍 Tracking y Trazas

### Consultar Trazas

**GET** `/api/andreani/envios/:numeroAndreani/trazas`

Obtiene el historial completo de movimientos del envío (paso a paso). **Solo funciona si el pre-envío fue aceptado**.

**Ejemplo:**
```
GET /api/andreani/envios/360000102000579/trazas
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "eventos": [
      {
        "Fecha": "2021-03-09T11:08:03",
        "Estado": "Pendiente de ingreso",
        "EstadoId": 1,
        "Traduccion": "ENVIO INGRESADO AL SISTEMA",
        "Sucursal": "Sucursal Genérica",
        "SucursalId": 999,
        "Ciclo": "Distribution"
      },
      {
        "Fecha": "2021-03-09T11:08:09",
        "Estado": "Ingreso al circuito operativo",
        "EstadoId": 5,
        "Traduccion": "ENVIO INGRESADO AL SISTEMA",
        "Sucursal": "Monserrat",
        "SucursalId": 12,
        "Ciclo": "Distribution"
      },
      {
        "Fecha": "2021-03-09T11:53:55",
        "Estado": "En distribución",
        "EstadoId": 6,
        "Traduccion": "ENVIO CON SALIDA A REPARTO",
        "Sucursal": "Monserrat",
        "SucursalId": 12,
        "Ciclo": "Distribution"
      },
      {
        "Fecha": "2021-03-09T11:59:04",
        "Estado": "Visita",
        "EstadoId": 11,
        "Motivo": "No se encuentra el titular",
        "MotivoId": 36,
        "Traduccion": "No se encuentra el titular",
        "Sucursal": "Monserrat",
        "SucursalId": 12,
        "Ciclo": "Distribution"
      }
    ]
  }
}
```

## 💰 Cotización

### Cotizar Envío

**POST** `/api/andreani/envios/cotizar`

Calcula el costo de distribución de una orden de envío antes de crearla.

**Body:**
```json
{
  "cpDestino": "5000",
  "contrato": "400006709",
  "cliente": "tu_codigo_cliente",
  "sucursalOrigen": "COR",
  "bultos[0][volumen]": "6000",
  "bultos[0][kilos]": "1",
  "bultos[0][valorDeclarado]": "10000",
  "bultos[0][altoCm]": "10",
  "bultos[0][largoCm]": "30",
  "bultos[0][anchoCm]": "20"
}
```

**Campos obligatorios:**
- `cpDestino`: Código postal del destino
- `contrato`: Código de contrato con Andreani
- `cliente`: Código Cliente dentro de Andreani
- `bultos[0][volumen]`: Volumen del bulto en cm³

**Campos opcionales:**
- `sucursalOrigen`: Sucursal Origen
- `bultos[0][kilos]`: Peso del bulto en kilos
- `bultos[0][valorDeclarado]`: Valor del bulto sin impuestos
- `bultos[0][altoCm]`, `bultos[0][largoCm]`, `bultos[0][anchoCm]`: Dimensiones

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "proveedor": "ANDREANI",
    "precio": 7041.21,
    "moneda": "ARS",
    "plazoEntrega": "No especificado",
    "servicio": "Estándar",
    "entorno": "QA",
    "pesoAforado": "70.00",
    "tarifaSinIva": {
      "seguroDistribucion": "12.21",
      "distribucion": "5806.97",
      "total": "5819.18"
    },
    "tarifaConIva": {
      "seguroDistribucion": "14.77",
      "distribucion": "7026.43",
      "total": "7041.21"
    }
  }
}
```

## 💡 Uso

### Crear Pre-envío para una Venta Confirmada

```typescript
// Desde el backend (servicio)
import { andreaniPreEnvioService } from './services/andreani/andreani.preenvio.service';

// Solo funciona si estado_pago = 'aprobado'
const preEnvio = await andreaniPreEnvioService.crearPreEnvio(ventaId);
```

### Consultar Pre-envío

```typescript
// Siempre funciona, independientemente del estado
const preEnvio = await andreaniPreEnvioService.consultarPreEnvio('360000102000579');
```

### Consultar Estado de Envío Real

```typescript
// Solo funciona si el pre-envío fue aceptado
import { andreaniEnvioService } from './services/andreani/andreani.envio.service';

try {
  const estado = await andreaniEnvioService.consultarEstadoEnvio('360000102000579');
} catch (error) {
  // Si retorna 404, el envío aún no existe (pre-envío no aceptado)
}
```

### Consultar Trazas

```typescript
const trazas = await andreaniEnvioService.consultarTrazasEnvio('360000102000579');
```

## 📌 Reglas de Negocio

### 1. Venta Confirmada

**IMPORTANTE**: El pre-envío solo se puede crear si:
- La venta existe
- `estado_pago = 'aprobado'` (confirmada)
- No existe ya un pre-envío para esa venta

El medio de pago (Mercado Pago, transferencia, efectivo) es **irrelevante**. Lo único que importa es que la venta esté confirmada.

### 2. Pre-envío vs Envío Real

- **Pre-envío**: Siempre existe después de crearlo. Consultar con `/v2/ordenes-de-envio/{numeroDeEnvio}`
- **Envío Real**: Solo existe cuando el pre-envío fue aceptado (estado "Creada"). Consultar con `/v2/envios/{numeroAndreani}`

### 3. Token de Autenticación

- El token es **del sistema**, no del usuario
- Se guarda en `negocio.token_envio`
- **No se valida vencimiento** (se usa directamente)
- Si falla (401/403), se renueva automáticamente

### 4. Reintentos Automáticos

El sistema maneja automáticamente:
- Errores 401/403 → Renueva token y reintenta
- Timeouts → Configurable (30s por defecto)
- Errores de red → Se propagan al cliente

## 🔍 Ejemplos de Integración

### Ejemplo 1: Crear pre-envío cuando se confirma una venta

```typescript
// En payment-processing.service.ts, después de confirmar el pago
async confirmarPago(idVenta: number) {
  // Actualizar estado de pago
  await prisma.venta.update({
    where: { id_venta: idVenta },
    data: { estado_pago: 'aprobado' }
  });

  // Crear pre-envío automáticamente
  try {
    await andreaniPreEnvioService.crearPreEnvio(idVenta);
  } catch (error) {
    console.error('Error al crear pre-envío:', error);
    // No fallar la confirmación si falla el pre-envío
  }
}
```

### Ejemplo 2: Consultar estado periódicamente

```typescript
// Job programado (cron) para actualizar estados
async actualizarEstadosEnvio() {
  const enviosPendientes = await prisma.envios.findMany({
    where: {
      estado_envio: { in: ['preparando', 'enviado', 'en_transito'] },
      cod_seguimiento: { not: null }
    }
  });

  for (const envio of enviosPendientes) {
    try {
      // Primero intentar consultar pre-envío (siempre funciona)
      const preEnvio = await andreaniPreEnvioService.consultarPreEnvio(
        envio.cod_seguimiento!
      );
      
      // Si el pre-envío fue aceptado, consultar envío real
      if (preEnvio.estado === 'Creada' || preEnvio.estado === 'Creado') {
        try {
          await andreaniEnvioService.consultarEstadoEnvio(envio.cod_seguimiento!);
        } catch (error) {
          // 404 es esperado si aún no fue procesado
        }
      }
    } catch (error) {
      console.error(`Error al consultar envío ${envio.id_envio}:`, error);
    }
  }
}
```

## 🐛 Troubleshooting

### Error: "Credenciales no configuradas"

**Solución**: Verifica que `ANDREANI_USERNAME` y `ANDREANI_PASSWORD` estén en `.env`

### Error: "No se encontró configuración de negocio"

**Solución**: Asegúrate de que exista al menos un registro en la tabla `negocio`

### Error: "La venta no está confirmada"

**Solución**: Solo se pueden crear pre-envíos para ventas con `estado_pago = 'aprobado'`

### Error: "El envío aún no está disponible" (404)

**Solución**: El pre-envío puede estar en estado "Solicitada" o aún procesándose. Consulta el pre-envío primero con `/api/andreani/pre-envios/{numeroDeEnvio}`

### Error: "Token expirado"

**Solución**: El sistema debería renovarlo automáticamente. Si persiste, verifica las credenciales.

## 📚 Referencias

- [Documentación API Andreani](https://developers.andreani.com/)
- [API QA](https://apisqa.andreani.com)
- [API PROD](https://apis.andreani.com)

## 🔐 Seguridad

- Todas las rutas requieren autenticación (Firebase Token)
- Las credenciales de Andreani se guardan en variables de entorno
- El token se almacena encriptado en la base de datos
- Los errores no exponen información sensible

## 📊 Resumen de Endpoints

### Pre-envíos
- `POST /api/andreani/pre-envios` - Crear pre-envío
- `GET /api/andreani/pre-envios/:numeroDeEnvio` - Consultar pre-envío

### Envíos Reales
- `GET /api/andreani/envios/:numeroAndreani/estado` - Consultar estado
- `GET /api/andreani/envios/:agrupadorDeBultos/etiquetas` - Obtener etiqueta
- `GET /api/andreani/envios/:numeroAndreani/trazas` - Consultar trazas

### Cotización
- `POST /api/andreani/envios/cotizar` - Cotizar envío
