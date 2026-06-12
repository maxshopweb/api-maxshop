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
import { amountsMatch, roundMoney } from '../utils/money.utils';
import { paymentProcessingService } from './payment-processing.service';
import { lockService } from './lock.service';
import { eventBus } from '../infrastructure/event-bus/event-bus';
import { SaleEventType, SaleEventFactory } from '../domain/events/sale.events';
import { 
    IMercadoPagoWebhookEvent, 
    MP_STATUS_TO_VENTA_STATUS, 
    EstadoPago,
} from '../types';

// ============================================
// TIPOS E INTERFACES
// ============================================

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
    installment_amount: number | null;
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
    webhook_processed_at: Date | null;
    updated_at: Date;
    notes?: string;
}

// ============================================
// SERVICIO PRINCIPAL
// ============================================

class PaymentWebhookService {
    private lockTimeoutMs = 30000;

    constructor() {
        console.log('✅ [PaymentWebhookService] Inicializado (lock distribuido)');
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
            const paymentLockKey = `webhook:${paymentId}`;

            // 3. Lock por paymentId (evita duplicados del mismo pago)
            if (!(await lockService.acquireLock(paymentLockKey, this.lockTimeoutMs))) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`⏳ [PaymentWebhookService] Pago ${paymentId} ya está siendo procesado (lock activo)`);
                }
                return {
                    success: true,
                    paymentId,
                    action: 'skipped',
                };
            }

            let ventaLockKey: string | null = null;

            try {
                const fullPaymentData = await this.getPaymentFromMercadoPago(paymentId);
                
                if (!fullPaymentData) {
                    throw new Error(`No se pudo obtener datos del pago ${paymentId} desde MP`);
                }

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

                // Lock adicional por venta (evita race entre payment_ids distintos)
                ventaLockKey = `webhook:venta:${idVenta}`;
                if (!(await lockService.acquireLock(ventaLockKey, this.lockTimeoutMs))) {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`⏳ [PaymentWebhookService] Venta #${idVenta} ya está siendo procesada (lock activo)`);
                    }
                    return {
                        success: true,
                        paymentId,
                        action: 'skipped',
                        ventaId: idVenta,
                    };
                }

                if (process.env.NODE_ENV !== 'production') {
                    console.log(`🔗 [PaymentWebhookService] Pago ${paymentId} → Venta #${idVenta} (${fullPaymentData.status})`);
                }

                const ventaExistente = await prisma.venta.findUnique({
                    where: { id_venta: idVenta },
                    select: { id_venta: true, estado_pago: true, total_neto: true, observaciones: true, fecha: true },
                });

                if (!ventaExistente) {
                    console.error(`❌ [PaymentWebhookService] Venta #${idVenta} no encontrada`);
                    throw new Error(`Venta #${idVenta} no encontrada`);
                }

                const existingPayment = await prisma.mercado_pago_payments.findUnique({
                    where: { payment_id: paymentId },
                    select: { 
                        id: true, 
                        status_mp: true, 
                        webhook_processed_at: true,
                        updated_at: true,
                    },
                });

                const isApprovedMp = MercadoPagoService.isApprovedStatus(fullPaymentData.status);
                const needsReconciliation = this.needsApprovedReconciliation(
                    existingPayment,
                    fullPaymentData,
                    ventaExistente.estado_pago
                );

                if (
                    existingPayment &&
                    existingPayment.status_mp === fullPaymentData.status &&
                    !needsReconciliation
                ) {
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

                const nuevoEstadoVenta = MP_STATUS_TO_VENTA_STATUS[fullPaymentData.status] || 'pendiente';
                const markProcessedNow = !isApprovedMp;
                const paymentData = this.buildPaymentData(
                    fullPaymentData,
                    idVenta,
                    externalReference,
                    markProcessedNow
                );

                let action: 'created' | 'updated';

                if (existingPayment) {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`📝 [PaymentWebhookService] Actualizando pago ${paymentId}`);
                    }
                    await prisma.mercado_pago_payments.update({
                        where: { payment_id: paymentId },
                        data: paymentData,
                    });
                    action = 'updated';
                } else {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`✨ [PaymentWebhookService] Creando registro de pago ${paymentId}`);
                    }
                    await prisma.mercado_pago_payments.create({
                        data: paymentData,
                    });
                    action = 'created';
                }

                let estadoVentaFinal = ventaExistente.estado_pago;

                if (isApprovedMp) {
                    estadoVentaFinal = await this.processApprovedPayment(
                        idVenta,
                        paymentId,
                        fullPaymentData,
                        ventaExistente
                    );
                    await this.markPaymentProcessed(paymentId);
                } else if (ventaExistente.estado_pago !== nuevoEstadoVenta) {
                    const blocked = await this.shouldBlockVentaDegradation(
                        idVenta,
                        ventaExistente.estado_pago,
                        nuevoEstadoVenta,
                        paymentId
                    );

                    if (blocked) {
                        if (process.env.NODE_ENV !== 'production') {
                            console.log(
                                `ℹ️ [PaymentWebhookService] No se degrada venta #${idVenta} (${ventaExistente.estado_pago} → ${nuevoEstadoVenta}) por pago ${paymentId}`
                            );
                        }
                    } else {
                        console.log(
                            `🔄 [PaymentWebhookService] Actualizando estado de venta #${idVenta}: ${ventaExistente.estado_pago} → ${nuevoEstadoVenta}`
                        );
                        await prisma.venta.update({
                            where: { id_venta: idVenta },
                            data: {
                                estado_pago: nuevoEstadoVenta,
                                actualizado_en: new Date(),
                            },
                        });
                        estadoVentaFinal = nuevoEstadoVenta;
                    }
                }

                await this.emitMpPaymentUpdated(
                    idVenta,
                    paymentId,
                    fullPaymentData.status,
                    estadoVentaFinal ?? ventaExistente.estado_pago
                );

                const duration = Date.now() - startTime;
                console.log(
                    `✅ [PaymentWebhookService] Pago ${paymentId} procesado - Venta #${idVenta} → ${estadoVentaFinal} (${duration}ms)`
                );

                return {
                    success: true,
                    paymentId,
                    action,
                    ventaId: idVenta,
                    previousStatus: existingPayment?.status_mp || undefined,
                    newStatus: fullPaymentData.status,
                };

            } finally {
                if (ventaLockKey) {
                    await lockService.releaseLock(ventaLockKey);
                }
                await lockService.releaseLock(paymentLockKey);
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
     * Reconciliación: pago approved en BD pero venta aún no aprobada (confirm falló antes).
     */
    private needsApprovedReconciliation(
        existingPayment: { status_mp: string; webhook_processed_at: Date | null } | null,
        fullPaymentData: MercadoPagoPaymentResponse,
        estadoVentaActual: string | null
    ): boolean {
        if (!MercadoPagoService.isApprovedStatus(fullPaymentData.status)) {
            return false;
        }
        if (estadoVentaActual === 'aprobado') {
            return false;
        }
        if (!existingPayment || existingPayment.status_mp !== fullPaymentData.status) {
            return false;
        }
        return true;
    }

    private async processApprovedPayment(
        idVenta: number,
        paymentId: string,
        fullPaymentData: MercadoPagoPaymentResponse,
        ventaExistente: {
            total_neto: unknown;
            observaciones: string | null;
            estado_pago: string | null;
        }
    ): Promise<string> {
        const expectedTotal = ventaExistente.total_neto != null
            ? Number(ventaExistente.total_neto)
            : NaN;
        const paidAmount = Number(fullPaymentData.transaction_amount);

        if (!amountsMatch(paidAmount, expectedTotal)) {
            const msg =
                `[MP] Monto cobrado $${roundMoney(paidAmount)} no coincide con total_neto $${roundMoney(expectedTotal)} (pago #${paymentId})`;
            console.error(`❌ [PaymentWebhookService] Venta #${idVenta}: ${msg}`);
            await prisma.venta.update({
                where: { id_venta: idVenta },
                data: {
                    estado_pago: 'cancelado',
                    observaciones: [ventaExistente.observaciones, msg]
                        .filter(Boolean)
                        .join('\n'),
                    actualizado_en: new Date(),
                },
            });
            throw new Error(msg);
        }

        console.log(`💰 [PaymentWebhookService] Pago APROBADO - Confirmando venta #${idVenta}`);
        const ventaConfirmada = await paymentProcessingService.confirmPayment(idVenta, {
            metodoPago: 'mercadopago',
            transactionId: paymentId,
            paymentDate: fullPaymentData.date_approved
                ? new Date(fullPaymentData.date_approved)
                : new Date(),
            notas: `Pago MP #${paymentId} - ${fullPaymentData.payment_method_id || fullPaymentData.payment_type_id}`,
        });

        return ventaConfirmada.estado_pago ?? 'aprobado';
    }

    private async markPaymentProcessed(paymentId: string): Promise<void> {
        await prisma.mercado_pago_payments.update({
            where: { payment_id: paymentId },
            data: {
                webhook_processed_at: new Date(),
                updated_at: new Date(),
            },
        });
    }

    private async hasApprovedPaymentForVenta(
        idVenta: number,
        excludePaymentId?: string
    ): Promise<boolean> {
        const localApproved = await prisma.mercado_pago_payments.findFirst({
            where: {
                venta_id: idVenta,
                status_mp: { in: ['approved', 'authorized'] },
                ...(excludePaymentId ? { payment_id: { not: excludePaymentId } } : {}),
            },
            select: { payment_id: true },
        });
        return localApproved != null;
    }

    private async shouldBlockVentaDegradation(
        idVenta: number,
        estadoActual: string | null,
        nuevoEstado: EstadoPago | string,
        currentPaymentId: string
    ): Promise<boolean> {
        if (estadoActual === 'aprobado') {
            return true;
        }
        if (nuevoEstado === 'aprobado') {
            return false;
        }
        const degradingStates: string[] = ['rechazado', 'cancelado'];
        if (!degradingStates.includes(String(nuevoEstado))) {
            return false;
        }
        return this.hasApprovedPaymentForVenta(idVenta, currentPaymentId);
    }

    private async emitMpPaymentUpdated(
        idVenta: number,
        paymentId: string,
        statusMp: string,
        estadoPago: string | null
    ): Promise<void> {
        const event = SaleEventFactory.createMpPaymentUpdated({
            id_venta: idVenta,
            payment_id: paymentId,
            status_mp: statusMp,
            estado_pago: estadoPago ?? 'pendiente',
            fecha: new Date().toISOString(),
        });
        await eventBus.emit(SaleEventType.MP_PAYMENT_UPDATED, event.payload).catch((error) => {
            console.error('❌ [PaymentWebhookService] Error al emitir MP_PAYMENT_UPDATED:', error);
        });
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
        externalReference: string,
        markAsProcessed = true
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
            installment_amount: transactionDetails.installment_amount != null
                ? Number(transactionDetails.installment_amount)
                : null,
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
            webhook_processed_at: markAsProcessed ? new Date() : null,
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

    destroy(): void {
        lockService.destroy();
    }
}

// Exportar instancia singleton
export const paymentWebhookService = new PaymentWebhookService();
export { PaymentWebhookService };
