import { Request, Response } from 'express';
import sincronizacionService from '../services/sincronizacion/sincronizacion.service';
import csvImporterService from '../services/sincronizacion/csv-importer.service';
import syncRunService from '../services/sync-run.service';
import { ProductosService } from '../services/productos.service';
import { auditService } from '../services/audit.service';
import * as path from 'path';

const productosService = new ProductosService();

/** Debe enviarse en `confirmacion` cuando `force_overwrite` es true (evita ejecución accidental). */
export const CONFIRMACION_FORCE_ERP_TOTAL = 'FORZAR_SINCRONIZACION_ERP_TOTAL';

function wantsForceOverwrite(req: Request): boolean {
  const b = req.body as Record<string, unknown> | undefined;
  if (!b || typeof b !== 'object') return false;
  if (b.force_overwrite === true) return true;
  if (b.force === true) return true;
  return false;
}

function validateConfirmacionForce(req: Request): { ok: true } | { ok: false; error: string } {
  const raw = (req.body as Record<string, unknown>)?.confirmacion;
  const confirmacion = typeof raw === 'string' ? raw.trim() : '';
  if (confirmacion !== CONFIRMACION_FORCE_ERP_TOTAL) {
    return {
      ok: false,
      error: `Para force_overwrite: envíe "confirmacion": "${CONFIRMACION_FORCE_ERP_TOTAL}" en el body JSON.`,
    };
  }
  return { ok: true };
}

