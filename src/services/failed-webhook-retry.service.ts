/**
 * Servicio para reprocesar webhooks fallidos
 * 
 * Este servicio funciona como un "worker" que periódicamente busca webhooks
 * fallidos y los reprocesa. Es crucial para garantizar que no se pierdan
 * pagos aunque haya errores temporales.
 * 
 * Características:
 * - Ejecuta automáticamente cada X minutos
 * - Usa exponential backoff para los reintentos
 * - Marca como fallidos permanentemente después de N intentos
 * - Proporciona métricas y stats
 * 
 * @author MaxShop
 */

import { prisma } from '../index';
import { paymentWebhookService } from './payment-webhook.service';
import { IMercadoPagoWebhookEvent } from '../types';

// ============================================
// CONFIGURACIÓN
// ============================================

interface RetryServiceConfig {
    /** Intervalo entre ejecuciones del worker (ms) */
    runIntervalMs: number;
    /** Cantidad máxima de webhooks a procesar por ejecución */
    batchSize: number;
    /** Si es true, el worker se inicia automáticamente */
    autoStart: boolean;
}

const DEFAULT_CONFIG: RetryServiceConfig = {
    runIntervalMs: 60000, // 1 minuto
    batchSize: 10,
    autoStart: true,
};

// ============================================
// SERVICIO PRINCIPAL
// ============================================

class FailedWebhookRetryService {
    private config: RetryServiceConfig;
    private runInterval: NodeJS.Timeout | null = null;
    private isRunning = false;
    private lastRun: Date | null = null;
    private stats = {
        totalProcessed: 0,
        totalSucceeded: 0,
        totalFailed: 0,
        lastRunDuration: 0,
    };

    constructor(config?: Partial<RetryServiceConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        if (this.config.autoStart) {
            this.start();
        }
    }

    /**
     * Inicia el worker de retry
     */
    start(): void {
        if (this.runInterval) {
            console.log('⚠️ [FailedWebhookRetry] Worker ya está corriendo');
            return;
        }

        console.log(`✅ [FailedWebhookRetry] Iniciando worker (intervalo: ${this.config.runIntervalMs}ms)`);
        
        // Ejecutar la primera vez después de un pequeño delay para asegurar que Prisma esté listo
        setTimeout(() => {
            this.runRetryBatch().catch((error) => {
                console.error('❌ [FailedWebhookRetry] Error en primera ejecución:', error);
            });
        }, 2000); // 2 segundos de delay
        
        // Programar ejecuciones periódicas
        this.runInterval = setInterval(() => {
            this.runRetryBatch().catch((error) => {
                console.error('❌ [FailedWebhookRetry] Error en ejecución periódica:', error);
            });
        }, this.config.runIntervalMs);
    }

    /**
     * Detiene el worker de retry
     */
    stop(): void {
        if (this.runInterval) {
            clearInterval(this.runInterval);
            this.runInterval = null;
            console.log('🛑 [FailedWebhookRetry] Worker detenido');
        }
    }

