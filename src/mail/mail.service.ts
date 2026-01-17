import { MailEventType } from './mail.events';
import { MailPayload, MailRecipient, BrevoResponse } from './mail.types';
import { brevoClient } from './brevo.client';
import { getMailTemplate } from './mail.templates';

/**
 * Servicio de mails
 * NO debe ser llamado directamente desde controllers
 * Debe ser usado desde otros servicios de negocio
 */
export class MailService {
    private readonly isDevelopment: boolean;

    constructor() {
        this.isDevelopment = process.env.NODE_ENV === 'development';
    }

    /**
     * Envía un email según un evento de negocio
     * 
     * @param payload - Payload con evento, destinatarios y datos
     * @returns Promise con la respuesta de Brevo
     */
    async send(payload: MailPayload): Promise<BrevoResponse> {
        try {
            // Validar configuración
            if (!brevoClient.isConfigured()) {
                console.warn('⚠️ [MailService] Brevo no está configurado. Email no enviado.');
                throw new Error('Brevo no está configurado');
            }

            // En desarrollo, opcionalmente redirigir todos los emails a un destinatario de prueba
            const recipients = this.getRecipients(payload);

            // Generar template según el evento
            const template = getMailTemplate(payload.event, payload.data);

            // Log en desarrollo
            if (this.isDevelopment) {
                console.log('📧 [MailService] Enviando email:', {
                    event: payload.event,
                    to: recipients.map((r) => r.email),
                    subject: template.subject,
                });
                console.log('📧 [MailService] Payload completo:', JSON.stringify(payload, null, 2));
            }

            // Enviar email usando Brevo
            const response = await brevoClient.sendTransactionalEmail(
                template,
                recipients,
                {
                    cc: payload.cc,
                    bcc: payload.bcc,
                    replyTo: payload.replyTo,
                    tags: payload.tags,
                    scheduledAt: payload.scheduledAt,
                    params: payload.data, // Pasar datos como params para templates dinámicos de Brevo
                }
            );

            console.log(`✅ [MailService] Email enviado exitosamente. MessageId: ${response.messageId}`);

            return response;
        } catch (error) {
            console.error('❌ [MailService] Error al enviar email:', error);
            // No lanzar error para no interrumpir el flujo del negocio
            // En producción, podrías querer lanzar el error o guardarlo en una cola
            throw error;
        }
    }

    /**
     * Obtiene los destinatarios, aplicando lógica de desarrollo si es necesario
     */
    private getRecipients(payload: MailPayload): MailRecipient[] {
        const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];

        // En desarrollo, opcionalmente redirigir a un email de prueba
        // Descomentar si quieres que todos los emails vayan a un destinatario de prueba
        // if (this.isDevelopment && process.env.DEV_EMAIL_REDIRECT) {
        //     return [{
        //         email: process.env.DEV_EMAIL_REDIRECT,
        //         name: 'Desarrollo',
        //     }];
        // }