export class SincronizacionController {
  /**
   * POST /api/sincronizacion/completa
   * Sincronización completa: FTP → CSV → BD
   *
   * Body opcional:
   * - force_overwrite / force: true → resetea flags ERP en todos los productos antes del sync (requiere confirmacion)
   * - confirmacion: "${CONFIRMACION_FORCE_ERP_TOTAL}"
   */
  async sincronizarCompleto(req: Request, res: Response): Promise<void> {
    const tInicio = Date.now();
    const force = wantsForceOverwrite(req);
    let filasFlagsReseteadas = 0;

    if (force) {
      const v = validateConfirmacionForce(req);
      if (!v.ok) {
        res.status(400).json({ success: false, message: v.error });
        return;
      }
      const userId = req.authenticatedUser?.id ?? null;
      console.log(
        `[ERP_TOTAL] Inicio reset masivo flags ERP (sync completa) user=${userId ?? 'n/a'} endpoint=${req.originalUrl}`
      );
      const { filasActualizadas } = await productosService.resetFlagsErpMasivoParaSyncTotal();
      filasFlagsReseteadas = filasActualizadas;
      console.log(
        `[ERP_TOTAL] Flags reseteados en ${filasFlagsReseteadas} producto(s) antes de sincronizarCompleto (${Date.now() - tInicio}ms)`
      );
      await auditService.record({
        action: 'SYNC_ERP_FORCE_TOTAL_RESET_FLAGS',
        table: 'productos',
        description: `Reset masivo flags ERP antes de sincronización completa. Productos afectados: ${filasFlagsReseteadas}`,
        currentData: { filasFlagsReseteadas, operacion: 'sincronizarCompleto' },
        userId: userId ?? undefined,
        endpoint: req.originalUrl,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        adminAudit: true,
      });
    }

    try {
      console.log('🚀 Iniciando sincronización completa...');
      const resultado = await sincronizacionService.sincronizarCompleto();
      const durMs = Date.now() - tInicio;

      if (force) {
        await auditService.record({
          action: 'SYNC_ERP_FORCE_TOTAL_COMPLETA_FIN',
          table: 'productos',
          description: `Sincronización completa tras reset masivo. Éxito: ${resultado.exito}. Duración total: ${durMs}ms`,
          currentData: {
            filasFlagsReseteadas,
            exitoSync: resultado.exito,
            duracionTotalMs: durMs,
            mensaje: resultado.mensaje,
          },
          userId: req.authenticatedUser?.id ?? undefined,
          endpoint: req.originalUrl,
          userAgent: req.headers['user-agent']?.toString() ?? null,
          status: resultado.exito ? 'SUCCESS' : 'ERROR',
          processingTimeMs: durMs,
          adminAudit: true,
        });
      }

      // Persistir el run en BD (sin bloquear la respuesta)
      syncRunService.save(resultado, 'ON_DEMAND').catch((persistErr: unknown) => {
        const msg = persistErr instanceof Error ? persistErr.message : String(persistErr);
        console.warn('[SincronizacionController] No se pudo persistir el run:', msg);
      });

      if (resultado.exito) {
        res.json({
          success: true,
          message: resultado.mensaje,
          data: {
            ...resultado,
            ...(force && {
              forceOverwrite: {
                aplicado: true,
                productosFlagsReseteados: filasFlagsReseteadas,
                confirmacionRequerida: CONFIRMACION_FORCE_ERP_TOTAL,
              },
            }),
          },
        });
      } else {
        res.status(500).json({
          success: false,
          message: resultado.mensaje,
          data: {
            ...resultado,
            ...(force && {
              forceOverwrite: {
                aplicado: true,
                productosFlagsReseteados: filasFlagsReseteadas,
              },
            }),
          },
        });
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('Error en sincronización completa:', error);
      if (force) {
        await auditService.record({
          action: 'SYNC_ERP_FORCE_TOTAL_COMPLETA_ERROR',
          table: 'productos',
          description: `Error tras reset masivo flags: ${errMsg}`,
          currentData: { filasFlagsReseteadas, error: errMsg },
          userId: req.authenticatedUser?.id ?? undefined,
          endpoint: req.originalUrl,
          userAgent: req.headers['user-agent']?.toString() ?? null,
          status: 'ERROR',
          adminAudit: true,
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error al ejecutar sincronización completa',
        error: errMsg,
      });
    }
  }

  /**
   * POST /api/sincronizacion/importar
   * Solo importa CSV a BD (asume CSV ya generados)
   *
   * Body opcional: csvDir, force_overwrite + confirmacion (misma regla que /completa)
   */
  async importarCSV(req: Request, res: Response): Promise<void> {
    const tInicio = Date.now();
    const force = wantsForceOverwrite(req);
    let filasFlagsReseteadas = 0;

    if (force) {
      const v = validateConfirmacionForce(req);
      if (!v.ok) {
        res.status(400).json({ success: false, message: v.error });
        return;
      }
      const userId = req.authenticatedUser?.id ?? null;
      console.log(
        `[ERP_TOTAL] Inicio reset masivo flags ERP (importar CSV) user=${userId ?? 'n/a'} endpoint=${req.originalUrl}`
      );
      const { filasActualizadas } = await productosService.resetFlagsErpMasivoParaSyncTotal();
      filasFlagsReseteadas = filasActualizadas;
      console.log(
        `[ERP_TOTAL] Flags reseteados en ${filasFlagsReseteadas} producto(s) antes de importarTodo (${Date.now() - tInicio}ms)`
      );
      await auditService.record({
        action: 'SYNC_ERP_FORCE_TOTAL_RESET_FLAGS',
        table: 'productos',
        description: `Reset masivo flags ERP antes de importar CSV. Productos afectados: ${filasFlagsReseteadas}`,
        currentData: { filasFlagsReseteadas, operacion: 'importarCSV' },
        userId: userId ?? undefined,
        endpoint: req.originalUrl,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        adminAudit: true,
      });
    }

    try {
      const csvDir = req.body?.csvDir || path.join(__dirname, '../../data/csv');

      console.log('📥 Iniciando importación desde CSV...');
      const resumen = await csvImporterService.importarTodo(csvDir);
      const durMs = Date.now() - tInicio;

      if (force) {
        await auditService.record({
          action: 'SYNC_ERP_FORCE_TOTAL_IMPORTAR_FIN',
          table: 'productos',
          description: `Importación CSV tras reset masivo. Duración: ${durMs}ms`,
          currentData: {
            filasFlagsReseteadas,
            resumenEstadisticas: resumen.estadisticas,
            duracionTotalMs: resumen.duracionTotalMs,
          },
          userId: req.authenticatedUser?.id ?? undefined,
          endpoint: req.originalUrl,
          userAgent: req.headers['user-agent']?.toString() ?? null,
          processingTimeMs: durMs,
          adminAudit: true,
        });
      }

      res.json({
        success: true,
        message: 'Importación completada exitosamente',
        data: {
          resumen,
          ...(force && {
            forceOverwrite: {
              aplicado: true,
              productosFlagsReseteados: filasFlagsReseteadas,
              confirmacionRequerida: CONFIRMACION_FORCE_ERP_TOTAL,
            },
          }),
        },
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('Error en importación CSV:', error);
      if (force) {
        await auditService.record({
          action: 'SYNC_ERP_FORCE_TOTAL_IMPORTAR_ERROR',
          table: 'productos',
          description: `Error importación tras reset masivo: ${errMsg}`,
          currentData: { filasFlagsReseteadas, error: errMsg },
          userId: req.authenticatedUser?.id ?? undefined,
          endpoint: req.originalUrl,
          userAgent: req.headers['user-agent']?.toString() ?? null,
          status: 'ERROR',
          adminAudit: true,
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error al importar CSV',
        error: errMsg,
      });
    }
  }

  /**
   * GET /api/sincronizacion/estado
   * Retorna el último run real + hint de force_overwrite (compatibilidad hacia atrás).
   */
  async obtenerEstado(req: Request, res: Response): Promise<void> {
    void req;
    try {
      const stats = await syncRunService.getStats();
      res.json({
        success: true,
        message: 'Estado de sincronización',
        data: {
          ultimaSincronizacion: stats.ultimaCorrida,
          estado: stats.ultimaCorrida?.resultado ?? 'sin_datos',
          horasSinExito: stats.horasSinExito,
          forceOverwrite: {
            confirmacion: CONFIRMACION_FORCE_ERP_TOTAL,
            bodyEjemplo: {
              force_overwrite: true,
              confirmacion: CONFIRMACION_FORCE_ERP_TOTAL,
            },
          },
        },
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, message: 'Error al obtener estado', error: errMsg });
    }
  }

  /**
   * GET /api/sincronizacion/runs
   * Lista paginada de corridas. Query: ?page=1&limit=50
   */
  async listarRuns(req: Request, res: Response): Promise<void> {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const { runs, total } = await syncRunService.findAll(page, limit);
      res.json({
        success: true,
        data: runs,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, message: 'Error al listar corridas', error: errMsg });
    }
  }

  /**
   * GET /api/sincronizacion/runs/:id
   * Detalle de una corrida.
   */
  async obtenerRun(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'ID inválido' });
        return;
      }
      const run = await syncRunService.findById(id);
      if (!run) {
        res.status(404).json({ success: false, message: 'Corrida no encontrada' });
        return;
      }
      res.json({ success: true, data: run });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, message: 'Error al obtener corrida', error: errMsg });
    }
  }

  /**
   * GET /api/sincronizacion/stats
   * Estadísticas para cards del dashboard.
   */
  async obtenerStats(req: Request, res: Response): Promise<void> {
    void req;
    try {
      const stats = await syncRunService.getStats();
      res.json({ success: true, data: stats });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, message: 'Error al obtener stats', error: errMsg });
    }
  }
}

export default new SincronizacionController();
