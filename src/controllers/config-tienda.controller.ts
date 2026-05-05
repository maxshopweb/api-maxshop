import { Request, Response } from 'express';
import { ConfigTiendaService } from '../services/config-tienda.service';
import { logServerError, toPublicErrorMessage } from '../utils/publicError';
import { IApiResponse } from '../types/index';
import { IUpdateConfigTiendaDTO } from '../types/config-tienda.type';

const configTiendaService = new ConfigTiendaService();

const ALLOWED_KEYS: (keyof IUpdateConfigTiendaDTO)[] = [
  'envio_gratis_minimo',
  'envio_gratis_activo',
  'cuotas_sin_interes',
  'cuotas_sin_interes_activo',
  'cuotas_sin_interes_minimo',
  'datos_bancarios',
  'modo_mantenimiento',
];

function toUpdateDto(body: unknown): IUpdateConfigTiendaDTO {
  if (!body || typeof body !== 'object') return {};
  const src = body as Record<string, unknown>;
  const dto: IUpdateConfigTiendaDTO = {};
  if ('envio_gratis_minimo' in src && src.envio_gratis_minimo !== undefined)
    dto.envio_gratis_minimo = Number(src.envio_gratis_minimo);
  if ('envio_gratis_activo' in src && src.envio_gratis_activo !== undefined)
    dto.envio_gratis_activo = Boolean(src.envio_gratis_activo);
  if ('cuotas_sin_interes' in src && src.cuotas_sin_interes !== undefined)
    dto.cuotas_sin_interes = Number(src.cuotas_sin_interes);
  if ('cuotas_sin_interes_activo' in src && src.cuotas_sin_interes_activo !== undefined)
    dto.cuotas_sin_interes_activo = Boolean(src.cuotas_sin_interes_activo);
  if ('cuotas_sin_interes_minimo' in src && src.cuotas_sin_interes_minimo !== undefined)
    dto.cuotas_sin_interes_minimo = Number(src.cuotas_sin_interes_minimo);
  if ('datos_bancarios' in src) dto.datos_bancarios = src.datos_bancarios as IUpdateConfigTiendaDTO['datos_bancarios'];
  if ('modo_mantenimiento' in src && src.modo_mantenimiento !== undefined)
    dto.modo_mantenimiento = Boolean(src.modo_mantenimiento);
  return dto;
}

export class ConfigTiendaController {
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const data = await configTiendaService.getConfig();
      const response: IApiResponse = { success: true, data };
      res.json(response);
    } catch (error) {
      logServerError('ConfigTiendaController.getConfig', error);
      res.status(500).json({
        success: false,
        error: toPublicErrorMessage(error, 'No pudimos cargar la configuración de la tienda.'),
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
      logServerError('ConfigTiendaController.updateConfig', error);
      res.status(500).json({
        success: false,
        error: toPublicErrorMessage(error, 'No pudimos guardar la configuración. Intentá de nuevo.'),
      });
    }
  }
}
