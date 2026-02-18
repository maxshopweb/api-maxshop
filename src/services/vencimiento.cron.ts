/**
 * Cron que expira ventas pendientes de pago manual diariamente a las 02:00.
 */

import * as cron from 'node-cron';
import { expirarVentasPendientes } from './vencimiento.service';

const CRON_SCHEDULE = '0 2 * * *'; // 02:00 todos los días
const TIMEZONE = 'America/Argentina/Buenos_Aires';

let cronTask: cron.ScheduledTask | null = null;

export function startVencimientoCron(): void {
  if (cronTask) {
    console.warn('⚠️ [VencimientoCron] Cron ya iniciado');
    return;
  }

  console.log(`🕐 [VencimientoCron] Programando job diario a las 02:00 (${TIMEZONE})`);
  cronTask = cron.schedule(
    CRON_SCHEDULE,
    async () => {
      console.log(`🔄 [VencimientoCron] Inicio job de vencimiento de ventas - ${new Date().toISOString()}`);
      try {
        const result = await expirarVentasPendientes();
        console.log(
          `✅ [VencimientoCron] Fin job: ${result.vencidasCount} venta(s) vencida(s), ${result.duracionMs}ms - ${new Date().toISOString()}`
        );
      } catch (error) {
        console.error('❌ [VencimientoCron] Error en job de vencimiento:', error);
      }
    },
    { scheduled: true, timezone: TIMEZONE }
  );
  console.log('✅ [VencimientoCron] Cron iniciado');
}

export function stopVencimientoCron(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log('✅ [VencimientoCron] Cron detenido');
  }
}
