/**
 * Eventos relacionados con ventas
 * Tipos tipados para eventos del sistema
 */

export enum SaleEventType {
  SALE_CREATED = 'SALE_CREATED',
  // Preparado para futuros eventos:
  // SALE_UPDATED = 'SALE_UPDATED',
  // SALE_CANCELLED = 'SALE_CANCELLED',
  // SALE_PAYMENT_CONFIRMED = 'SALE_PAYMENT_CONFIRMED',
}

/**
 * Payload del evento SALE_CREATED
 * Solo incluye datos mínimos necesarios (sin información sensible)
 */
export interface SaleCreatedPayload {
  id_venta: number;
  estado_pago: 'pendiente' | 'aprobado' | 'cancelado';
  fecha: string; // ISO string
}

/**
 * Estructura base de un evento de venta
 */
export interface SaleEvent {
  type: SaleEventType;
  payload: SaleCreatedPayload;
  timestamp: string; // ISO string
}

/**
 * Factory para crear eventos de venta
 */
export class SaleEventFactory {
  static createSaleCreated(payload: SaleCreatedPayload): SaleEvent {
    return {
      type: SaleEventType.SALE_CREATED,
      payload,
      timestamp: new Date().toISOString(),
    };
  }
}

