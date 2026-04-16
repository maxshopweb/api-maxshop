/**
 * Tipos y definiciones para el sistema de mails
 * Preparado para extensión futura a WhatsApp
 */

import { MailEventType } from './mail.events';
import type { IDatosBancarios } from '../types/config-tienda.type';

/**
 * Canal de comunicación
 * Actualmente solo 'email', preparado para 'whatsapp' en el futuro
 */
export type MailChannel = 'email' | 'whatsapp';

/**
 * Destinatario del mail
 */
export interface MailRecipient {
    email: string;
    name?: string;
}

/**
 * Datos genéricos para templates
 * Cada evento puede tener sus propios datos específicos
 */
export interface MailEventData {
    [key: string]: any;
}

/**
 * Payload para enviar un mail
 */
export interface MailPayload {
    event: MailEventType;
    to: MailRecipient | MailRecipient[];
    data: MailEventData;
    channel?: MailChannel; // Por defecto 'email'
    cc?: MailRecipient[];
    bcc?: MailRecipient[];
    replyTo?: MailRecipient;
    tags?: string[];
    scheduledAt?: Date;
}

/**
 * Respuesta de Brevo al enviar un email
 */
export interface BrevoResponse {
    messageId: string;
}

/**
 * Configuración del remitente
 */
export interface MailSender {
    email: string;
    name: string;
}

/**
 * Template generado
 */
export interface MailTemplate {
    subject: string;
    htmlContent: string;
    textContent?: string;
}

/**
 * Datos específicos para eventos de pedidos
 */
export interface OrderEventData extends MailEventData {
    orderId: number | string;
    orderNumber?: string;
    total?: number;
    totalFormatted?: string;
    fecha?: Date | string;
    metodoPago?: string;
    estadoPago?: string;
    productos?: Array<{
        nombre: string;
        cantidad: number;
        precioUnitario: number;
        subtotal: number;
    }>;
    cliente?: {
        nombre?: string;
        apellido?: string;
        email?: string;
    };
    /** Retiro en tienda (observaciones); muestra texto en templates de pedido */
    esRetiroEnTienda?: boolean;
}

/**
 * Datos específicos para eventos de envíos
 */
export interface ShippingEventData extends MailEventData {
    orderId: number | string;
    trackingCode?: string;
    carrier?: string;
    estimatedArrival?: string;
    shippingAddress?: string;
    estadoEnvio?: string;
}

/**
 * Datos específicos para promociones
 */
export interface PromotionEventData extends MailEventData {
    title?: string;
    description?: string;
    discountCode?: string;
    discountPercentage?: number;
    validUntil?: Date | string;
    products?: Array<{
        nombre: string;
        precio?: number;
        precioDescuento?: number;
    }>;
}

/**
 * Datos específicos para carrito abandonado
 */
export interface AbandonedCartEventData extends MailEventData {
    productos?: Array<{
        nombre: string;
        cantidad: number;
        precio: number;
    }>;
    total?: number;
    totalFormatted?: string;
    recoveryLink?: string;
}

/**
 * Datos específicos para instrucciones de pago
 */
export interface PaymentInstructionsEventData extends MailEventData {
    orderId: number | string;
    total?: number;
    totalFormatted?: string;
    metodoPago: string;
    cliente?: {
        nombre?: string;
        apellido?: string;
        email?: string;
    };
    /** Datos bancarios del negocio (tabla negocio). Si no viene, el template usa fallback. */
    datosBancarios?: IDatosBancarios | null;
}

/**
 * Datos para emails de bienvenida (invitado o usuario registrado)
 */
export interface WelcomeEventData extends MailEventData {
    email: string;
    nombre?: string;
    apellido?: string;
}

