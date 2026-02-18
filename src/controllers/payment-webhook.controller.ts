/**
 * Controller para webhooks de Mercado Pago
 * 
 * Este controller recibe las notificaciones HTTP de Mercado Pago
 * y las procesa de manera asíncrona.
 * 
 * IMPORTANTE:
 * - Mercado Pago espera una respuesta 200 en menos de 5 segundos
 * - Si no recibe 200, reintentará el webhook
 * - Por eso respondemos INMEDIATAMENTE y procesamos en background
 * 
 * Endpoints:
 * - POST /api/webhooks/mercadopago - Recibe webhooks de MP
 * - POST /api/webhooks/mercadopago/manual/:paymentId - Procesa un pago manualmente
 * - GET /api/webhooks/mercadopago/stats - Estadísticas de webhooks
 * - GET /api/webhooks/mercadopago/failed - Lista webhooks fallidos
 * - POST /api/webhooks/mercadopago/retry/:webhookId - Reintenta un webhook específico
 * 
 * @author MaxShop
 */

import { Request, Response } from 'express';
import { asSingleString } from '../utils/validation.utils';
import { paymentWebhookService } from '../services/payment-webhook.service';
import { failedWebhookRetryService } from '../services/failed-webhook-retry.service';
import { auditService } from '../services/audit.service';
import { IMercadoPagoWebhookEvent } from '../types';

class PaymentWebhookController {

