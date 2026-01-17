# Implementación WebSockets Escalable - Sistema de Notificaciones

## 📋 Resumen

Sistema de notificaciones en tiempo real para ventas nuevas, usando WebSockets con arquitectura escalable y preparada para múltiples instancias.

## 🏗️ Arquitectura

### Backend

```
api/src/
├── domain/
│   └── events/
│       └── sale.events.ts          # Tipos de eventos tipados
├── infrastructure/
│   ├── event-bus/
│   │   ├── event-bus.interface.ts # Interfaz del Event Bus
│   │   └── event-bus.ts           # Event Bus con Redis Pub/Sub + fallback
│   └── websocket/
│       └── websocket.server.ts     # Servidor WebSocket con autenticación
└── services/
    ├── ventas.service.ts          # Emite SALE_CREATED al crear ventas
    └── payment-processing.service.ts # Emite SALE_CREATED al confirmar pagos
```

### Frontend

```
client/src/app/
├── stores/
│   └── notificationsStore.ts      # Store Zustand para notificaciones
├── lib/
│   └── websocket.ts               # Cliente WebSocket con reconexión
├── hooks/
│   └── useWebSocket.ts             # Hook para inicializar WebSocket
└── components/
    └── Admin/
        └── SideBar.tsx             # Badge de notificaciones
```

## 🔄 Flujo de Eventos

1. **Creación de Venta**:
   - `VentasService.create()` o `VentasService.createFromCheckout()` crea una venta
   - Se emite evento `SALE_CREATED` al Event Bus
   - Event Bus propaga el evento (localmente y/o vía Redis Pub/Sub)
   - WebSocket Server escucha el evento y lo transmite a todos los admins conectados

2. **Confirmación de Pago**:
   - `PaymentProcessingService.confirmPayment()` confirma un pago
   - Se emite evento `SALE_CREATED` (venta en estado aprobado)
   - Mismo flujo de propagación

3. **Recepción en Frontend**:
   - Cliente WebSocket recibe el evento
   - Store Zustand actualiza `hasNewSales = true`
   - Sidebar muestra badge
   - Al entrar a `/admin/ventas`, se limpia el estado

## 🔐 Autenticación

- El cliente WebSocket envía el token Firebase JWT al conectar
- El servidor valida el token con Firebase Admin
- Verifica que el usuario tenga rol `ADMIN`
- Si no es admin, se cierra la conexión

## 📡 WebSocket Server

- **Ruta**: `/ws`
- **Autenticación**: Firebase JWT (enviado en mensaje `auth`)
- **Eventos emitidos**:
  - `welcome`: Mensaje de bienvenida
  - `auth_success`: Autenticación exitosa
  - `auth_error`: Error de autenticación
  - `event`: Evento del sistema (ej: `SALE_CREATED`)

## 🔌 Cliente WebSocket

- **Reconexión automática**: Hasta 10 intentos con backoff exponencial
- **Heartbeat**: Ping cada 30 segundos para mantener conexión viva
- **Manejo de errores**: Reintentos automáticos y logging

## 🚀 Escalabilidad

### Con Redis (Múltiples Instancias)

- Event Bus usa Redis Pub/Sub para propagar eventos entre instancias
- Cada instancia escucha eventos de otras instancias
- WebSocket Server de cada instancia transmite a sus clientes conectados

### Sin Redis (Instancia Única)

- Event Bus usa EventEmitter en memoria
- Funciona perfectamente para una sola instancia
- Fallback automático si Redis no está disponible

## 📦 Dependencias

### Backend
- `ws`: Servidor WebSocket
- `ioredis`: Cliente Redis (ya existente)

### Frontend
- `zustand`: Store de estado (ya existente)

## 🔧 Configuración

### Variables de Entorno (Backend)

```env
# Redis (opcional)
ENABLE_REDIS=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Firebase (requerido)
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

### Variables de Entorno (Frontend)

```env
# WebSocket URL (opcional, por defecto usa localhost:3001)
NEXT_PUBLIC_WS_URL=localhost:3001
# O para producción:
NEXT_PUBLIC_WS_URL=wss://api.tudominio.com
```

## 🧪 Pruebas

1. **Crear una venta**:
   - Crear venta desde admin o checkout
   - Verificar que el badge aparezca en el sidebar
   - Verificar logs del servidor

2. **Confirmar pago**:
   - Confirmar pago de una venta pendiente
   - Verificar que el badge aparezca

3. **Múltiples admins**:
   - Conectar múltiples navegadores como admin
   - Crear una venta
   - Verificar que todos reciban la notificación

4. **Reconexión**:
   - Desconectar el servidor
   - Verificar que el cliente intente reconectar
   - Reconectar el servidor
   - Verificar que se reconecte automáticamente

## 📝 Eventos Futuros

El sistema está preparado para agregar más eventos:

```typescript
// En sale.events.ts
export enum SaleEventType {
  SALE_CREATED = 'SALE_CREATED',
  SALE_UPDATED = 'SALE_UPDATED',      // Futuro
  SALE_CANCELLED = 'SALE_CANCELLED',  // Futuro
  // ...
}
```

## 🐛 Troubleshooting

### El WebSocket no se conecta
- Verificar que el servidor esté corriendo
- Verificar que la URL del WebSocket sea correcta
- Verificar logs del servidor para errores de autenticación

### No se reciben notificaciones
- Verificar que el usuario sea admin
- Verificar logs del Event Bus
- Verificar que Redis esté funcionando (si se usa)

### El badge no aparece
- Verificar que el WebSocket esté conectado
- Verificar que el store de notificaciones esté actualizado
- Verificar la consola del navegador para errores

## 📚 Referencias

- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Redis Pub/Sub](https://redis.io/docs/manual/pubsub/)
- [Zustand](https://github.com/pmndrs/zustand)

