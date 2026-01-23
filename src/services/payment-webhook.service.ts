/**
 * Servicio para procesar webhooks de Mercado Pago
 * 
 * Este servicio es el CORE del procesamiento de pagos:
 * - Recibe eventos de webhook
 * - Valida y verifica idempotencia
 * - Consulta la API de MP (fuente de verdad)
 * - Crea/actualiza registros de pago
 * - Actualiza estado de ventas
 * - Dispara eventos del Event Bus
 * 
 * Características:
 * - Procesamiento idempotente (puede recibir el mismo webhook múltiples veces)
 * - Locks para evitar procesamiento paralelo del mismo pago
 * - Retry automático de webhooks fallidos
 * - Logging completo para auditoría
 * 
 * @author MaxShop
 */

import { prisma } from '../index';
import { mercadoPagoService, MercadoPagoService, MercadoPagoPaymentResponse } from './mercado-pago.service';
import { paymentProcessingService } from './payment-processing.service';
import { 
    IMercadoPagoWebhookEvent, 
    MP_STATUS_TO_VENTA_STATUS, 
    EstadoPago,
    IMercadoPagoPayment 
} from '../types';

// ============================================
// TIPOS E INTERFACES
// ============================================

interface ProcessingLock {
    paymentId: string;
    timestamp: number;
    expiresAt: number;
}

interface WebhookProcessResult {
    success: boolean;
    paymentId: string;
    action: 'created' | 'updated' | 'skipped';
    ventaId?: number;
    previousStatus?: string;
    newStatus?: string;
    error?: string;
}

interface PaymentDataForPrisma {
    venta_id: number;
    payment_id: string;
    preference_id: string | null;
    external_reference: string;
    status_mp: string;
    status_detail: string | null;
    estado_venta_relacionado: string | null;
    payment_type_id: string;
    payment_method_id: string | null;
    installments: number | null;
    transaction_amount: number;
    total_paid_amount: number | null;
    net_received_amount: number | null;
    commission_amount: number | null;
    fee_details: any;
    currency_id: string;
    operation_type: string | null;
    date_created: Date;
    date_approved: Date | null;
    money_release_date: Date | null;
    card_info: any;
    payer_info: any;
    processing_mode: string | null;
    live_mode: boolean;
    webhook_processed_at: Date;
    updated_at: Date;
    notes?: string;
}

// ============================================
// SERVICIO PRINCIPAL
// ============================================

class PaymentWebhookService {
    // Mapa en memoria para locks de procesamiento
    // En producción con múltiples instancias, usar Redis
    private processingLocks: Map<string, ProcessingLock> = new Map();
    private lockTimeoutMs = 30000; // 30 segundos
    
