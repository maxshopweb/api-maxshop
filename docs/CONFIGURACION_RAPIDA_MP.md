# ⚡ Configuración Rápida - Mercado Pago Sandbox

## 🎯 Configuración en 5 Minutos

### Paso 1: Obtener Credenciales de Prueba

1. Ve a: https://www.mercadopago.com.ar/developers/panel/app
2. Selecciona tu aplicación → **Credenciales de prueba**
3. Copia:
   - `Access Token` → `MERCADOPAGO_ACCESS_TOKEN_TEST`
   - `Public Key` → `MERCADOPAGO_PUBLIC_KEY_TEST` (opcional, para frontend)

### Paso 2: Obtener Email del Usuario de Prueba

**Opción A: Usar el endpoint del backend (MÁS FÁCIL)**

```bash
# Con el backend corriendo
curl http://localhost:3001/api/webhooks/mercadopago/test-user-info
```

Te mostrará el email sugerido. Cópialo.

**Opción B: Desde el Panel de MP**

1. Panel MP → Tu aplicación → **Cuentas de prueba**
2. Crea un usuario COMPRADOR si no tienes uno
3. El email tiene formato: `test_user_XXXXXXX@testuser.com`
   - Donde `XXXXXXX` es el ID del usuario

**Opción C: Usar el script**

```bash
cd backend
node scripts/get-mp-test-user-email.js
```

### Paso 3: Configurar ngrok (para webhooks)

```bash
# Instalar ngrok si no lo tenés
brew install ngrok

# Autenticar (crear cuenta gratis en ngrok.com)
ngrok config add-authtoken TU_TOKEN

# Exponer el backend
ngrok http 3001
```

Copia la URL HTTPS (ej: `https://abc123.ngrok.io`)

### Paso 4: Configurar Webhook en MP

1. Panel MP → Tu aplicación → **Webhooks**
2. Agregar URL: `https://tu-url-ngrok.ngrok.io/api/webhooks/mercadopago`
3. Seleccionar eventos: **Pagos**
4. Guardar y copiar la **Firma secreta**

### Paso 5: Actualizar .env

```env
# ============================================
# MERCADO PAGO - SANDBOX (PRUEBAS)
# ============================================

MERCADOPAGO_ENV=test

# Credenciales de prueba
MERCADOPAGO_ACCESS_TOKEN_TEST=TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MERCADOPAGO_PUBLIC_KEY_TEST=TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Email del usuario COMPRADOR de prueba (IMPORTANTE)
# Este es el email que usarás para iniciar sesión en MP sandbox
MERCADOPAGO_TEST_USER_EMAIL=test_user_123456789@testuser.com

# Webhook
MERCADOPAGO_WEBHOOK_URL=https://tu-url-ngrok.ngrok.io/api/webhooks/mercadopago
MERCADOPAGO_WEBHOOK_SECRET=tu_firma_secreta_copiada_del_panel

# URLs de retorno (opcional - se construyen automáticamente)
DEFAULT_SUCCESS_URL=http://localhost:3000/checkout/resultado?status=approved
DEFAULT_FAILURE_URL=http://localhost:3000/checkout/resultado?status=rejected
DEFAULT_PENDING_URL=http://localhost:3000/checkout/resultado?status=pending
```

### Paso 6: Reiniciar Backend

```bash
cd backend
npm run dev
```

Deberías ver:
```
✅ [MercadoPagoService] Inicializado en modo SANDBOX
📧 [MercadoPagoService] Email de usuario de prueba: test_user_XXXXXXX@testuser.com
✅ [PaymentWebhookService] Inicializado
✅ [FailedWebhookRetry] Iniciando worker
```

---

## 🧪 Probar el Flujo Completo

### 1. Crear Pedido

1. Ve a tu frontend
2. Agrega productos al carrito
3. Completa checkout (pasos 2 y 3)
4. Selecciona **Mercado Pago**
5. Haz clic en **Confirmar pedido**

**Deberías ser redirigido automáticamente a MP sandbox**

### 2. Completar Pago en MP

1. **Inicia sesión** en MP con el usuario COMPRADOR de prueba
   - Usuario: El que te dio MP al crear la cuenta
   - Contraseña: La que configuraste

2. **Agrega tarjeta de prueba**:
   - Número: `4509 9535 6623 3704`
   - CVV: `123`
   - Vencimiento: `11/30`
   - **Nombre del titular**: `APRO` (para aprobar)
   - **DNI**: `12345678`

3. **Haz clic en "Pagar"**

### 3. Verificar Webhook

En los logs del backend deberías ver:

```
📨 [WebhookController] Webhook recibido: { action: 'payment.updated', ... }
✅ [WebhookSignature] Firma válida
🔄 [PaymentWebhookService] Procesando pago: XXXXXX
💰 [PaymentWebhookService] Pago APROBADO - Ejecutando confirmación
✅ [PaymentWebhookService] Pago procesado - Venta #X → aprobado
```

### 4. Verificar en Base de Datos

```sql
-- Ver pago de MP registrado
SELECT * FROM mercado_pago_payments ORDER BY created_at DESC LIMIT 1;

-- Ver venta actualizada
SELECT id_venta, estado_pago, metodo_pago FROM venta WHERE id_venta = X;
```

---

## 🔧 Endpoints Útiles

### Obtener email del usuario de prueba
```bash
GET http://localhost:3001/api/webhooks/mercadopago/test-user-info
```

### Estadísticas de webhooks (requiere admin)
```bash
GET http://localhost:3001/api/webhooks/mercadopago/stats
Authorization: Bearer TU_TOKEN
```

### Procesar pago manualmente (requiere admin)
```bash
POST http://localhost:3001/api/webhooks/mercadopago/manual/PAYMENT_ID
Authorization: Bearer TU_TOKEN
```

---

## ⚠️ Si el Botón "Pagar" Sigue Deshabilitado

1. **Verifica el email**:
   ```bash
   curl http://localhost:3001/api/webhooks/mercadopago/test-user-info
   ```
   
2. **Actualiza .env** con el email correcto:
   ```env
   MERCADOPAGO_TEST_USER_EMAIL=test_user_XXXXXXX@testuser.com
   ```

3. **Reinicia el backend**

4. **Asegúrate de iniciar sesión en MP** con el mismo email que configuraste

---

## 📋 Checklist de Configuración

- [ ] Credenciales de prueba obtenidas
- [ ] Email del usuario de prueba configurado en .env
- [ ] ngrok corriendo y URL copiada
- [ ] Webhook configurado en panel de MP
- [ ] Firma secreta copiada a .env
- [ ] Backend reiniciado
- [ ] Logs muestran "Inicializado en modo SANDBOX"
- [ ] Usuario de prueba creado en MP
- [ ] Probado crear pedido y redirección a MP
- [ ] Probado pago con tarjeta de prueba
- [ ] Webhook recibido y procesado
- [ ] Venta actualizada en BD

---

## 🎉 Una Vez que Funcione

Cuando todo esté funcionando, podrás:
- ✅ Crear pedidos con Mercado Pago
- ✅ Recibir webhooks automáticamente
- ✅ Actualizar ventas cuando se aprueban pagos
- ✅ Descontar stock automáticamente
- ✅ Crear envíos en Andreani
- ✅ Enviar emails de confirmación

**¡Listo para avanzar a la Fase 4 (Event Bus)!** 🚀
