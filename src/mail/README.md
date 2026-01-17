# Sistema de Mails Profesional - Brevo

Sistema centralizado y escalable para el envío de emails transaccionales usando Brevo (Sendinblue) API v3.

## 🏗️ Arquitectura

El sistema está diseñado con una arquitectura modular y preparada para extensión futura a WhatsApp:

```
src/mail/
├── mail.types.ts      # Tipos TypeScript y definiciones
├── mail.events.ts     # Eventos de negocio reutilizables
├── brevo.client.ts    # Cliente HTTP para Brevo API
├── mail.templates.ts  # Templates HTML dinámicos
├── mail.service.ts    # Servicio centralizado (CORE)
└── index.ts           # Exportaciones
```

## 📦 Componentes

### `mail.types.ts`
Define todos los tipos TypeScript necesarios:
- `MailChannel`: 'email' | 'whatsapp' (preparado para futuro)
- `MailRecipient`: Destinatario del email
- `MailPayload`: Payload completo para enviar un mail
- `MailEventData`: Datos genéricos para templates
- Tipos específicos por evento (OrderEventData, ShippingEventData, etc.)

### `mail.events.ts`
Eventos de negocio independientes del canal:
- `ORDER_PENDING`: Pedido pendiente
- `ORDER_CONFIRMED`: Pedido confirmado
- `ORDER_CANCELLED`: Pedido cancelado
- `SHIPPING_PREPARING`: Envío en preparación
- `SHIPPING_SENT`: Envío despachado
- `SHIPPING_DELIVERED`: Envío entregado
- `PROMOTION`: Promoción
- `ABANDONED_CART`: Carrito abandonado
- `GENERIC`: Email genérico

### `brevo.client.ts`
Cliente HTTP para interactuar con Brevo API:
- Maneja headers, API Key y base URL
- Función `sendTransactionalEmail()` genérica
- Validación de configuración
- Manejo de errores

### `mail.templates.ts`
Templates HTML dinámicos:
- Layout base reutilizable (header + footer)
- Templates específicos por evento
- Variables dinámicas
- Diseño responsive y profesional

### `mail.service.ts` (CORE)
Servicio centralizado que:
- Recibe eventos de negocio
- Genera templates correspondientes
- Envía emails usando Brevo
- Loguea errores sin romper la app
- **NO debe ser llamado desde controllers**

## 🚀 Uso

### Importar el servicio

```typescript
import mailService from '../mail';
// o
import { mailService, MailEventType } from '../mail';
```

### Enviar un email genérico

```typescript
await mailService.send({
    event: MailEventType.ORDER_CONFIRMED,
    to: {
        email: 'cliente@example.com',
        name: 'Juan Pérez',
    },
    data: {
        orderId: 123,
        total: 1500.50,
        totalFormatted: '$1,500.50',
        fecha: new Date(),
        metodoPago: 'Mercado Pago',
        estadoPago: 'confirmado',
        productos: [
            {
                nombre: 'Producto 1',
                cantidad: 2,
                precioUnitario: 750.25,
                subtotal: 1500.50,
            },
        ],
        cliente: {
            email: 'cliente@example.com',
            nombre: 'Juan',
            apellido: 'Pérez',
        },
    },
    tags: ['pedido', 'confirmacion'],
});
```

### Métodos helper específicos

El servicio incluye métodos helper para facilitar el uso:

```typescript
// Confirmación de pedido
await mailService.sendOrderConfirmation({
    orderId: 123,
    total: 1500.50,
    totalFormatted: '$1,500.50',
    fecha: new Date(),
    metodoPago: 'Mercado Pago',
    estadoPago: 'confirmado',
    productos: [...],
    cliente: {
        email: 'cliente@example.com',
        nombre: 'Juan',
        apellido: 'Pérez',
    },
});

// Pedido pendiente
await mailService.sendOrderPending({...});

// Pedido cancelado
await mailService.sendOrderCancelled({...});

// Envío en preparación
await mailService.sendShippingPreparing({...});

// Envío despachado
await mailService.sendShippingSent({
    orderId: 123,
    trackingCode: 'ABC123',
    carrier: 'Andreani',
    estimatedArrival: 'Mañana',
    cliente: {...},
});

// Envío entregado
await mailService.sendShippingDelivered({...});

// Promoción
await mailService.sendPromotion({
    title: 'Oferta Especial',
    description: 'Descuento del 20%',
    discountCode: 'DESC20',
    validUntil: new Date('2025-12-31'),
    cliente: {...},
});

// Carrito abandonado
await mailService.sendAbandonedCart({
    productos: [...],
    total: 1500.50,
    recoveryLink: 'https://maxshop.com/cart/recover/abc123',
    cliente: {...},
});
```

## ⚙️ Configuración

### Variables de entorno

Asegúrate de tener estas variables en tu `.env`:

```env
BREVO_API_KEY=tu_api_key_aqui
BREVO_SENDER_EMAIL=appmaxshop2025@gmail.com
BREVO_SENDER_NAME=MaxShop
NODE_ENV=development|production
```

### Modo desarrollo vs producción

- **Development**: Loguea payloads completos y permite debugging
- **Production**: Envío real al usuario final

## 🔒 Reglas de uso

1. **NO llamar desde controllers**: El servicio debe ser usado desde otros servicios de negocio (ej: `ventas.service.ts`)
2. **Manejo de errores**: Los errores se loguean pero no interrumpen el flujo del negocio
3. **No bloqueante**: Los emails se envían de forma asíncrona y no bloquean operaciones críticas

## 🔮 Preparación para WhatsApp

La arquitectura está preparada para extensión futura a WhatsApp:

- Los eventos (`MailEventType`) son independientes del canal
- Los datos (`MailEventData`) pueden reutilizarse
- El tipo `MailChannel` ya está definido ('email' | 'whatsapp')
- Solo será necesario agregar un nuevo cliente (ej: `whatsapp.client.ts`) y extender `mail.service.ts`

## 📝 Ejemplo de integración

Ver `src/services/ventas.service.ts` para un ejemplo completo de cómo integrar el servicio en un servicio de negocio existente.

## 🐛 Troubleshooting

### Error: "BREVO_API_KEY no configurada"
- Verifica que la variable `BREVO_API_KEY` esté en tu `.env`
- Reinicia el servidor después de agregar la variable

### Error: "Brevo API error"
- Verifica que la API Key sea válida
- Revisa los logs para ver el error específico de Brevo
- Asegúrate de que el remitente (`BREVO_SENDER_EMAIL`) esté verificado en Brevo

### Emails no se envían
- Verifica la configuración en modo desarrollo
- Revisa los logs del servidor
- Verifica que el destinatario sea válido