    // Limpiar locks expirados cada minuto
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        this.cleanupInterval = setInterval(() => this.cleanupExpiredLocks(), 60000);
        console.log('✅ [PaymentWebhookService] Inicializado');
    }

    /**
     * Limpia locks expirados del mapa
     */
    private cleanupExpiredLocks(): void {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, lock] of this.processingLocks.entries()) {
            if (lock.expiresAt < now) {
                this.processingLocks.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 [PaymentWebhookService] Limpiados ${cleaned} locks expirados`);
        }
    }

    /**
     * Intenta adquirir un lock para procesar un pago
     * Previene procesamiento paralelo del mismo webhook
     */
    private acquireLock(paymentId: string): boolean {
        const now = Date.now();
        const existingLock = this.processingLocks.get(paymentId);
        
        // Si hay un lock activo, no adquirir
        if (existingLock && existingLock.expiresAt > now) {
            return false;
        }
        
        // Crear nuevo lock
        this.processingLocks.set(paymentId, {
            paymentId,
            timestamp: now,
            expiresAt: now + this.lockTimeoutMs,
        });
        
        return true;
    }

    /**
     * Libera el lock de un pago
     */
    private releaseLock(paymentId: string): void {
        this.processingLocks.delete(paymentId);
    }

    /**
     * Procesa un webhook de Mercado Pago
     * 
     * Este método es IDEMPOTENTE: puede llamarse múltiples veces con el mismo
     * webhook sin efectos secundarios adicionales.
     * 
     * @param webhookData - Datos del webhook enviados por MP
     * @returns Resultado del procesamiento
     */
    async processWebhook(webhookData: IMercadoPagoWebhookEvent): Promise<WebhookProcessResult> {
        const startTime = Date.now();
        
        try {
            // Log solo en desarrollo
            if (process.env.NODE_ENV !== 'production') {
                console.log(`📨 [PaymentWebhookService] Webhook: ${webhookData.action} - ${webhookData.data?.id}`);
            }

            // 1. Validar estructura del webhook
            if (!webhookData.action || !webhookData.data?.id) {
                console.error('❌ [PaymentWebhookService] Webhook inválido: estructura incorrecta');
                return {
                    success: false,
                    paymentId: 'unknown',
                    action: 'skipped',
                    error: 'Invalid webhook structure',
                };
            }

            // 2. Filtrar tipos de evento
            // Procesar eventos de tipo "payment" o "merchant_order"
            // merchant_order se procesa en el controller, aquí solo payment
            if (webhookData.type && webhookData.type !== 'payment') {
                return {
                    success: true,
                    paymentId: webhookData.data?.id?.toString() || 'unknown',
                    action: 'skipped',
                };
            }

            // Solo procesar acciones relacionadas con payment
            if (webhookData.action && !webhookData.action.includes('payment')) {
                return {
                    success: true,
                    paymentId: webhookData.data?.id?.toString() || 'unknown',
                    action: 'skipped',
                };
            }

            const paymentId = webhookData.data.id.toString();

            // 3. Intentar adquirir lock
            if (!this.acquireLock(paymentId)) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`⏳ [PaymentWebhookService] Pago ${paymentId} ya está siendo procesado (lock activo)`);
                }
                return {
                    success: true,
                    paymentId,
                    action: 'skipped',
                };
            }

            try {
                // 4. Obtener datos completos del pago desde la API de MP
                // Esta es la FUENTE DE VERDAD, no confiamos en el payload del webhook
                const fullPaymentData = await this.getPaymentFromMercadoPago(paymentId);
                
                if (!fullPaymentData) {
                    throw new Error(`No se pudo obtener datos del pago ${paymentId} desde MP`);
                }

                // 5. Extraer y validar external_reference
                const externalReference = fullPaymentData.external_reference;
                if (!externalReference) {
                    console.error(`❌ [PaymentWebhookService] Pago ${paymentId} sin external_reference`);
                    return {
                        success: true,
                        paymentId,
                        action: 'skipped',
                        error: 'Missing external_reference',
                    };
                }

                // 6. Extraer idVenta desde external_reference
                const idVenta = MercadoPagoService.extractVentaIdFromExternalReference(externalReference);
                if (!idVenta) {
                    console.error(`❌ [PaymentWebhookService] No se pudo extraer idVenta de: ${externalReference}`);
                    return {
                        success: true,
                        paymentId,
                        action: 'skipped',
                        error: `Invalid external_reference format: ${externalReference}`,
                    };
                }

                // Log solo en desarrollo
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`🔗 [PaymentWebhookService] Pago ${paymentId} → Venta #${idVenta} (${fullPaymentData.status})`);
                }

                // 7. Verificar que la venta existe
                const ventaExistente = await prisma.venta.findUnique({
                    where: { id_venta: idVenta },
                    select: { id_venta: true, estado_pago: true },
                });

                if (!ventaExistente) {
                    console.error(`❌ [PaymentWebhookService] Venta #${idVenta} no encontrada`);
                    throw new Error(`Venta #${idVenta} no encontrada`);
                }

                // 8. Verificar idempotencia - ¿Ya procesamos este pago?
                const existingPayment = await prisma.mercado_pago_payments.findUnique({
                    where: { payment_id: paymentId },
                    select: { 
                        id: true, 
                        status_mp: true, 
                        updated_at: true,
                    },
                });

                // Si el pago ya existe con el mismo estado, es un duplicado
                if (existingPayment && existingPayment.status_mp === fullPaymentData.status) {
                    // Log solo en desarrollo
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`ℹ️ [PaymentWebhookService] Pago ${paymentId} ya procesado (idempotencia)`);
                    }
                    return {
                        success: true,
                        paymentId,
                        action: 'skipped',
                        ventaId: idVenta,
                        previousStatus: existingPayment.status_mp,
                        newStatus: fullPaymentData.status,
                    };
                }

                // 9. Preparar datos para crear/actualizar el registro de pago
                const paymentData = this.buildPaymentData(fullPaymentData, idVenta, externalReference);

                // 10. Crear o actualizar registro de pago (UPSERT)
                let action: 'created' | 'updated';
                
                if (existingPayment) {
                    // Log solo en desarrollo
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`📝 [PaymentWebhookService] Actualizando pago ${paymentId}`);
                    }
                    await prisma.mercado_pago_payments.update({
                        where: { payment_id: paymentId },
                        data: paymentData,
                    });
                    action = 'updated';
                } else {
                    // Log solo en desarrollo
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`✨ [PaymentWebhookService] Creando registro de pago ${paymentId}`);
                    }
                    await prisma.mercado_pago_payments.create({
                        data: paymentData,
                    });
                    action = 'created';
                }

                // 11. Determinar nuevo estado de la venta
                const nuevoEstadoVenta = MP_STATUS_TO_VENTA_STATUS[fullPaymentData.status] || 'pendiente';

                // 12. Actualizar estado de la venta si cambió
                if (ventaExistente.estado_pago !== nuevoEstadoVenta) {
                    console.log(`🔄 [PaymentWebhookService] Actualizando estado de venta #${idVenta}: ${ventaExistente.estado_pago} → ${nuevoEstadoVenta}`);
                    
                    // Si el pago fue APROBADO, usar PaymentProcessingService
                    // Este servicio maneja: descuento de stock, envío a Andreani, emails, Event Bus
                    if (nuevoEstadoVenta === 'aprobado') {
                        console.log(`💰 [PaymentWebhookService] Pago APROBADO - Confirmando venta #${idVenta}`);
                        
                        await paymentProcessingService.confirmPayment(idVenta, {
                            metodoPago: 'mercadopago',
                            transactionId: paymentId,
                            paymentDate: fullPaymentData.date_approved 
                                ? new Date(fullPaymentData.date_approved) 
                                : new Date(),
                            notas: `Pago MP #${paymentId} - ${fullPaymentData.payment_method_id || fullPaymentData.payment_type_id}`,
                        });
                    } else {
                        // Para otros estados, solo actualizar el estado de la venta
                        await prisma.venta.update({
                            where: { id_venta: idVenta },
                            data: {
                                estado_pago: nuevoEstadoVenta,
                                actualizado_en: new Date(),
                            },
                        });
                    }
                } else {
                    // Log solo en desarrollo
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`ℹ️ [PaymentWebhookService] Venta #${idVenta} ya está en estado '${nuevoEstadoVenta}'`);
                }
                }

                const duration = Date.now() - startTime;
                console.log(`✅ [PaymentWebhookService] Pago ${paymentId} procesado - Venta #${idVenta} → ${nuevoEstadoVenta} (${duration}ms)`);

                return {
                    success: true,
                    paymentId,
                    action,
                    ventaId: idVenta,
                    previousStatus: existingPayment?.status_mp || undefined,
                    newStatus: fullPaymentData.status,
                };

            } finally {
                // Siempre liberar el lock
                this.releaseLock(paymentId);
            }

        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`❌ [PaymentWebhookService] Error procesando webhook (${duration}ms):`, error);

            // Guardar webhook fallido para retry posterior
            await this.saveFailedWebhook(
                webhookData.data?.id?.toString() || 'unknown',
                webhookData,
                error
            );

            return {
                success: false,
                paymentId: webhookData.data?.id?.toString() || 'unknown',
                action: 'skipped',
                error: error.message,
            };
        }
    }

    /**
     * Obtiene información completa del pago desde la API de Mercado Pago
     */
    private async getPaymentFromMercadoPago(paymentId: string): Promise<MercadoPagoPaymentResponse | null> {
        try {
            const paymentData = await mercadoPagoService.getPayment(paymentId);
            return paymentData;
        } catch (error: any) {
            console.error(`❌ [PaymentWebhookService] Error al obtener pago ${paymentId} desde MP:`, error.message);
            return null;
        }
    }

    /**
     * Construye los datos del pago para guardar en Prisma
     */
    private buildPaymentData(
        fullPaymentData: MercadoPagoPaymentResponse,
        idVenta: number,
        externalReference: string
    ): PaymentDataForPrisma {
        const estadoVenta = MP_STATUS_TO_VENTA_STATUS[fullPaymentData.status] || 'pendiente';
        const transactionDetails = fullPaymentData.transaction_details || {};
        const feeDetails = fullPaymentData.fee_details || [];

        // Calcular comisión total
        let commissionAmount: number | null = null;
        if (feeDetails && Array.isArray(feeDetails) && feeDetails.length > 0) {
            commissionAmount = feeDetails.reduce((sum: number, fee: any) => sum + (fee.amount || 0), 0);
        } else if (transactionDetails.total_paid_amount && transactionDetails.net_received_amount) {
            commissionAmount = Number(transactionDetails.total_paid_amount) - Number(transactionDetails.net_received_amount);
        }

        // Información de tarjeta (si aplica)
        let cardInfo = null;
        if (fullPaymentData.card) {
            cardInfo = {
                last_four_digits: fullPaymentData.card.last_four_digits,
                first_six_digits: fullPaymentData.card.first_six_digits,
                expiration_month: fullPaymentData.card.expiration_month,
                expiration_year: fullPaymentData.card.expiration_year,
                cardholder: fullPaymentData.card.cardholder,
            };
        }

        // Información del pagador
        let payerInfo = null;
        if (fullPaymentData.payer) {
            payerInfo = {
                id: fullPaymentData.payer.id,
                email: fullPaymentData.payer.email,
                first_name: fullPaymentData.payer.first_name,
                last_name: fullPaymentData.payer.last_name,
                identification: fullPaymentData.payer.identification,
                phone: fullPaymentData.payer.phone,
            };
        }

        return {
            venta_id: idVenta,
            payment_id: fullPaymentData.id.toString(),
            preference_id: fullPaymentData.preference_id || null,
            external_reference: externalReference,
            status_mp: fullPaymentData.status,
            status_detail: fullPaymentData.status_detail || null,
            estado_venta_relacionado: estadoVenta,
            payment_type_id: fullPaymentData.payment_type_id,
            payment_method_id: fullPaymentData.payment_method_id || null,
            installments: fullPaymentData.installments || 1,
            transaction_amount: fullPaymentData.transaction_amount,
            total_paid_amount: transactionDetails.total_paid_amount 
                ? Number(transactionDetails.total_paid_amount) 
                : null,
            net_received_amount: transactionDetails.net_received_amount 
                ? Number(transactionDetails.net_received_amount) 
                : null,
            commission_amount: commissionAmount,
            fee_details: feeDetails.length > 0 ? feeDetails : null,
            currency_id: fullPaymentData.currency_id || 'ARS',
            operation_type: fullPaymentData.operation_type || null,
            date_created: new Date(fullPaymentData.date_created),
            date_approved: fullPaymentData.date_approved 
                ? new Date(fullPaymentData.date_approved) 
                : null,
            money_release_date: fullPaymentData.money_release_date 
                ? new Date(fullPaymentData.money_release_date) 
                : null,
            card_info: cardInfo,
            payer_info: payerInfo,
            processing_mode: fullPaymentData.processing_mode || null,
            live_mode: fullPaymentData.live_mode,
            webhook_processed_at: new Date(),
            updated_at: new Date(),
        };
    }

    /**
     * Guarda un webhook fallido para reprocesamiento posterior
     */
    private async saveFailedWebhook(
        paymentId: string,
        webhookData: IMercadoPagoWebhookEvent,
        error: Error
    ): Promise<void> {
        try {
            // Verificar si ya existe un registro fallido para este pago
            const existing = await prisma.failed_webhooks.findFirst({
                where: {
                    payment_id: paymentId,
                    status: { in: ['pending', 'processing'] },
                },
            });

            if (existing) {
                // Actualizar el existente
                await prisma.failed_webhooks.update({
                    where: { id: existing.id },
                    data: {
                        webhook_data: webhookData as any,
                        error_message: error.message,
                        error_stack: error.stack || null,
                        retry_count: { increment: 1 },
                        last_retry_at: new Date(),
                        next_retry_at: this.calculateNextRetryTime(existing.retry_count + 1),
                        updated_at: new Date(),
                    },
                });
                // Log solo en desarrollo
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`📝 [PaymentWebhookService] Webhook fallido actualizado (retry #${existing.retry_count + 1})`);
                }
            } else {
                // Crear nuevo registro
                await prisma.failed_webhooks.create({
                    data: {
                        payment_id: paymentId,
                        webhook_data: webhookData as any,
                        error_message: error.message,
                        error_stack: error.stack || null,
                        retry_count: 0,
                        max_retries: 5,
                        status: 'pending',
                        next_retry_at: this.calculateNextRetryTime(0),
                    },
                });
                console.log(`📝 [PaymentWebhookService] Guardado webhook fallido para pago ${paymentId}`);
            }
        } catch (saveError) {
            console.error('❌ [PaymentWebhookService] Error al guardar webhook fallido:', saveError);
        }
    }

    /**
     * Calcula el tiempo para el próximo retry usando exponential backoff
     * Intervalos: 1min, 5min, 15min, 1h, 2h
     */
    private calculateNextRetryTime(retryCount: number): Date {
        const delaySeconds = [60, 300, 900, 3600, 7200]; // 1min, 5min, 15min, 1h, 2h
        const delay = delaySeconds[Math.min(retryCount, delaySeconds.length - 1)];
        return new Date(Date.now() + delay * 1000);
    }

    /**
     * Procesa un webhook manualmente (útil para testing o reprocesamiento)
     */
    async processManualPayment(paymentId: string): Promise<WebhookProcessResult> {
        // Log solo en desarrollo
        if (process.env.NODE_ENV !== 'production') {
            console.log(`🔧 [PaymentWebhookService] Procesamiento manual: ${paymentId}`);
        }
        
        return this.processWebhook({
            action: 'payment.updated',
            data: { id: paymentId },
            type: 'payment',
        });
    }

    /**
     * Obtiene estadísticas de webhooks
     */
    async getStats(): Promise<{
        totalProcessed: number;
        pendingRetries: number;
        failedPermanently: number;
        byStatus: Record<string, number>;
    }> {
        const [
            totalProcessed,
            pendingRetries,
            failedPermanently,
            byStatusRaw,
        ] = await Promise.all([
            prisma.mercado_pago_payments.count(),
            prisma.failed_webhooks.count({
                where: { status: 'pending' },
            }),
            prisma.failed_webhooks.count({
                where: { status: 'failed' },
            }),
            prisma.mercado_pago_payments.groupBy({
                by: ['status_mp'],
                _count: { status_mp: true },
            }),
        ]);

        const byStatus: Record<string, number> = {};
        for (const item of byStatusRaw) {
            byStatus[item.status_mp] = item._count.status_mp;
        }

        return {
            totalProcessed,
            pendingRetries,
            failedPermanently,
            byStatus,
        };
    }

    /**
     * Destructor - limpia el intervalo de limpieza
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

// Exportar instancia singleton
export const paymentWebhookService = new PaymentWebhookService();
export { PaymentWebhookService };
