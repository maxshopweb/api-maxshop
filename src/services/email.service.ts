import nodemailer from 'nodemailer';
import { IVenta } from '../types';

interface EmailConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        password: string;
    };
}

class EmailService {
    private transporter: nodemailer.Transporter | null = null;

    constructor() {
        this.initializeTransporter();
    }

    private initializeTransporter() {
        const emailConfig: EmailConfig = {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER || '',
                password: process.env.SMTP_PASSWORD || '',
            },
        };

        if (!emailConfig.auth.user || !emailConfig.auth.password) {
            console.warn('⚠️ [EmailService] Configuración de email no encontrada. Los emails no se enviarán.');
            return;
        }

        try {
            this.transporter = nodemailer.createTransport({
                host: emailConfig.host,
                port: emailConfig.port,
                secure: emailConfig.secure,
                auth: emailConfig.auth,
            });

        } catch (error) {
            console.error('❌ [EmailService] Error al inicializar transporter:', error);
        }
    }

    private async sendEmail(options: {
        to: string;
        subject: string;
        html: string;
        text?: string;
    }): Promise<boolean> {
        if (!this.transporter) {
            console.warn('⚠️ [EmailService] Transporter no disponible. Email no enviado.');
            return false;
        }

        try {
            const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@maxshop.com';
            const fromName = process.env.SMTP_FROM_NAME || 'MaxShop';

            await this.transporter.sendMail({
                from: `"${fromName}" <${fromEmail}>`,
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text || options.html.replace(/<[^>]*>/g, ''),
            });

            return true;
        } catch (error) {
            console.error('❌ [EmailService] Error al enviar email:', error);
            return false;
        }
    }

    async sendOrderConfirmation(venta: IVenta, userEmail: string, userName?: string): Promise<boolean> {
        const isExternalPayment = venta.metodo_pago === 'efectivo' || venta.metodo_pago === 'transferencia';
        const paymentStatus = isExternalPayment ? 'reservado' : 'pendiente';
        const paymentMethodLabel = this.getPaymentMethodLabel(venta.metodo_pago);

        const subject = isExternalPayment
            ? `Tu pedido #${venta.id_venta} fue reservado - MaxShop`
            : `Confirmación de pedido #${venta.id_venta} - MaxShop`;

        const html = this.generateOrderConfirmationHTML(venta, userName || 'Cliente', paymentStatus, paymentMethodLabel);

        return this.sendEmail({
            to: userEmail,
            subject,
            html,
        });
    }

    private getPaymentMethodLabel(metodo?: string | null): string {
        const labels: Record<string, string> = {
            efectivo: 'Efectivo (Pago en punto físico)',
            transferencia: 'Transferencia Bancaria',
            mercadopago: 'Mercado Pago',
            tarjeta_credito: 'Tarjeta de Crédito',
            tarjeta_debito: 'Tarjeta de Débito',
            otro: 'Otro',
        };
        return labels[metodo || ''] || 'No especificado';
    }

    private generateOrderConfirmationHTML(
        venta: IVenta,
        userName: string,
        paymentStatus: string,
        paymentMethodLabel: string
    ): string {
        const fechaFormateada = venta.fecha
            ? new Date(venta.fecha).toLocaleDateString('es-AR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
              })
            : 'No disponible';

        const statusMessage = paymentStatus === 'reservado'
            ? 'Tu pedido fue reservado exitosamente. Realiza el pago según las instrucciones que recibirás.'
            : 'Tu pedido está siendo procesado. Te notificaremos cuando sea confirmado.';

        const productosHTML = venta.detalles
            ?.map(
                (detalle) => `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
                    ${detalle.producto?.nombre || 'Producto sin nombre'}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">
                    ${detalle.cantidad || 0}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">
                    $${(detalle.precio_unitario || 0).toFixed(2)}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">
                    $${(detalle.sub_total || 0).toFixed(2)}
                </td>
            </tr>
        `
            )
            .join('') || '';

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmación de Pedido</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #e88a42; padding: 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px;">MaxShop</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="color: #171c35; margin: 0 0 20px 0; font-size: 24px;">
                                ¡Hola ${userName}!
                            </h2>
                            
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                                ${statusMessage}
                            </p>
                            
                            <div style="background-color: #f9f9f9; border-left: 4px solid #e88a42; padding: 15px; margin: 20px 0;">
                                <p style="margin: 0; color: #333333; font-size: 14px;">
                                    <strong>Número de Pedido:</strong> #${venta.id_venta}<br>
                                    <strong>Fecha:</strong> ${fechaFormateada}<br>
                                    <strong>Método de Pago:</strong> ${paymentMethodLabel}<br>
                                    <strong>Estado:</strong> ${paymentStatus === 'reservado' ? 'Reservado' : 'Pendiente'}
                                </p>
                            </div>
                            
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
                            
                            <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="padding: 5px 0; color: #666666;">Subtotal:</td>
                                        <td style="padding: 5px 0; text-align: right; color: #333333;">
                                            $${(venta.total_sin_iva || 0).toFixed(2)}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 5px 0; color: #666666;">IVA (21%):</td>
                                        <td style="padding: 5px 0; text-align: right; color: #333333;">
                                            $${((venta.total_con_iva || 0) - (venta.total_sin_iva || 0)).toFixed(2)}
                                        </td>
                                    </tr>
                                    ${venta.descuento_total && venta.descuento_total > 0
                                        ? `
                                    <tr>
                                        <td style="padding: 5px 0; color: #666666;">Descuento:</td>
                                        <td style="padding: 5px 0; text-align: right; color: #22c55e;">
                                            -$${venta.descuento_total.toFixed(2)}
                                        </td>
                                    </tr>
                                    `
                                        : ''}
                                    <tr>
                                        <td style="padding: 10px 0; font-size: 18px; font-weight: bold; color: #171c35;">Total:</td>
                                        <td style="padding: 10px 0; text-align: right; font-size: 18px; font-weight: bold; color: #e88a42;">
                                            $${(venta.total_neto || 0).toFixed(2)}
                                        </td>
                                    </tr>
                                </table>
                            </div>
                            
                            ${paymentStatus === 'reservado'
                                ? `
                            <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin: 20px 0;">
                                <p style="margin: 0; color: #856404; font-size: 14px;">
                                    <strong>Importante:</strong> Tu pedido está reservado. Para completar el pago, sigue las instrucciones que recibirás por separado según el método de pago seleccionado.
                                </p>
                            </div>
                            `
                                : ''}
                            
                            <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                                Si tienes alguna pregunta, no dudes en contactarnos.<br>
                                Gracias por tu compra.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #171c35; padding: 20px; text-align: center;">
                            <p style="color: #ffffff; margin: 0; font-size: 12px;">
                                © ${new Date().getFullYear()} MaxShop. Todos los derechos reservados.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;
    }
}

export const emailService = new EmailService();
export default emailService;