        return recipients;
    }

    /**
     * Envía un email de confirmación de pedido
     * Método helper para facilitar el uso desde otros servicios
     */
    async sendOrderConfirmation(
        orderData: {
            orderId: number | string;
            orderNumber?: string;
            total: number;
            totalFormatted?: string;
            fecha: Date | string;
            metodoPago: string;
            estadoPago: string;
            productos?: Array<{
                nombre: string;
                cantidad: number;
                precioUnitario: number;
                subtotal: number;
            }>;
            cliente: {
                email: string;
                nombre?: string;
                apellido?: string;
            };
            trackingCode?: string; // Número de seguimiento del pre-envío
            carrier?: string; // Transportista (ej: 'Andreani')
        }
    ): Promise<BrevoResponse> {
        return this.send({
            event: MailEventType.ORDER_CONFIRMED,
            to: {
                email: orderData.cliente.email,
                name: `${orderData.cliente.nombre || ''} ${orderData.cliente.apellido || ''}`.trim() || 'Cliente',
            },
            data: {
                orderId: orderData.orderId,
                orderNumber: orderData.orderNumber,
                total: orderData.total,
                totalFormatted: orderData.totalFormatted,
                fecha: orderData.fecha,
                metodoPago: orderData.metodoPago,
                estadoPago: orderData.estadoPago,
                productos: orderData.productos,
                cliente: orderData.cliente,
                trackingCode: orderData.trackingCode,
                carrier: orderData.carrier,
            },
            tags: ['pedido', 'confirmacion'],
        });
    }

    /**
     * Envía un email de pedido pendiente
     */
    async sendOrderPending(
        orderData: {
            orderId: number | string;
            orderNumber?: string;
            total: number;
            totalFormatted?: string;
            fecha: Date | string;
            cliente: {
                email: string;
                nombre?: string;
                apellido?: string;
            };
        }
    ): Promise<BrevoResponse> {
        return this.send({
            event: MailEventType.ORDER_PENDING,
            to: {
                email: orderData.cliente.email,
                name: `${orderData.cliente.nombre || ''} ${orderData.cliente.apellido || ''}`.trim() || 'Cliente',
            },
            data: {
                orderId: orderData.orderId,
                orderNumber: orderData.orderNumber,
                total: orderData.total,
                totalFormatted: orderData.totalFormatted,
                fecha: orderData.fecha,
                cliente: orderData.cliente,
            },
            tags: ['pedido', 'pendiente'],
        });
    }

    /**
     * Envía un email con instrucciones de pago (datos bancarios)
     */
    async sendPaymentInstructions(
        orderData: {
            orderId: number | string;
            total: number;
            totalFormatted?: string;
            metodoPago: string;
            cliente: {
                email: string;
                nombre?: string;
                apellido?: string;
            };
        }
    ): Promise<BrevoResponse> {
        return this.send({
            event: MailEventType.PAYMENT_INSTRUCTIONS,
            to: {
                email: orderData.cliente.email,
                name: `${orderData.cliente.nombre || ''} ${orderData.cliente.apellido || ''}`.trim() || 'Cliente',
            },
            data: {
                orderId: orderData.orderId,
                total: orderData.total,
                totalFormatted: orderData.totalFormatted,
                metodoPago: orderData.metodoPago,
                cliente: orderData.cliente,
            },
            tags: ['pago', 'instrucciones'],
        });
    }

    /**
     * Envía un email de pedido cancelado
     */
    async sendOrderCancelled(
        orderData: {
            orderId: number | string;
            orderNumber?: string;
            cliente: {
                email: string;
                nombre?: string;
                apellido?: string;
            };
        }
    ): Promise<BrevoResponse> {
        return this.send({
            event: MailEventType.ORDER_CANCELLED,
            to: {
                email: orderData.cliente.email,
                name: `${orderData.cliente.nombre || ''} ${orderData.cliente.apellido || ''}`.trim() || 'Cliente',
            },
            data: {
                orderId: orderData.orderId,
                orderNumber: orderData.orderNumber,
                cliente: orderData.cliente,
            },
            tags: ['pedido', 'cancelado'],
        });
    }

    /**
     * Envía un email de envío en preparación
     */
    async sendShippingPreparing(
        shippingData: {
            orderId: number | string;
            cliente: {
                email: string;
                nombre?: string;
            };
        }
    ): Promise<BrevoResponse> {
        return this.send({
            event: MailEventType.SHIPPING_PREPARING,
            to: {
                email: shippingData.cliente.email,
                name: shippingData.cliente.nombre || 'Cliente',
            },
            data: {
                orderId: shippingData.orderId,
                cliente: shippingData.cliente,
            },
            tags: ['envio', 'preparacion'],
        });
    }

    /**
     * Envía un email de envío despachado
     */
    async sendShippingSent(
        shippingData: {
            orderId: number | string;
            trackingCode?: string;
            carrier?: string;
            estimatedArrival?: string;
            cliente: {
                email: string;
                nombre?: string;
            };
        }
    ): Promise<BrevoResponse> {
        return this.send({
            event: MailEventType.SHIPPING_SENT,
            to: {
                email: shippingData.cliente.email,
                name: shippingData.cliente.nombre || 'Cliente',
            },
            data: {
                orderId: shippingData.orderId,
                trackingCode: shippingData.trackingCode,
                carrier: shippingData.carrier,
                estimatedArrival: shippingData.estimatedArrival,
                cliente: shippingData.cliente,
            },
            tags: ['envio', 'despachado'],
        });
    }

    /**
     * Envía un email de envío entregado
     */
    async sendShippingDelivered(
        shippingData: {
            orderId: number | string;
            cliente: {
                email: string;
                nombre?: string;
            };
        }
    ): Promise<BrevoResponse> {
        return this.send({
            event: MailEventType.SHIPPING_DELIVERED,
            to: {
                email: shippingData.cliente.email,
                name: shippingData.cliente.nombre || 'Cliente',
            },
            data: {
                orderId: shippingData.orderId,
                cliente: shippingData.cliente,
            },
            tags: ['envio', 'entregado'],
        });
    }

    /**
     * Envía un email de promoción
     */
    async sendPromotion(
        promotionData: {
            title: string;
            description: string;
            discountCode?: string;
            discountPercentage?: number;
            validUntil?: Date | string;
            productos?: Array<{
                nombre: string;
                precio?: number;
                precioDescuento?: number;
            }>;
            cliente: {
                email: string;
                nombre?: string;
            };
        }
    ): Promise<BrevoResponse> {
        return this.send({
            event: MailEventType.PROMOTION,
            to: {
                email: promotionData.cliente.email,
                name: promotionData.cliente.nombre || 'Cliente',
            },
            data: {
                title: promotionData.title,
                description: promotionData.description,
                discountCode: promotionData.discountCode,
                discountPercentage: promotionData.discountPercentage,
                validUntil: promotionData.validUntil,
                products: promotionData.productos,
                cliente: promotionData.cliente,
            },
            tags: ['promocion', 'marketing'],
        });
    }

    /**
     * Envía un email de carrito abandonado
     */
    async sendAbandonedCart(
        cartData: {
            productos?: Array<{
                nombre: string;
                cantidad: number;
                precio: number;
            }>;
            total: number;
            totalFormatted?: string;
            recoveryLink?: string;
            cliente: {
                email: string;
                nombre?: string;
            };
        }
    ): Promise<BrevoResponse> {
        return this.send({
            event: MailEventType.ABANDONED_CART,
            to: {
                email: cartData.cliente.email,
                name: cartData.cliente.nombre || 'Cliente',
            },
            data: {
                productos: cartData.productos,
                total: cartData.total,
                totalFormatted: cartData.totalFormatted,
                recoveryLink: cartData.recoveryLink,
                cliente: cartData.cliente,
            },
            tags: ['carrito', 'abandonado', 'marketing'],
        });
    }
}

// Instancia singleton del servicio
export const mailService = new MailService();
export default mailService;

