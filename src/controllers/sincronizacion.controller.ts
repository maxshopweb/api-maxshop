import { Request, Response } from 'express';
import sincronizacionService from '../services/sincronizacion/sincronizacion.service';
import csvImporterService from '../services/sincronizacion/csv-importer.service';
import * as path from 'path';

export class SincronizacionController {
  /**
   * POST /api/sincronizacion/completa
   * Sincronización completa: FTP → CSV → BD
   */
  async sincronizarCompleto(req: Request, res: Response): Promise<void> {
    try {
      console.log('🚀 Iniciando sincronización completa...');
      const resultado = await sincronizacionService.sincronizarCompleto();

      if (resultado.exito) {
        res.json({
          success: true,
          message: resultado.mensaje,
          data: resultado,
        });
      } else {
        res.status(500).json({
          success: false,
          message: resultado.mensaje,
          data: resultado,
        });
      }
    } catch (error: any) {
      console.error('Error en sincronización completa:', error);
      res.status(500).json({
        success: false,
        message: 'Error al ejecutar sincronización completa',
        error: error?.message || String(error),
      });
    }
  }

  /**
   * POST /api/sincronizacion/importar
   * Solo importa CSV a BD (asume CSV ya generados)
   */
  async importarCSV(req: Request, res: Response): Promise<void> {
    try {
      const csvDir = req.body.csvDir || path.join(__dirname, '../../data/csv');

      console.log('📥 Iniciando importación desde CSV...');
      const resumen = await csvImporterService.importarTodo(csvDir);

      res.json({
        success: true,
        message: 'Importación completada exitosamente',
        data: resumen,
      });
    } catch (error: any) {
      console.error('Error en importación CSV:', error);
      res.status(500).json({
        success: false,
        message: 'Error al importar CSV',
        error: error?.message || String(error),
      });
    }
  }

  /**
   * GET /api/sincronizacion/estado
   * Estado de última sincronización (placeholder para futuro)
   */
  async obtenerEstado(req: Request, res: Response): Promise<void> {
    // TODO: Implementar almacenamiento de estado en BD o archivo
    res.json({
      success: true,
      message: 'Estado de sincronización',
      data: {
        ultimaSincronizacion: null,
        estado: 'no_disponible',
      },
    });
  }
}

export default new SincronizacionController();
