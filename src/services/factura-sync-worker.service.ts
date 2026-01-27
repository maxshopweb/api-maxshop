/**
 * Worker de sincronización automática de facturas
 * Ejecuta un cron job cada 30 minutos para sincronizar facturas pendientes
 */

import * as cron from 'node-cron';
import facturaSyncService from './factura-sync.service';

export class FacturaSyncWorker {
    private cronJob: cron.ScheduledTask | null = null;
    private readonly CRON_SCHEDULE = '*/30 * * * *'; // Cada 30 minutos

    /**
     * Inicia el worker de sincronización
     */
    start(): void {
        if (this.cronJob) {
            console.warn('⚠️ [FacturaSyncWorker] Worker ya está iniciado');
            return;
        }

        console.log(`🔄 [FacturaSyncWorker] Iniciando worker de sincronización (cada 30 minutos)...`);

        this.cronJob = cron.schedule(this.CRON_SCHEDULE, async () => {
            console.log('🔄 [FacturaSyncWorker] Ejecutando sincronización automática...');
            try {
                const resultado = await facturaSyncService.syncFacturasPendientes();
                console.log(`✅ [FacturaSyncWorker] Sincronización completada: ${resultado.procesadas} procesada(s), ${resultado.noEncontradas} no encontrada(s), ${resultado.errores} error(es)`);
            } catch (error: any) {
                console.error('❌ [FacturaSyncWorker] Error en sincronización automática:', error);
            }
        }, {
            scheduled: true,
            timezone: 'America/Argentina/Buenos_Aires',
        });

        console.log('✅ [FacturaSyncWorker] Worker iniciado correctamente');
    }

    /**
     * Detiene el worker de sincronización
     */
    stop(): void {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            console.log('✅ [FacturaSyncWorker] Worker detenido');
        }
    }

    /**
     * Ejecuta una sincronización manual inmediata (útil para testing)
     */
    async runNow(): Promise<void> {
        console.log('🔄 [FacturaSyncWorker] Ejecutando sincronización manual...');
        try {
            const resultado = await facturaSyncService.syncFacturasPendientes();
            console.log(`✅ [FacturaSyncWorker] Sincronización manual completada: ${resultado.procesadas} procesada(s), ${resultado.noEncontradas} no encontrada(s), ${resultado.errores} error(es)`);
        } catch (error: any) {
            console.error('❌ [FacturaSyncWorker] Error en sincronización manual:', error);
            throw error;
        }
    }
}

// Instancia singleton
export const facturaSyncWorker = new FacturaSyncWorker();
export default facturaSyncWorker;
