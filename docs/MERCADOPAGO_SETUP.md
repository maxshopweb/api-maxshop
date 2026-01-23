# Configuración de Mercado Pago - MaxShop

## Variables de Entorno Requeridas

Agregar las siguientes variables al archivo `.env`:

```env
# ============================================
# MERCADO PAGO - Configuración
# ============================================

# Modo de operación: 'test' para sandbox, 'production' para producción
MERCADOPAGO_ENV=test

# ============================================
# Credenciales de PRODUCCIÓN
# ============================================

# Access Token de producción (para operaciones del servidor)
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Public Key de producción (para frontend/SDK JS)
MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# ============================================
# Credenciales de PRUEBA (Sandbox)
# ============================================

# Access Token de prueba
MERCADOPAGO_ACCESS_TOKEN_TEST=TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Public Key de prueba  
MERCADOPAGO_PUBLIC_KEY_TEST=TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# ============================================
# Webhook Configuration
# ============================================

# Secret para validar firma de webhooks (HMAC-SHA256)
MERCADOPAGO_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# URL donde MP enviará las notificaciones de pago
MERCADOPAGO_WEBHOOK_URL=https://tu-dominio.com/api/webhooks/mercadopago
```

---

## Pasos para Obtener las Credenciales

### 1. Crear Aplicación en Mercado Pago

1. Ir a [Panel de Desarrolladores MP](https://www.mercadopago.com.ar/developers/panel/app)
2. Crear una nueva aplicación o seleccionar una existente
3. Completar los datos de la aplicación

### 2. Obtener Credenciales de Prueba (Sandbox)

1. En tu aplicación, ir a **Credenciales de prueba**
2. Copiar:
   - `Access Token` → `MERCADOPAGO_ACCESS_TOKEN_TEST`
   - `Public Key` → `MERCADOPAGO_PUBLIC_KEY_TEST`

### 3. Obtener Credenciales de Producción

1. En tu aplicación, ir a **Credenciales de producción**
2. Copiar:
   - `Access Token` → `MERCADOPAGO_ACCESS_TOKEN`
   - `Public Key` → `MERCADOPAGO_PUBLIC_KEY`

### 4. Configurar Webhooks

1. En tu aplicación, ir a **Webhooks**
2. Agregar URL de notificación:
   - **URL**: `https://tu-dominio.com/api/webhooks/mercadopago`
   - **Eventos**: Seleccionar `Pagos`
3. Guardar y copiar la **Firma secreta** → `MERCADOPAGO_WEBHOOK_SECRET`

> **IMPORTANTE**: La URL de webhook debe ser HTTPS en producción.

---

## Configuración para Desarrollo Local

Para recibir webhooks en desarrollo local, necesitas exponer tu servidor a internet.

### Opción 1: ngrok (Recomendado)

```bash
# Instalar ngrok
brew install ngrok

# Autenticar (crear cuenta gratuita en ngrok.com)
ngrok config add-authtoken YOUR_TOKEN

# Exponer puerto 3000
ngrok http 3000
```

Copiar la URL HTTPS generada (ej: `https://abc123.ngrok.io`) y configurarla en:
- Panel de MP → Webhooks → URL de notificación
- Variable `MERCADOPAGO_WEBHOOK_URL` en `.env`

### Opción 2: localhost.run

```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```

---

## Usuarios de Prueba

Para probar pagos necesitas crear usuarios de prueba:

1. Ir a [Panel de Desarrolladores](https://www.mercadopago.com.ar/developers/panel/app)
2. Seleccionar tu aplicación → **Cuentas de prueba**
3. Crear al menos 2 usuarios:
   - Un **VENDEDOR** (para la app)
   - Un **COMPRADOR** (para simular pagos)

---

## Tarjetas de Prueba (Argentina)

| Tipo | Número | CVV | Vencimiento |
|------|--------|-----|-------------|
| Visa | 4509 9535 6623 3704 | 123 | 11/30 |
| Mastercard | 5031 7557 3453 0604 | 123 | 11/30 |
| American Express | 3711 8030 3257 522 | 1234 | 11/30 |

### Nombres para Simular Resultados

| Nombre Titular | Resultado |
|----------------|-----------|
| `APRO` | Pago aprobado |
| `CONT` | Pago pendiente |
| `FUND` | Fondos insuficientes |
| `SECU` | Error de seguridad |
| `OTHE` | Error general |

**DNI de prueba**: 12345678

---

## Endpoints del Webhook

### Públicos (los llama Mercado Pago)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/webhooks/mercadopago` | Recibe notificaciones de MP |
| GET | `/api/webhooks/mercadopago/health` | Health check |

### Protegidos (requieren admin)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/webhooks/mercadopago/manual/:paymentId` | Procesar pago manualmente |
| GET | `/api/webhooks/mercadopago/stats` | Estadísticas de webhooks |
| GET | `/api/webhooks/mercadopago/failed` | Lista webhooks fallidos |
| POST | `/api/webhooks/mercadopago/retry/:webhookId` | Reintentar webhook |
| POST | `/api/webhooks/mercadopago/reset/:webhookId` | Resetear webhook |

---

## Flujo de Pago

```
1. Cliente selecciona productos en el frontend
                    ↓
2. Frontend crea venta → Backend guarda venta (estado: pendiente)
                    ↓
3. Backend crea preferencia de pago en MP
                    ↓
4. Cliente es redirigido al checkout de MP
                    ↓
5. Cliente completa el pago
                    ↓
6. MP envía webhook a /api/webhooks/mercadopago
                    ↓
7. Backend valida firma, consulta API de MP (fuente de verdad)
                    ↓
8. Backend actualiza venta:
   - Si aprobado: descuenta stock, crea envío, envía email
   - Si rechazado: marca como rechazado
   - Si pendiente: mantiene pendiente
                    ↓
9. Cliente es redirigido a URL de éxito/fallo/pendiente
```

---

## Troubleshooting

### Webhook no llega

1. Verificar que la URL sea HTTPS y accesible desde internet
2. Verificar logs de ngrok/servidor
3. Revisar panel de MP → Tu aplicación → Webhooks → Historial

### Firma inválida

1. Verificar que `MERCADOPAGO_WEBHOOK_SECRET` sea correcto
2. En desarrollo, la validación de firma se relaja automáticamente

### Pago no se procesa

1. Revisar logs del backend
2. Verificar tabla `mercado_pago_payments` en BD
3. Verificar tabla `failed_webhooks` para errores
4. Usar endpoint `/api/webhooks/mercadopago/manual/:paymentId` para reprocesar

---

## Seguridad

1. **Nunca** exponer credenciales en el código
2. **Siempre** validar la firma de los webhooks en producción
3. **Nunca** confiar en los datos del webhook - consultar API de MP
4. Usar HTTPS obligatoriamente en producción
