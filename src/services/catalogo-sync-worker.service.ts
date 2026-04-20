/**
 * Worker de sincronización automática del catálogo (FTP → CSV → BD).
 * - Se ejecuta una vez al levantar el servidor (con pequeño delay).
 * - Luego cada 20 minutos intenta sincronizar.
 * - Sin manifest (primera vez): sync completa (descarga todo, importarTodo).
 * - Con manifest: sync incremental (solo archivos cambiados, importaciones selectivas).
 * - SYNC_FORZAR_COMPLETA=true: siempre sync completa (mantenimiento/recuperación).
 * - Lock: si una sync sigue en curso, se salta el siguiente tick.
 */

import * as cron from 'node-cron';
import sincronizacionService from './sincronizacion/sincronizacion.service';
import syncRunService from './sync-run.service';

const DELAY_INICIAL_MS = 15_000; // 15 segundos después de levantar el servidor
const CRON_CADA_MINUTOS = 20;

export class CatalogoSyncWorker {
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;
  private readonly CRON_SCHEDULE = `*/${CRON_CADA_MINUTOS} * * * *`; // Cada 20 minutos

  /**
   * Inicia el worker: ejecuta una sync al arranque (con delay) y programa cada 20 min.
   */
  start(): void {
    if (this.cronJob) {
      console.warn('⚠️ [CatalogoSyncWorker] Worker ya está iniciado');
      return;
    }

    console.log(
      `🔄 [CatalogoSyncWorker] Iniciando: sync al arranque (en ${DELAY_INICIAL_MS / 1000}s) y cada ${CRON_CADA_MINUTOS} minutos`
    );

    // Primera ejecución al levantar el servidor (con delay para no bloquear el startup)
    setTimeout(() => {
      this.ejecutarSync('arranque');
    }, DELAY_INICIAL_MS);

    // Cron cada 20 minutos
    this.cronJob = cron.schedule(
      this.CRON_SCHEDULE,
      () => this.ejecutarSync('cron'),
      {
        scheduled: true,
        timezone: 'America/Argentina/Buenos_Aires',
      }
    );

    console.log('✅ [CatalogoSyncWorker] Worker iniciado correctamente');
  }

  /**
   * Ejecuta la sincronización: completa si no hay manifest (primera vez), incremental si ya existe.
   * Lock evita solapamientos.
   */
  private async ejecutarSync(origen: 'arranque' | 'cron'): Promise<void> {
    if (this.isRunning) {
      console.log(
        `⏭️ [CatalogoSyncWorker] Sync anterior aún en curso, se omite esta ejecución (${origen})`
      );
      return;
    }

    this.isRunning = true;
    const forzarCompleta =
      process.env.SYNC_FORZAR_COMPLETA === 'true' || process.env.SYNC_FORZAR_COMPLETA === '1';
    const incremental = !forzarCompleta && sincronizacionService.tieneManifest();
    console.log(
      `📡 [CatalogoSyncWorker] Iniciando sincronización (${origen}, ${incremental ? 'incremental' : forzarCompleta ? 'completa forzada' : 'completa'})...`
    );

    try {
      if (incremental) {
        const resultado = await sincronizacionService.sincronizarIncremental();
        if (resultado.exito) {
          if (resultado.sinCambios) {
            console.log(
              `✅ [CatalogoSyncWorker] Sin cambios en FTP (${resultado.duracionMs}ms)`
            );
          } else {
            console.log(
              `✅ [CatalogoSyncWorker] Sync incremental: ${resultado.archivosProcesados.length} archivo(s), ${resultado.duracionMs}ms`
            );
          }
        } else {
          console.error(
            `❌ [CatalogoSyncWorker] Sync incremental falló: ${resultado.mensaje}`,
            resultado.errores
          );
        }
        try {
          await syncRunService.saveIncremental(resultado, 'AUTO');
        } catch (persistErr: any) {
          console.warn('[CatalogoSyncWorker] No se pudo persistir run incremental:', persistErr?.message);
        }
      } else {
        const resultado = await sincronizacionService.sincronizarCompleto();
        if (resultado.exito) {
          console.log(
            `✅ [CatalogoSyncWorker] Sincronización completa en ${resultado.duracionTotalMs}ms`
          );
        } else {
          console.error(
            `❌ [CatalogoSyncWorker] Sincronización falló: ${resultado.mensaje}`,
            resultado.errores
          );
        }
        try {
          await syncRunService.save(resultado, 'AUTO');
        } catch (persistErr: any) {
          console.warn('[CatalogoSyncWorker] No se pudo persistir run completo:', persistErr?.message);
        }
      }
    } catch (error: any) {
      console.error('❌ [CatalogoSyncWorker] Error en sincronización:', error?.message || error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Detiene el worker (cron y flag).
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('✅ [CatalogoSyncWorker] Worker detenido');
    }
    this.isRunning = false;
  }
}

export const catalogoSyncWorker = new CatalogoSyncWorker();
export default catalogoSyncWorker;
