import { Request, Response } from 'express';
import { ConfigTiendaService } from '../services/config-tienda.service';
import { IApiResponse } from '../types/index';
import { IUpdateConfigTiendaDTO } from '../types/config-tienda.type';

const configTiendaService = new ConfigTiendaService();

export class ConfigTiendaController {
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const data = await configTiendaService.getConfig();
      const response: IApiResponse = { success: true, data };
      res.json(response);
    } catch (error) {
      console.error('ConfigTiendaController.getConfig:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Error al obtener configuración',
      });
    }
  }

  async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as IUpdateConfigTiendaDTO;
      const auditContext = req.authenticatedUser
        ? {
            userId: req.authenticatedUser.id,
            userAgent: req.headers['user-agent']?.toString() ?? null,
            endpoint: req.originalUrl,
          }
        : undefined;
      const data = await configTiendaService.updateConfig(body, auditContext);
      const response: IApiResponse = { success: true, data };
      res.json(response);
    } catch (error) {
      console.error('ConfigTiendaController.updateConfig:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Error al actualizar configuración',
      });
    }
  }
}
