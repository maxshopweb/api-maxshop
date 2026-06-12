/**
 * Eventos relacionados con ventas
 * Tipos tipados para eventos del sistema
 */

export enum SaleEventType {
  SALE_CREATED = 'SALE_CREATED',
  MP_PAYMENT_UPDATED = 'MP_PAYMENT_UPDATED',
}

/**
 * Payload del evento SALE_CREATED
 * Incluye datos completos de la venta para que los handlers puedan procesarla
 */
import { IVenta } from '../../types';

export interface SaleCreatedPayload {
  // Datos básicos
  id_venta: number;
  estado_pago: 'pendiente' | 'aprobado' | 'cancelado' | 'rechazado';
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

/** Payload emitido cuando Mercado Pago actualiza el estado de un pago */
export interface MpPaymentUpdatedPayload {
  id_venta: number;
  payment_id: string;
  status_mp: string;
  estado_pago: string;
  fecha: string;
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

  static createMpPaymentUpdated(payload: MpPaymentUpdatedPayload): { type: SaleEventType.MP_PAYMENT_UPDATED; payload: MpPaymentUpdatedPayload; timestamp: string } {
    return {
      type: SaleEventType.MP_PAYMENT_UPDATED,
      payload,
      timestamp: new Date().toISOString(),
    };
  }
}

