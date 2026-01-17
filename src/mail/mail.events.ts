/**
 * Eventos de negocio reutilizables
 * Estos eventos son independientes del canal (email/whatsapp)
 * y pueden ser reutilizados para diferentes canales de comunicación
 */

/**
 * Tipos de eventos de negocio
 * Cada evento representa una acción o estado del negocio
 */
export enum MailEventType {
    // Eventos de Pedidos
    ORDER_PENDING = 'ORDER_PENDING',
    ORDER_CONFIRMED = 'ORDER_CONFIRMED',
    ORDER_CANCELLED = 'ORDER_CANCELLED',
    PAYMENT_INSTRUCTIONS = 'PAYMENT_INSTRUCTIONS',
    
    // Eventos de Envíos
    SHIPPING_PREPARING = 'SHIPPING_PREPARING',
    SHIPPING_SENT = 'SHIPPING_SENT',
    SHIPPING_DELIVERED = 'SHIPPING_DELIVERED',
    
    // Eventos de Marketing
    PROMOTION = 'PROMOTION',
    ABANDONED_CART = 'ABANDONED_CART',
    
    // Eventos genéricos
    GENERIC = 'GENERIC',
}

/**
 * Mapeo de eventos a nombres legibles
 */
export const MailEventNames: Record<MailEventType, string> = {
    [MailEventType.ORDER_PENDING]: 'Pedido Pendiente',
    [MailEventType.ORDER_CONFIRMED]: 'Pedido Confirmado',
    [MailEventType.ORDER_CANCELLED]: 'Pedido Cancelado',
    [MailEventType.PAYMENT_INSTRUCTIONS]: 'Instrucciones de Pago',
    [MailEventType.SHIPPING_PREPARING]: 'Envío en Preparación',
    [MailEventType.SHIPPING_SENT]: 'Envío Despachado',
    [MailEventType.SHIPPING_DELIVERED]: 'Envío Entregado',
    [MailEventType.PROMOTION]: 'Promoción',
    [MailEventType.ABANDONED_CART]: 'Carrito Abandonado',
    [MailEventType.GENERIC]: 'Email Genérico',
};

/**
 * Verifica si un evento es válido
 */
export function isValidMailEvent(event: string): event is MailEventType {
    return Object.values(MailEventType).includes(event as MailEventType);
}

