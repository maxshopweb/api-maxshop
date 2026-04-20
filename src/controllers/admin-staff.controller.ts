import '../types/express';
import { Request, Response } from 'express';
import { z } from 'zod';
import { adminStaffService } from '../services/admin-staff.service';
import {
  createStaffUserSchema,
  updateStaffUserSchema,
  listStaffQuerySchema
} from '../types/admin-staff.type';
import { logServerError, toPublicErrorMessage } from '../utils/publicError';
import { asSingleString } from '../utils/validation.utils';

/** Express puede devolver string[] en query; normalizamos a un valor por clave. */
function normalizeQueryParams(query: Request['query']): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

function httpStatusForError(error: unknown): number {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: string }).code);
    if (code === 'NOT_FOUND') return 404;
    if (code === 'RATE_LIMIT_TARGET' || code === 'RATE_LIMIT_ACTOR') return 429;
  }
  return 400;
}

function getActorId(req: Request): string | null {
  return req.authenticatedUser?.id ?? null;
}

export class AdminStaffController {
  async list(req: Request, res: Response): Promise<void> {
    const actorUserId = getActorId(req);
    if (!actorUserId) {
      res.status(401).json({ success: false, error: 'No autenticado.' });
      return;
    }
    try {
      const query = listStaffQuerySchema.parse(normalizeQueryParams(req.query));
      const result = await adminStaffService.listStaff(query, { actorUserId });
      res.json({ success: true, data: result });
    } catch (error) {
      logServerError('AdminStaffController.list', error);
      res.status(400).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudo listar el personal.')
      });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    const actorUserId = getActorId(req);
    if (!actorUserId) {
      res.status(401).json({ success: false, error: 'No autenticado.' });
      return;
    }
    try {
      const idUsuario = asSingleString(req.params.idUsuario);
      if (!idUsuario) {
        res.status(400).json({ success: false, error: 'Falta el id de usuario.' });
        return;
      }
      const data = await adminStaffService.getStaffById(idUsuario, { actorUserId });
      res.json({ success: true, data });
    } catch (error) {
      logServerError('AdminStaffController.getById', error);
      const status = httpStatusForError(error);
      res.status(status).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudo obtener el usuario.')
      });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    const actorUserId = getActorId(req);
    if (!actorUserId) {
      res.status(401).json({ success: false, error: 'No autenticado.' });
      return;
    }
    try {
      const body = createStaffUserSchema.parse(req.body);
      const result = await adminStaffService.createStaffUser({
        ...body,
        actorUserId,
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        endpoint: req.originalUrl ?? null
      });
      res.status(201).json({
        success: true,
        data: result,
        message:
          'Usuario creado. La contraseña solo se muestra en esta respuesta: guardala o copiála ahora.'
      });
    } catch (error) {
      logServerError('AdminStaffController.create', error);
      res.status(400).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudo crear el usuario.')
      });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    const actorUserId = getActorId(req);
    if (!actorUserId) {
      res.status(401).json({ success: false, error: 'No autenticado.' });
      return;
    }
    try {
      const idUsuario = asSingleString(req.params.idUsuario);
      if (!idUsuario) {
        res.status(400).json({ success: false, error: 'Falta el id de usuario.' });
        return;
      }
      const body = updateStaffUserSchema.parse(req.body);
      const data = await adminStaffService.updateStaffUser(idUsuario, {
        ...body,
        actorUserId,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        endpoint: req.originalUrl ?? null
      });
      res.json({ success: true, data, message: 'Usuario actualizado.' });
    } catch (error) {
      logServerError('AdminStaffController.update', error);
      const status = httpStatusForError(error);
      res.status(status).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudo actualizar el usuario.')
      });
    }
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    const actorUserId = getActorId(req);
    if (!actorUserId) {
      res.status(401).json({ success: false, error: 'No autenticado.' });
      return;
    }
    try {
      const idUsuario = asSingleString(req.params.idUsuario);
      if (!idUsuario) {
        res.status(400).json({ success: false, error: 'Falta el id de usuario.' });
        return;
      }
      const data = await adminStaffService.resetStaffPassword(idUsuario, {
        actorUserId,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        endpoint: req.originalUrl ?? null
      });
      res.json({
        success: true,
        data,
        message:
          'Contraseña reiniciada. Solo se muestra en esta respuesta: copiála ahora o comunicala por un canal seguro.'
      });
    } catch (error) {
      logServerError('AdminStaffController.resetPassword', error);
      const status = httpStatusForError(error);
      res.status(status).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudo reiniciar la contraseña.')
      });
    }
  }

  async setActive(req: Request, res: Response): Promise<void> {
    const actorUserId = getActorId(req);
    if (!actorUserId) {
      res.status(401).json({ success: false, error: 'No autenticado.' });
      return;
    }
    try {
      const idUsuario = asSingleString(req.params.idUsuario);
      if (!idUsuario) {
        res.status(400).json({ success: false, error: 'Falta el id de usuario.' });
        return;
      }
      const body = z
        .object({ activo: z.boolean() })
        .parse(req.body);
      const data = await adminStaffService.setStaffActive(idUsuario, body.activo, {
        actorUserId,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        endpoint: req.originalUrl ?? null
      });
      res.json({
        success: true,
        data,
        message: body.activo ? 'Usuario reactivado.' : 'Usuario dado de baja (inactivo).'
      });
    } catch (error) {
      logServerError('AdminStaffController.setActive', error);
      const status = httpStatusForError(error);
      res.status(status).json({
        success: false,
        error: toPublicErrorMessage(error, 'No se pudo actualizar el estado.')
      });
    }
  }
}

export const adminStaffController = new AdminStaffController();
