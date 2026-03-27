import { Request, Response } from 'express';
import { auditService } from '../services/audit.service';

export class AuditoriaController {
  /**
   * GET /api/admin/auditoria
   * Lista logs con paginación y filtros.
   * Query: page, limit, fecha_desde, fecha_hasta, tabla_afectada, method, estado.
   */
  async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));

      const filters: {
        fecha_desde?: string;
        fecha_hasta?: string;
        tabla_afectada?: string;
        method?: string;
        estado?: string;
      } = {};
      if (req.query.fecha_desde) filters.fecha_desde = String(req.query.fecha_desde);
      if (req.query.fecha_hasta) filters.fecha_hasta = String(req.query.fecha_hasta);
      if (req.query.tabla_afectada) filters.tabla_afectada = String(req.query.tabla_afectada);
      if (req.query.method) filters.method = String(req.query.method);
      if (req.query.estado) filters.estado = String(req.query.estado);

      const result = await auditService.getLogs(page, limit, filters);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      console.error('AuditoriaController.getLogs:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Error al obtener logs de auditoría'
      });
    }
  }
}
