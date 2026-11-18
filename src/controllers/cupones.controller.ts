import '../types/express';
import { Request, Response } from 'express';
import { cuponesService } from '../services/cupones.service';
import {
  createCuponSchema,
  updateCuponSchema,
  validateCuponBodySchema,
} from '../types/cupones.type';
import { logServerError, toPublicErrorMessage } from '../utils/publicError';

function statusFor(error: unknown): number {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const code = Number((error as { statusCode: number }).statusCode);
    if (Number.isInteger(code) && code >= 400 && code < 600) return code;
  }
  return 400;
}

export class CuponesController {
  async list(_req: Request, res: Response): Promise<void> {
    try {
      const data = await cuponesService.list();
      res.json({ success: true, data });
    } catch (error) {
      logServerError('CuponesController.list', error);
      res.status(500).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudieron listar los cupones.'),
      });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ success: false, error: 'id inválido' });
        return;
      }
      const data = await cuponesService.getById(id);
      if (!data) {
        res.status(404).json({ success: false, error: 'Cupón no encontrado' });
        return;
      }
      res.json({ success: true, data });
    } catch (error) {
      logServerError('CuponesController.getById', error);
      res.status(statusFor(error)).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudo obtener el cupón.'),
      });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createCuponSchema.parse(req.body);
      const data = await cuponesService.create(parsed);
      res.status(201).json({ success: true, data });
    } catch (error) {
      logServerError('CuponesController.create', error);
      res.status(statusFor(error)).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudo crear el cupón.'),
      });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ success: false, error: 'id inválido' });
        return;
      }
      const parsed = updateCuponSchema.parse(req.body);
      const data = await cuponesService.update(id, parsed);
      res.json({ success: true, data });
    } catch (error) {
      logServerError('CuponesController.update', error);
      res.status(statusFor(error)).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudo actualizar el cupón.'),
      });
    }
  }

  async toggle(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ success: false, error: 'id inválido' });
        return;
      }
      const data = await cuponesService.toggle(id);
      res.json({ success: true, data });
    } catch (error) {
      logServerError('CuponesController.toggle', error);
      res.status(statusFor(error)).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudo cambiar el estado del cupón.'),
      });
    }
  }

  async listCanjes(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ success: false, error: 'id inválido' });
        return;
      }
      const limitRaw = req.query.limit != null ? Number(req.query.limit) : 30;
      const data = await cuponesService.listCanjes(id, limitRaw);
      res.json({ success: true, data });
    } catch (error) {
      logServerError('CuponesController.listCanjes', error);
      res.status(statusFor(error)).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudieron listar los canjes.'),
      });
    }
  }

  /** Público: valida cupón para un subtotal de productos. */
  async validate(req: Request, res: Response): Promise<void> {
    try {
      const parsed = validateCuponBodySchema.parse(req.body);
      const result = await cuponesService.validatePublic(parsed.codigo, parsed.subtotal);
      res.json({
        success: true,
        data: {
          valid: result.valid,
          message: result.message,
          monto_descuento: result.valid ? result.monto_descuento : undefined,
          codigo: result.valid ? result.codigo : undefined,
        },
      });
    } catch (error) {
      logServerError('CuponesController.validate', error);
      res.status(statusFor(error)).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudo validar el cupón.'),
      });
    }
  }
}

export const cuponesController = new CuponesController();