    /**
     * Ejecuta un batch de retries de webhooks fallidos
     */
    async runRetryBatch(): Promise<{
        processed: number;
        succeeded: number;
        failed: number;
    }> {
        // Prevenir ejecuciones paralelas
        if (this.isRunning) {
            console.log('⏳ [FailedWebhookRetry] Batch anterior aún en ejecución, saltando...');
            return { processed: 0, succeeded: 0, failed: 0 };
        }

        // Verificar que Prisma esté disponible
        try {
            if (!prisma || typeof prisma.failed_webhooks === 'undefined') {
                console.warn('⚠️ [FailedWebhookRetry] Prisma no está disponible aún, saltando ejecución');
                return { processed: 0, succeeded: 0, failed: 0 };
            }
        } catch (error) {
            console.warn('⚠️ [FailedWebhookRetry] Error al verificar Prisma:', error);
            return { processed: 0, succeeded: 0, failed: 0 };
        }

        this.isRunning = true;
        const startTime = Date.now();
        let processed = 0;
        let succeeded = 0;
        let failed = 0;

        try {
            // Buscar webhooks pendientes de retry
            const pendingWebhooks = await prisma.failed_webhooks.findMany({
                where: {
                    status: 'pending',
                    next_retry_at: { lte: new Date() },
                    retry_count: { lt: 5 }, // max_retries por defecto
                },
                orderBy: { next_retry_at: 'asc' },
                take: this.config.batchSize,
            });

            if (pendingWebhooks.length === 0) {
                return { processed: 0, succeeded: 0, failed: 0 };
            }

            console.log(`🔄 [FailedWebhookRetry] Procesando ${pendingWebhooks.length} webhooks fallidos`);

            for (const webhook of pendingWebhooks) {
                processed++;
                
                try {
                    // Marcar como procesando
                    await prisma.failed_webhooks.update({
                        where: { id: webhook.id },
                        data: { status: 'processing' },
                    });

                    // Reprocesar el webhook
                    const webhookData = webhook.webhook_data as unknown as IMercadoPagoWebhookEvent;
                    const result = await paymentWebhookService.processWebhook(webhookData);

                    if (result.success && result.action !== 'skipped') {
                        // Éxito - marcar como completado
                        await prisma.failed_webhooks.update({
                            where: { id: webhook.id },
                            data: {
                                status: 'completed',
                                updated_at: new Date(),
                            },
                        });
                        succeeded++;
                        console.log(`✅ [FailedWebhookRetry] Webhook ${webhook.payment_id} reprocesado exitosamente`);
                    } else if (result.action === 'skipped') {
                        // Fue saltado (duplicado, etc) - marcar como completado
                        await prisma.failed_webhooks.update({
                            where: { id: webhook.id },
                            data: {
                                status: 'completed',
                                error_message: `Skipped: ${result.error || 'duplicate or invalid'}`,
                                updated_at: new Date(),
                            },
                        });
                        succeeded++;
                    } else {
                        throw new Error(result.error || 'Unknown error');
                    }

                } catch (error: any) {
                    failed++;
                    const newRetryCount = webhook.retry_count + 1;
                    const maxRetriesReached = newRetryCount >= (webhook.max_retries || 5);

                    // Actualizar registro de fallo
                    await prisma.failed_webhooks.update({
                        where: { id: webhook.id },
                        data: {
                            status: maxRetriesReached ? 'failed' : 'pending',
                            retry_count: newRetryCount,
                            last_retry_at: new Date(),
                            next_retry_at: maxRetriesReached 
                                ? null 
                                : this.calculateNextRetryTime(newRetryCount),
                            error_message: error.message,
                            error_stack: error.stack,
                            updated_at: new Date(),
                        },
                    });

                    if (maxRetriesReached) {
                        console.error(`❌ [FailedWebhookRetry] Webhook ${webhook.payment_id} falló permanentemente después de ${newRetryCount} intentos`);
                    } else {
                        console.warn(`⚠️ [FailedWebhookRetry] Webhook ${webhook.payment_id} falló (intento ${newRetryCount}/${webhook.max_retries || 5})`);
                    }
                }
            }

        } finally {
            this.isRunning = false;
            this.lastRun = new Date();
            this.stats.lastRunDuration = Date.now() - startTime;
            this.stats.totalProcessed += processed;
            this.stats.totalSucceeded += succeeded;
            this.stats.totalFailed += failed;

            if (processed > 0) {
                console.log(`📊 [FailedWebhookRetry] Batch completado: ${succeeded}/${processed} exitosos en ${this.stats.lastRunDuration}ms`);
            }
        }

        return { processed, succeeded, failed };
    }

    /**
     * Calcula el tiempo para el próximo retry usando exponential backoff
     */
    private calculateNextRetryTime(retryCount: number): Date {
        const delaySeconds = [60, 300, 900, 3600, 7200]; // 1min, 5min, 15min, 1h, 2h
        const delay = delaySeconds[Math.min(retryCount, delaySeconds.length - 1)];
        return new Date(Date.now() + delay * 1000);
    }

