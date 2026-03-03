import { Request, Response } from 'express';
import { ConfigTiendaService } from '../services/config-tienda.service';
import { IApiResponse } from '../types/index';
import { IUpdateConfigTiendaDTO } from '../types/config-tienda.type';

const configTiendaService = new ConfigTiendaService();

const ALLOWED_KEYS: (keyof IUpdateConfigTiendaDTO)[] = [
  'envio_gratis_minimo',
  'cuotas_sin_interes',
  'cuotas_sin_interes_minimo',
  'datos_bancarios',
];

function toUpdateDto(body: unknown): IUpdateConfigTiendaDTO {
  if (!body || typeof body !== 'object') return {};
  const src = body as Record<string, unknown>;
  const dto: IUpdateConfigTiendaDTO = {};
  if ('envio_gratis_minimo' in src && src.envio_gratis_minimo !== undefined)
    dto.envio_gratis_minimo = Number(src.envio_gratis_minimo);
  if ('cuotas_sin_interes' in src && src.cuotas_sin_interes !== undefined)
    dto.cuotas_sin_interes = Number(src.cuotas_sin_interes);
  if ('cuotas_sin_interes_minimo' in src && src.cuotas_sin_interes_minimo !== undefined)
    dto.cuotas_sin_interes_minimo = Number(src.cuotas_sin_interes_minimo);
  if ('datos_bancarios' in src) dto.datos_bancarios = src.datos_bancarios as IUpdateConfigTiendaDTO['datos_bancarios'];
  return dto;
}

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
      const body = toUpdateDto(req.body);
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