    /**
     * Procesa webhook de Mercado Pago
     * POST /api/webhooks/mercadopago
     * 
     * Mercado Pago envía eventos con este formato:
     * {
     *   "action": "payment.created|payment.updated",
     *   "data": { "id": "123456789" },
     *   "type": "payment",
     *   "date_created": "2024-01-01T00:00:00Z",
     *   "user_id": "123456",
     *   "api_version": "v1"
     * }
     * 
     * También puede enviar el id como query param: ?data.id=123456789
     */
    async handleWebhook(req: Request, res: Response): Promise<void> {
        const startTime = Date.now();
        
        try {
            // MP puede enviar webhooks de dos formas:
            // 1. payment: { action: "payment.updated", data: { id: "123" }, type: "payment" }
            // 2. merchant_order: ?id=123&topic=merchant_order (query params)
            
            const topic = req.query['topic'] as string;
            const idFromQuery = req.query['id'] as string;
            const dataId = req.query['data.id'] || req.body?.data?.id || idFromQuery;
            const action = req.body?.action || (topic === 'merchant_order' ? 'merchant_order.updated' : 'payment.updated');
            const type = req.body?.type || topic || 'payment';

            // Log solo en desarrollo
            if (process.env.NODE_ENV !== 'production') {
                console.log(`📨 [WebhookController] Webhook recibido: ${type} - ${action} (${dataId || idFromQuery || 'sin ID'})`);
            }

            // Si es merchant_order, necesitamos obtener los pagos de esa orden
            if (topic === 'merchant_order' && idFromQuery) {
                // Responder inmediatamente
                res.status(200).json({ received: true, type: 'merchant_order' });
                
                // Procesar merchant_order de forma asíncrona
                setImmediate(async () => {
                    try {
                        await this.processMerchantOrder(idFromQuery);
                    } catch (error: any) {
                        console.error('❌ [WebhookController] Error procesando merchant_order:', error);
                    }
                });
                
                return;
            }

            // Si no hay dataId, no podemos procesar
            if (!dataId) {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn('⚠️ [WebhookController] Webhook sin data.id - ignorando');
                }
                res.status(200).json({ received: true, warning: 'No data.id found' });
                return;
            }

            // Construir evento de webhook (para payment)
            const webhookEvent: IMercadoPagoWebhookEvent = {
                action: action,
                data: { id: dataId },
                type: type as string,
                date_created: req.body?.date_created,
                user_id: req.body?.user_id,
                api_version: req.body?.api_version,
            };

            // CRÍTICO: Responder 200 INMEDIATAMENTE
            // Mercado Pago espera respuesta en menos de 5 segundos
            res.status(200).json({ 
                received: true,
                timestamp: new Date().toISOString(),
            });

            // Procesar webhook de forma ASÍNCRONA (después de responder)
            // Usamos setImmediate para liberar el event loop
            setImmediate(async () => {
                try {
                    const result = await paymentWebhookService.processWebhook(webhookEvent);
                    
                    const duration = Date.now() - startTime;
                    
                    if (result.success) {
                        console.log(`✅ [WebhookController] Pago ${result.paymentId} procesado exitosamente (${duration}ms)`);
                    } else {
                        console.error(`❌ [WebhookController] Error procesando pago ${result.paymentId}: ${result.error}`);
                    }
                } catch (error: any) {
                    console.error('❌ [WebhookController] Error procesando webhook:', error);
                    // El error ya fue guardado en failed_webhooks por el servicio
                }
            });

        } catch (error: any) {
            console.error('❌ [WebhookController] Error en handleWebhook:', error);
            
            // Aún así responder 200 para que MP no reintente inmediatamente
            // Los errores críticos (antes de poder leer el request) ya habrán sido manejados
            if (!res.headersSent) {
                res.status(200).json({ 
                    received: true, 
                    warning: 'Error interno, pero webhook recibido',
                });
            }
        }
    }

    /**
     * Procesa un pago manualmente por ID
     * POST /api/webhooks/mercadopago/manual/:paymentId
     * 
     * Útil para:
     * - Reprocesar pagos que fallaron
     * - Testing en desarrollo
     * - Sincronizar pagos que no llegaron por webhook
     */
    async processManualPayment(req: Request, res: Response): Promise<void> {
        try {
            const paymentId = asSingleString(req.params.paymentId);

            if (!paymentId) {
                res.status(400).json({
                    success: false,
                    error: 'paymentId es requerido',
                });
                return;
            }

            console.log(`🔧 [WebhookController] Procesamiento manual solicitado para pago: ${paymentId}`);

            const result = await paymentWebhookService.processManualPayment(paymentId);

            if (req.authenticatedUser) {
                await auditService.record({
                    action: 'WEBHOOK_MANUAL_PAYMENT',
                    table: 'venta',
                    description: `Admin procesó pago manual: ${paymentId}`,
                    previousData: { paymentId },
                    currentData: result as unknown as Record<string, unknown>,
                    userId: req.authenticatedUser.id,
                    userAgent: req.headers['user-agent']?.toString() ?? null,
                    endpoint: req.originalUrl,
                    status: result.success ? 'SUCCESS' : 'ERROR',
                    adminAudit: true,
                });
            }

            res.status(result.success ? 200 : 500).json({
                success: result.success,
                data: result,
            });

        } catch (error: any) {
            console.error('❌ [WebhookController] Error en procesamiento manual:', error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * Obtiene estadísticas de webhooks
     * GET /api/webhooks/mercadopago/stats
     */
    async getStats(req: Request, res: Response): Promise<void> {
        try {
            const [webhookStats, retryStats, summary] = await Promise.all([
                paymentWebhookService.getStats(),
                Promise.resolve(failedWebhookRetryService.getStats()),
                failedWebhookRetryService.getWebhookSummary(),
            ]);

            res.status(200).json({
                success: true,
                data: {
                    payments: webhookStats,
                    retryService: retryStats,
                    failedWebhooks: summary,
                },
            });

        } catch (error: any) {
            console.error('❌ [WebhookController] Error obteniendo stats:', error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * Obtiene lista de webhooks fallidos
     * GET /api/webhooks/mercadopago/failed
     * 
     * Query params:
     * - status: 'pending' | 'failed' (default: todos)
     */
    async getFailedWebhooks(req: Request, res: Response): Promise<void> {
        try {
            const status = req.query.status as string;

            let webhooks;
            if (status === 'pending') {
                webhooks = await failedWebhookRetryService.getPendingRetries();
            } else if (status === 'failed') {
                webhooks = await failedWebhookRetryService.getPermanentlyFailed();
            } else {
                // Obtener todos
                const [pending, failed] = await Promise.all([
                    failedWebhookRetryService.getPendingRetries(),
                    failedWebhookRetryService.getPermanentlyFailed(),
                ]);
                webhooks = [...pending, ...failed];
            }

            res.status(200).json({
                success: true,
                data: webhooks,
                count: webhooks.length,
            });

        } catch (error: any) {
            console.error('❌ [WebhookController] Error obteniendo webhooks fallidos:', error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * Reintenta un webhook específico
     * POST /api/webhooks/mercadopago/retry/:webhookId
     */
    async retryWebhook(req: Request, res: Response): Promise<void> {
        try {
            const webhookId = asSingleString(req.params.webhookId);

            if (!webhookId) {
                res.status(400).json({
                    success: false,
                    error: 'webhookId es requerido',
                });
                return;
            }

            console.log(`🔄 [WebhookController] Retry solicitado para webhook: ${webhookId}`);

            const success = await failedWebhookRetryService.retrySpecificWebhook(BigInt(webhookId));

            if (req.authenticatedUser) {
                await auditService.record({
                    action: 'WEBHOOK_RETRY',
                    table: 'failed_webhooks',
                    description: `Admin reintentó webhook: ${webhookId}`,
                    previousData: { webhookId },
                    currentData: { webhookId, success },
                    userId: req.authenticatedUser.id,
                    userAgent: req.headers['user-agent']?.toString() ?? null,
                    endpoint: req.originalUrl,
                    status: success ? 'SUCCESS' : 'ERROR',
                    adminAudit: true,
                });
            }

            res.status(success ? 200 : 500).json({
                success,
                message: success 
                    ? 'Webhook reprocesado exitosamente'
                    : 'Error al reprocesar webhook',
            });

        } catch (error: any) {
            console.error('❌ [WebhookController] Error en retry:', error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * Resetea un webhook fallido para permitir nuevos intentos
     * POST /api/webhooks/mercadopago/reset/:webhookId
     */
    async resetWebhook(req: Request, res: Response): Promise<void> {
        try {
            const webhookId = asSingleString(req.params.webhookId);

            if (!webhookId) {
                res.status(400).json({
                    success: false,
                    error: 'webhookId es requerido',
                });
                return;
            }

            await failedWebhookRetryService.resetFailedWebhook(BigInt(webhookId));

            if (req.authenticatedUser) {
                await auditService.record({
                    action: 'WEBHOOK_RESET',
                    table: 'failed_webhooks',
                    description: `Admin reseteó webhook para nuevos intentos: ${webhookId}`,
                    previousData: { webhookId },
                    currentData: { webhookId, reset: true },
                    userId: req.authenticatedUser.id,
                    userAgent: req.headers['user-agent']?.toString() ?? null,
                    endpoint: req.originalUrl,
                    status: 'SUCCESS',
                    adminAudit: true,
                });
            }

            res.status(200).json({
                success: true,
                message: 'Webhook reseteado para nuevos intentos',
            });

        } catch (error: any) {
            console.error('❌ [WebhookController] Error en reset:', error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * Procesa un webhook de tipo merchant_order
     * Obtiene los pagos asociados a la orden y los procesa
     */
    private async processMerchantOrder(orderId: string, retryCount: number = 0): Promise<void> {
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 2000; // 2 segundos
        
        try {
            const { mercadoPagoService } = require('../services/mercado-pago.service');
            const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN_TEST || process.env.MERCADOPAGO_ACCESS_TOKEN;
            
            if (!accessToken) {
                throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado');
            }

            // Obtener la orden desde MP
            const orderResponse = await fetch(
                `https://api.mercadopago.com/merchant_orders/${orderId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!orderResponse.ok) {
                const errorText = await orderResponse.text();
                throw new Error(`Error al obtener orden ${orderId}: ${orderResponse.status} ${orderResponse.statusText} - ${errorText}`);
            }

            const orderData = await orderResponse.json() as {
                id: number;
                external_reference?: string;
                status?: string;
                order_status?: string;
                payments?: Array<{ 
                    id: number;
                    status?: string;
                    status_detail?: string;
                }>;
            };

            // Log solo en desarrollo o si hay pagos
            if (process.env.NODE_ENV !== 'production' || (orderData.payments && orderData.payments.length > 0)) {
                console.log(`📦 [WebhookController] Orden ${orderId}: ${orderData.payments?.length || 0} pago(s) - Estado: ${orderData.status || orderData.order_status}`);
            }

            // Procesar cada pago asociado a la orden
            if (orderData.payments && orderData.payments.length > 0) {
                for (const payment of orderData.payments) {
                    // Crear evento de webhook para el pago
                    const webhookEvent: IMercadoPagoWebhookEvent = {
                        action: 'payment.updated',
                        data: { id: payment.id.toString() },
                        type: 'payment',
                    };
                    
                    // Procesar el pago
                    await paymentWebhookService.processWebhook(webhookEvent);
                }
            } else {
                // Si no hay pagos y aún podemos reintentar, esperar y reintentar
                if (retryCount < MAX_RETRIES) {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`⏳ [WebhookController] Orden ${orderId} sin pagos. Reintentando... (${retryCount + 1}/${MAX_RETRIES})`);
                    }
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    return this.processMerchantOrder(orderId, retryCount + 1);
                } else {
                    console.warn(`⚠️ [WebhookController] Orden ${orderId} sin pagos después de ${MAX_RETRIES} intentos. El pago puede haber fallado o aún estar procesándose.`);
                }
            }

        } catch (error: any) {
            console.error(`❌ [WebhookController] Error procesando merchant_order ${orderId}:`, error);
            throw error;
        }
    }

    /**
     * Diagnóstico de preferencia/pago
     * GET /api/webhooks/mercadopago/diagnose/:preferenceId
     * 
     * Útil para diagnosticar por qué un pago falló
     */
    async diagnosePreference(req: Request, res: Response): Promise<void> {
        try {
            const { preferenceId } = req.params;

            if (!preferenceId) {
                res.status(400).json({
                    success: false,
                    error: 'preferenceId es requerido',
                });
                return;
            }

            console.log(`🔍 [WebhookController] Diagnóstico solicitado para preferencia: ${preferenceId}`);

            const { mercadoPagoService } = require('../services/mercado-pago.service');
            const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN_TEST || process.env.MERCADOPAGO_ACCESS_TOKEN;

            if (!accessToken) {
                throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado');
            }

            // Obtener la preferencia
            const preference = await mercadoPagoService.getPreference(preferenceId);

            // Buscar la orden merchant_order asociada
            let merchantOrder = null;
            if (preference.external_reference) {
                try {
                    // Buscar pagos por external_reference
                    const payments = await mercadoPagoService.searchPaymentsByExternalReference(preference.external_reference);
                    
                    // Si hay pagos, obtener la orden del primer pago
                    if (payments && payments.length > 0 && payments[0].order?.id) {
                        const orderResponse = await fetch(
                            `https://api.mercadopago.com/merchant_orders/${payments[0].order.id}`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Content-Type': 'application/json',
                                },
                            }
                        );
                        if (orderResponse.ok) {
                            merchantOrder = await orderResponse.json();
                        }
                    }
                } catch (error: any) {
                    console.warn(`⚠️ [WebhookController] No se pudo obtener merchant_order: ${error.message}`);
                }
            }

            res.status(200).json({
                success: true,
                data: {
                    preference: {
                        id: preference.id,
                        status: preference.status,
                        external_reference: preference.external_reference,
                        init_point: preference.init_point,
                        sandbox_init_point: preference.sandbox_init_point,
                        date_created: preference.date_created,
                        items: preference.items?.map((item: any) => ({
                            title: item.title,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                        })),
                    },
                    merchant_order: merchantOrder ? {
                        id: (merchantOrder as any).id,
                        status: (merchantOrder as any).status || (merchantOrder as any).order_status,
                        external_reference: (merchantOrder as any).external_reference,
                        payments: ((merchantOrder as any).payments || []).map((p: any) => ({
                            id: p.id,
                            status: p.status,
                            status_detail: p.status_detail,
                        })),
                        payment_status: (merchantOrder as any).payment_status,
                    } : null,
                    diagnostic: {
                        has_payments: merchantOrder && (merchantOrder as any).payments && (merchantOrder as any).payments.length > 0,
                        payments_count: merchantOrder && (merchantOrder as any).payments ? (merchantOrder as any).payments.length : 0,
                        order_status: merchantOrder ? ((merchantOrder as any).status || (merchantOrder as any).order_status || 'unknown') : 'not_found',
                        recommendation: merchantOrder && (merchantOrder as any).payments && (merchantOrder as any).payments.length === 0 
                            ? 'El pago fue rechazado antes de crearse. Verifica: 1) Tarjeta de prueba correcta (4509 9535 6623 3704, CVV 123, Nombre APRO), 2) Email de test user (test_user_XXXXXXX@testuser.com), 3) Datos del comprador completos'
                            : merchantOrder && (merchantOrder as any).payments && (merchantOrder as any).payments.length > 0
                            ? 'Hay pagos asociados. Revisa el status_detail de cada pago para ver el motivo del rechazo.'
                            : 'No se encontró merchant_order. El pago puede no haberse intentado aún.',
                    },
                },
            });

        } catch (error: any) {
            console.error('❌ [WebhookController] Error en diagnóstico:', error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * Health check del servicio de webhooks
     * GET /api/webhooks/mercadopago/health
     */
    async healthCheck(req: Request, res: Response): Promise<void> {
        try {
            const retryStats = failedWebhookRetryService.getStats();
            
            res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                retryServiceRunning: !retryStats.isRunning || retryStats.lastRun !== null,
                lastRetryRun: retryStats.lastRun,
            });

        } catch (error: any) {
            res.status(500).json({
                status: 'unhealthy',
                error: error.message,
            });
        }
    }

    /**
     * Obtiene información del usuario de prueba de MP (solo para desarrollo)
     * GET /api/webhooks/mercadopago/test-user-info
     */
    async getTestUserInfo(req: Request, res: Response): Promise<void> {
        try {
            const { mercadoPagoService } = require('../services/mercado-pago.service');
            
            if (mercadoPagoService.getMode() !== 'sandbox') {
                res.status(400).json({
                    success: false,
                    error: 'Este endpoint solo está disponible en modo sandbox',
                });
                return;
            }

            const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN_TEST || process.env.MERCADOPAGO_ACCESS_TOKEN;
            
            if (!accessToken) {
                res.status(500).json({
                    success: false,
                    error: 'MERCADOPAGO_ACCESS_TOKEN_TEST no configurado',
                });
                return;
            }

            // Obtener información del usuario actual
            const response = await fetch('https://api.mercadopago.com/users/me', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}`);
            }

            const userData = await response.json() as {
                id?: number;
                email?: string;
                nickname?: string;
                site_id?: string;
            };
            
            // Email configurado actualmente
            const configuredEmail = process.env.MERCADOPAGO_TEST_USER_EMAIL || 'No configurado';
            
            // Email sugerido (formato estándar)
            const suggestedEmail = userData.email || `test_user_${userData.id}@testuser.com`;

            res.status(200).json({
                success: true,
                data: {
                    configured_email: configuredEmail,
                    suggested_email: suggestedEmail,
                    user_id: userData.id,
                    nickname: userData.nickname,
                    site_id: userData.site_id,
                    message: configuredEmail === suggestedEmail 
                        ? '✅ Email configurado correctamente'
                        : `⚠️ Considera usar: ${suggestedEmail}`,
                },
            });

        } catch (error: any) {
            console.error('❌ [WebhookController] Error obteniendo info de usuario de prueba:', error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
}

export const paymentWebhookController = new PaymentWebhookController();
export { PaymentWebhookController };