    /**
     * Fuerza el reprocesamiento de un webhook específico
     */
    async retrySpecificWebhook(webhookId: bigint | number): Promise<boolean> {
        try {
            const webhook = await prisma.failed_webhooks.findUnique({
                where: { id: BigInt(webhookId) },
            });

            if (!webhook) {
                console.error(`❌ [FailedWebhookRetry] Webhook ${webhookId} no encontrado`);
                return false;
            }

            console.log(`🔧 [FailedWebhookRetry] Forzando retry de webhook ${webhookId}`);

            // Resetear estado para permitir retry
            await prisma.failed_webhooks.update({
                where: { id: BigInt(webhookId) },
                data: {
                    status: 'pending',
                    next_retry_at: new Date(),
                    updated_at: new Date(),
                },
            });

            // Ejecutar retry inmediatamente
            const webhookData = webhook.webhook_data as unknown as IMercadoPagoWebhookEvent;
            const result = await paymentWebhookService.processWebhook(webhookData);

            if (result.success) {
                await prisma.failed_webhooks.update({
                    where: { id: BigInt(webhookId) },
                    data: {
                        status: 'completed',
                        updated_at: new Date(),
                    },
                });
                return true;
            }

            return false;
        } catch (error) {
            console.error(`❌ [FailedWebhookRetry] Error al forzar retry:`, error);
            return false;
        }
    }

    /**
     * Obtiene todos los webhooks fallidos permanentemente (para revisión manual)
     */
    async getPermanentlyFailed(): Promise<any[]> {
        return prisma.failed_webhooks.findMany({
            where: { status: 'failed' },
            orderBy: { created_at: 'desc' },
        });
    }

    /**
     * Obtiene webhooks pendientes de retry
     */
    async getPendingRetries(): Promise<any[]> {
        return prisma.failed_webhooks.findMany({
            where: { status: 'pending' },
            orderBy: { next_retry_at: 'asc' },
        });
    }

    /**
     * Resetea un webhook fallido para permitir nuevos intentos
     */
    async resetFailedWebhook(webhookId: bigint | number): Promise<void> {
        await prisma.failed_webhooks.update({
            where: { id: BigInt(webhookId) },
            data: {
                status: 'pending',
                retry_count: 0,
                next_retry_at: new Date(),
                updated_at: new Date(),
            },
        });
        console.log(`🔄 [FailedWebhookRetry] Webhook ${webhookId} reseteado para nuevos intentos`);
    }

    /**
     * Obtiene estadísticas del servicio
     */
    getStats(): {
        isRunning: boolean;
        lastRun: Date | null;
        totalProcessed: number;
        totalSucceeded: number;
        totalFailed: number;
        lastRunDuration: number;
        config: RetryServiceConfig;
    } {
        return {
            isRunning: this.isRunning,
            lastRun: this.lastRun,
            ...this.stats,
            config: this.config,
        };
    }

    /**
     * Obtiene un resumen de webhooks por estado
     */
    async getWebhookSummary(): Promise<{
        pending: number;
        processing: number;
        completed: number;
        failed: number;
        total: number;
    }> {
        const counts = await prisma.failed_webhooks.groupBy({
            by: ['status'],
            _count: { status: true },
        });

        const summary = {
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            total: 0,
        };

        for (const item of counts) {
            const status = item.status as keyof typeof summary;
            if (status in summary) {
                summary[status] = item._count.status;
            }
            summary.total += item._count.status;
        }

        return summary;
    }
}

// Exportar instancia singleton
// NO auto-iniciar por defecto - se iniciará explícitamente después de que el servidor esté listo
export const failedWebhookRetryService = new FailedWebhookRetryService({
    autoStart: false, // Se iniciará manualmente después de que Prisma esté listo
});

export { FailedWebhookRetryService };
