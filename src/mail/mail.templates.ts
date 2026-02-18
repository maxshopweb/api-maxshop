/**
 * Templates HTML para emails transaccionales
 * Layout base reutilizable con header y footer
 * Templates dinámicos con variables
 */

import { MailEventType, MailEventNames } from './mail.events';
import { MailTemplate, MailEventData, OrderEventData, ShippingEventData, PromotionEventData, AbandonedCartEventData, PaymentInstructionsEventData, WelcomeEventData } from './mail.types';

/**
 * Layout base para todos los emails
 */
function getBaseLayout(content: string): string {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>MaxShop</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 600px;">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #e88a42; padding: 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">MaxShop</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            ${content}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #171c35; padding: 20px; text-align: center;">
                            <p style="color: #ffffff; margin: 0; font-size: 12px; line-height: 1.6;">
                                © ${new Date().getFullYear()} MaxShop. Todos los derechos reservados.<br>
                                <a href="#" style="color: #e88a42; text-decoration: none;">Contacto</a> | 
                                <a href="#" style="color: #e88a42; text-decoration: none;">Términos y Condiciones</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

/**
 * Formatea una fecha a texto legible
 */
function formatDate(date: Date | string | undefined): string {
    if (!date) return 'No disponible';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('es-AR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Formatea un número a moneda
 */
function formatCurrency(amount: number | undefined): string {
    if (amount === undefined || amount === null) return '$0.00';
    return `$${amount.toFixed(2)}`;
}

/**
 * Genera el template HTML según el evento y datos
 */
export function getMailTemplate(event: MailEventType, data: MailEventData): MailTemplate {
    switch (event) {
        case MailEventType.ORDER_PENDING:
            return getOrderPendingTemplate(data as OrderEventData);
        case MailEventType.ORDER_CONFIRMED:
            return getOrderConfirmedTemplate(data as OrderEventData);
        case MailEventType.ORDER_CANCELLED:
            return getOrderCancelledTemplate(data as OrderEventData);
        case MailEventType.ORDER_EXPIRED:
            return getOrderExpiredTemplate(data as OrderEventData);
        case MailEventType.PAYMENT_INSTRUCTIONS:
            return getPaymentInstructionsTemplate(data as PaymentInstructionsEventData);
        case MailEventType.SHIPPING_PREPARING:
            return getShippingPreparingTemplate(data as ShippingEventData);
        case MailEventType.SHIPPING_SENT:
            return getShippingSentTemplate(data as ShippingEventData);
        case MailEventType.SHIPPING_DELIVERED:
            return getShippingDeliveredTemplate(data as ShippingEventData);
        case MailEventType.PROMOTION:
            return getPromotionTemplate(data as PromotionEventData);
        case MailEventType.ABANDONED_CART:
            return getAbandonedCartTemplate(data as AbandonedCartEventData);
        case MailEventType.WELCOME_GUEST:
            return getWelcomeGuestTemplate(data as WelcomeEventData);
        case MailEventType.WELCOME_USER:
            return getWelcomeUserTemplate(data as WelcomeEventData);
        case MailEventType.GENERIC:
            return getGenericTemplate(data);
        default:
            return getGenericTemplate(data);
    }
}

/**
 * Template: Pedido Pendiente
 */
function getOrderPendingTemplate(data: OrderEventData): MailTemplate {
    const userName = data.cliente?.nombre || 'Cliente';
    const orderId = data.orderId || data.orderNumber || 'N/A';
    const fecha = formatDate(data.fecha);
    const total = data.totalFormatted || formatCurrency(data.total);

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            ¡Hola ${userName}!
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Hemos recibido tu pedido y está siendo procesado. Te notificaremos cuando sea confirmado.
        </p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid #e88a42; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #333333; font-size: 14px;">
                <strong>Número de Pedido:</strong> #${orderId}<br>
                <strong>Fecha:</strong> ${fecha}<br>
                <strong>Total:</strong> ${total}
            </p>
        </div>
        
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
            Si tienes alguna pregunta, no dudes en contactarnos.<br>
            Gracias por tu compra.
        </p>
    `;

    return {
        subject: `Tu pedido #${orderId} está pendiente - MaxShop`,
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Pedido Confirmado
 */
function getOrderConfirmedTemplate(data: OrderEventData): MailTemplate {
    const userName = data.cliente?.nombre || 'Cliente';
    const orderId = data.orderId || data.orderNumber || 'N/A';
    const fecha = formatDate(data.fecha);
    const total = data.totalFormatted || formatCurrency(data.total);
    const metodoPago = data.metodoPago || 'No especificado';
    const isExternalPayment = metodoPago === 'efectivo' || metodoPago === 'transferencia';
    const paymentStatus = isExternalPayment ? 'reservado' : 'confirmado';
    const trackingCode = data.trackingCode || null;
    const carrier = data.carrier || 'Andreani';

    const productosHTML = data.productos
        ?.map(
            (prod) => `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
                    ${prod.nombre}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">
                    ${prod.cantidad}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">
                    ${formatCurrency(prod.precioUnitario)}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">
                    ${formatCurrency(prod.subtotal)}
                </td>
            </tr>
        `
        )
        .join('') || '';

    const statusMessage = isExternalPayment
        ? 'Tu pedido fue reservado exitosamente. Realiza el pago según las instrucciones que recibirás.'
        : 'Tu pedido ha sido confirmado y está siendo procesado.';

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            ¡Hola ${userName}!
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            ${statusMessage}
        </p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid #e88a42; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #333333; font-size: 14px;">
                <strong>Número de Pedido:</strong> #${orderId}<br>
                <strong>Fecha:</strong> ${fecha}<br>
                <strong>Método de Pago:</strong> ${metodoPago}<br>
                <strong>Estado:</strong> ${paymentStatus === 'reservado' ? 'Reservado' : 'Confirmado'}
                ${trackingCode ? `<br><strong>Código de Seguimiento (${carrier}):</strong> ${trackingCode}` : ''}
            </p>
        </div>
        
        ${trackingCode ? `
        <div style="background-color: #d1ecf1; border-left: 4px solid #0c5460; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #0c5460; font-size: 14px;">
                <strong>📦 Información de Envío:</strong><br>
                Tu pedido tiene un número de seguimiento de ${carrier}. Puedes rastrear tu envío usando el código: <strong>${trackingCode}</strong>
            </p>
        </div>
        ` : ''}
        
        ${productosHTML ? `
        <h3 style="color: #171c35; margin: 30px 0 15px 0; font-size: 18px;">Detalles del Pedido</h3>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 20px 0;">
            <thead>
                <tr style="background-color: #f5f5f5;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e0e0e0; color: #171c35;">Producto</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e0e0e0; color: #171c35;">Cantidad</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e0e0e0; color: #171c35;">Precio Unit.</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e0e0e0; color: #171c35;">Subtotal</th>
                </tr>
            </thead>
            <tbody>
                ${productosHTML}
            </tbody>
        </table>
        ` : ''}
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="padding: 10px 0; font-size: 18px; font-weight: bold; color: #171c35;">Total:</td>
                    <td style="padding: 10px 0; text-align: right; font-size: 18px; font-weight: bold; color: #e88a42;">
                        ${total}
                    </td>
                </tr>
            </table>
        </div>
        
        ${isExternalPayment ? `
        <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>Importante:</strong> Tu pedido está reservado. Para completar el pago, sigue las instrucciones que recibirás por separado según el método de pago seleccionado.
            </p>
        </div>
        ` : ''}
        
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
            Si tienes alguna pregunta, no dudes en contactarnos.<br>
            Gracias por tu compra.
        </p>
    `;

    return {
        subject: isExternalPayment
            ? `Tu pedido #${orderId} fue reservado - MaxShop`
            : `Confirmación de pedido #${orderId} - MaxShop`,
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Pedido Cancelado
 */
function getOrderCancelledTemplate(data: OrderEventData): MailTemplate {
    const userName = data.cliente?.nombre || 'Cliente';
    const orderId = data.orderId || data.orderNumber || 'N/A';

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            Hola ${userName}
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Lamentamos informarte que tu pedido #${orderId} ha sido cancelado.
        </p>
        
        <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #721c24; font-size: 14px;">
                <strong>Pedido Cancelado:</strong> #${orderId}
            </p>
        </div>
        
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
            Si tienes alguna pregunta o crees que esto es un error, por favor contacta con nuestro equipo de atención al cliente.
        </p>
    `;

    return {
        subject: `Pedido #${orderId} cancelado - MaxShop`,
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Pedido Vencido (sin pago a tiempo)
 */
function getOrderExpiredTemplate(data: OrderEventData): MailTemplate {
    const userName = data.cliente?.nombre || 'Cliente';
    const orderId = data.orderId || data.orderNumber || 'N/A';
    const total = data.totalFormatted || formatCurrency(data.total);

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            Hola ${userName}
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Tu pedido #${orderId} ha vencido por no haber recibido el pago dentro del plazo establecido.
        </p>
        
        <div style="background-color: #fff3cd; border-left: 4px solid #e88a42; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>Pedido vencido:</strong> #${orderId}<br>
                <strong>Total:</strong> ${total}
            </p>
        </div>
        
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
            Si deseas realizar una nueva compra, puedes volver a ingresar a la tienda. Cualquier duda, contactanos.
        </p>
    `;

    return {
        subject: `Tu pedido #${orderId} ha vencido - MaxShop`,
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Instrucciones de Pago (Datos Bancarios)
 */
function getPaymentInstructionsTemplate(data: PaymentInstructionsEventData): MailTemplate {
    const userName = data.cliente?.nombre || 'Cliente';
    const orderId = data.orderId || 'N/A';
    const total = data.totalFormatted || formatCurrency(data.total);
    const metodoPago = data.metodoPago || 'transferencia';

    // Obtener datos bancarios desde variables de entorno o BD
    // Por ahora usar variables de entorno, luego puedes moverlo a BD
    const bankData = {
        cbu: process.env.BANK_CBU || '0000000000000000000000',
        alias: process.env.BANK_ALIAS || 'TU.ALIAS.BANCARIO',
        cuit: process.env.BANK_CUIT || '00-00000000-0',
        razonSocial: process.env.BANK_RAZON_SOCIAL || 'Tu Empresa S.A.',
        banco: process.env.BANK_NAME || 'Banco',
    };

    const isTransferencia = metodoPago === 'transferencia';
    const isEfectivo = metodoPago === 'efectivo';
    const paymentMethodLabel = isTransferencia ? 'Transferencia Bancaria' : 'Efectivo';
    const datosTitulo = isEfectivo ? 'Datos para pago en RapiPago o Pago Fácil' : `Datos para ${paymentMethodLabel}`;

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            ¡Hola ${userName}!
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Tu pedido #${orderId} está pendiente de pago. Por favor, realiza el pago según las siguientes instrucciones:
        </p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid #e88a42; padding: 20px; margin: 20px 0;">
            <h3 style="color: #171c35; margin: 0 0 15px 0; font-size: 18px;">
                ${datosTitulo}
            </h3>
            
            ${(isTransferencia || isEfectivo) ? `
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0; color: #333333; font-weight: bold; width: 40%;">CBU:</td>
                    <td style="padding: 8px 0; color: #171c35; font-family: monospace; font-size: 16px;">${bankData.cbu}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #333333; font-weight: bold;">Alias:</td>
                    <td style="padding: 8px 0; color: #171c35; font-weight: bold; font-size: 16px;">${bankData.alias}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #333333; font-weight: bold;">CUIT:</td>
                    <td style="padding: 8px 0; color: #171c35;">${bankData.cuit}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #333333; font-weight: bold;">Razón Social:</td>
                    <td style="padding: 8px 0; color: #171c35;">${bankData.razonSocial}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #333333; font-weight: bold;">Banco:</td>
                    <td style="padding: 8px 0; color: #171c35;">${bankData.banco}</td>
                </tr>
            </table>
            ` : `
            <p style="color: #333333; margin: 0;">
                Por favor, acércate a nuestro punto físico para realizar el pago en efectivo.
                Presenta el número de pedido: <strong>#${orderId}</strong>
            </p>
            `}
            
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e0e0e0;">
                <p style="margin: 0; color: #171c35; font-size: 18px; font-weight: bold;">
                    Monto a pagar: <span style="color: #e88a42;">${total}</span>
                </p>
            </div>
        </div>
        
        <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>Importante:</strong> Una vez realizado el pago, envía el comprobante por email o WhatsApp. 
                Tu pedido será confirmado y procesado inmediatamente.
            </p>
        </div>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid #e88a42; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #333333; font-size: 14px;">
                <strong>Número de Pedido:</strong> #${orderId}<br>
                <strong>Método de Pago:</strong> ${paymentMethodLabel}
            </p>
        </div>
        
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
            Si tienes alguna pregunta, no dudes en contactarnos.<br>
            Gracias por tu compra.
        </p>
    `;

    return {
        subject: `Instrucciones de pago - Pedido #${orderId} - MaxShop`,
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Envío en Preparación
 */
function getShippingPreparingTemplate(data: ShippingEventData): MailTemplate {
    const orderId = data.orderId || 'N/A';

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            Tu pedido está siendo preparado
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Tu pedido #${orderId} está siendo preparado para el envío. Te notificaremos cuando sea despachado.
        </p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid #e88a42; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #333333; font-size: 14px;">
                <strong>Número de Pedido:</strong> #${orderId}<br>
                <strong>Estado:</strong> En preparación
            </p>
        </div>
    `;

    return {
        subject: `Tu pedido #${orderId} está en preparación - MaxShop`,
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Envío Despachado
 * Este email se envía cuando el pre-envío es ACEPTADO por Andreani (estado "Creada")
 * NO cuando se crea el pre-envío (estado "Pendiente" o "Solicitada")
 */
function getShippingSentTemplate(data: ShippingEventData): MailTemplate {
    const orderId = data.orderId || 'N/A';
    const trackingCode = data.trackingCode || 'No disponible';
    const carrier = data.carrier || 'Transportista';
    const estimatedArrival = data.estimatedArrival || 'Próximamente';

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            ¡Tu pedido ha sido despachado!
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Tu pedido #${orderId} ha sido aceptado por ${carrier} y está siendo preparado para el envío.
        </p>
        
        <div style="background-color: #f9f9f9; border-left: 4px solid #e88a42; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #333333; font-size: 14px;">
                <strong>Número de Pedido:</strong> #${orderId}<br>
                <strong>Código de Seguimiento:</strong> ${trackingCode}<br>
                <strong>Transportista:</strong> ${carrier}<br>
                <strong>Llegada Estimada:</strong> ${estimatedArrival}
            </p>
        </div>
        
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
            Puedes rastrear tu envío usando el código de seguimiento proporcionado.
        </p>
        
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 10px 0 0 0;">
            Recibirás actualizaciones de ${carrier} sobre el estado de tu envío. Te notificaremos cuando tu pedido esté en camino.
        </p>
    `;

    return {
        subject: `Tu pedido #${orderId} ha sido aceptado para envío - MaxShop`,
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Envío Entregado
 */
function getShippingDeliveredTemplate(data: ShippingEventData): MailTemplate {
    const orderId = data.orderId || 'N/A';

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            ¡Tu pedido ha sido entregado!
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Tu pedido #${orderId} ha sido entregado exitosamente. Esperamos que disfrutes tus productos.
        </p>
        
        <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #155724; font-size: 14px;">
                <strong>Pedido Entregado:</strong> #${orderId}
            </p>
        </div>
        
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
            Si tienes alguna pregunta o necesitas asistencia, no dudes en contactarnos.
        </p>
    `;

    return {
        subject: `Tu pedido #${orderId} ha sido entregado - MaxShop`,
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Promoción
 */
function getPromotionTemplate(data: PromotionEventData): MailTemplate {
    const title = data.title || 'Promoción Especial';
    const description = data.description || 'No te pierdas nuestras ofertas especiales';
    const discountCode = data.discountCode || '';
    const validUntil = data.validUntil ? formatDate(data.validUntil) : '';

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            ${title}
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            ${description}
        </p>
        
        ${discountCode ? `
        <div style="background-color: #e88a42; border-radius: 4px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: bold;">
                Código de Descuento: ${discountCode}
            </p>
        </div>
        ` : ''}
        
        ${validUntil ? `
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0;">
            <strong>Válido hasta:</strong> ${validUntil}
        </p>
        ` : ''}
        
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
            ¡Aprovecha esta oportunidad antes de que termine!
        </p>
    `;

    return {
        subject: title,
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Carrito Abandonado
 */
function getAbandonedCartTemplate(data: AbandonedCartEventData): MailTemplate {
    const total = data.totalFormatted || formatCurrency(data.total);
    const recoveryLink = data.recoveryLink || '#';

    const productosHTML = data.productos
        ?.map(
            (prod) => `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
                    ${prod.nombre}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">
                    ${prod.cantidad}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">
                    ${formatCurrency(prod.precio)}
                </td>
            </tr>
        `
        )
        .join('') || '';

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            ¡No te pierdas estos productos!
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Notamos que dejaste algunos productos en tu carrito. ¡Completa tu compra ahora!
        </p>
        
        ${productosHTML ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 20px 0;">
            <thead>
                <tr style="background-color: #f5f5f5;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e0e0e0; color: #171c35;">Producto</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e0e0e0; color: #171c35;">Cantidad</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e0e0e0; color: #171c35;">Precio</th>
                </tr>
            </thead>
            <tbody>
                ${productosHTML}
            </tbody>
        </table>
        
        <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="padding: 10px 0; font-size: 18px; font-weight: bold; color: #171c35;">Total:</td>
                    <td style="padding: 10px 0; text-align: right; font-size: 18px; font-weight: bold; color: #e88a42;">
                        ${total}
                    </td>
                </tr>
            </table>
        </div>
        ` : ''}
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="${recoveryLink}" style="display: inline-block; background-color: #e88a42; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
                Completar Compra
            </a>
        </div>
    `;

    return {
        subject: '¡Completa tu compra! - MaxShop',
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Bienvenida checkout invitado
 */
function getWelcomeGuestTemplate(data: WelcomeEventData): MailTemplate {
    const nombre = data.nombre || data.apellido
        ? `${data.nombre || ''} ${data.apellido || ''}`.trim()
        : 'Cliente';

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            ¡Hola${nombre !== 'Cliente' ? ` ${nombre}` : ''}!
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Gracias por elegir MaxShop. Completaste tus datos para continuar con tu compra como invitado.
        </p>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Podés seguir con el checkout y finalizar tu pedido. Si tenés alguna duda, estamos para ayudarte.
        </p>
        
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
            ¡Gracias por confiar en nosotros!
        </p>
    `;

    return {
        subject: 'Bienvenido a MaxShop - Completá tu pedido',
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Bienvenida usuario registrado
 */
function getWelcomeUserTemplate(data: WelcomeEventData): MailTemplate {
    const nombre = data.nombre || data.apellido
        ? `${data.nombre || ''} ${data.apellido || ''}`.trim()
        : 'Cliente';

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            ¡Hola${nombre !== 'Cliente' ? ` ${nombre}` : ''}!
        </h2>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Te damos la bienvenida a MaxShop. Tu cuenta fue creada correctamente.
        </p>
        
        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            Recordá verificar tu email con el enlace que te enviamos para activar tu cuenta y poder comprar con todos los beneficios.
        </p>
        
        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
            ¡Gracias por registrarte!
        </p>
    `;

    return {
        subject: 'Bienvenido a MaxShop - Verificá tu email',
        htmlContent: getBaseLayout(content),
    };
}

/**
 * Template: Genérico
 */
function getGenericTemplate(data: MailEventData): MailTemplate {
    const title = data.title || 'Mensaje de MaxShop';
    const message = data.message || data.content || '';

    const content = `
        <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
            ${title}
        </h2>
        
        <div style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
            ${message}
        </div>
    `;

    return {
        subject: title,
        htmlContent: getBaseLayout(content),
    };
}

