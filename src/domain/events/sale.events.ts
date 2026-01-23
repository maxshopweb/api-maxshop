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
 * Incluye datos completos de la venta para que los handlers puedan procesarla
 */
import { IVenta } from '../../types';

export interface SaleCreatedPayload {
  // Datos básicos
  id_venta: number;
  estado_pago: 'pendiente' | 'aprobado' | 'cancelado';
  fecha: string; // ISO string
  
  // Datos completos de la venta (para handlers que los necesiten)
  venta?: IVenta | null;
  
  // Metadatos adicionales
  paymentData?: {
    metodoPago?: string;
    transactionId?: string;
    paymentDate?: string; // ISO string
    notas?: string;
  };
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

