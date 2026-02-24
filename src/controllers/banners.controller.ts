/**
 * Controlador de banners.
 * Rutas públicas: GET /banners (solo activos con imagen).
 * Rutas admin: CRUD completo + upload de imagen + toggle activo.
 */

import { Request, Response } from 'express';
import { bannersService } from '../services/banners.service';
import { buildImageUrl } from '../config/upload.config';

function addUrl(banner: Record<string, unknown>) {
  return {
    ...banner,
    url: banner.path_img ? buildImageUrl(String(banner.path_img)) : null,
  };
}

export const bannersController = {
  /** GET /banners — Lista pública: solo activos con imagen, ordenados por posición. */
  async getPublic(req: Request, res: Response): Promise<void> {
    try {
      const tipo = typeof req.query.tipo === 'string' ? req.query.tipo : undefined;
      const data = (await bannersService.getPublicBanners(tipo)).map(addUrl);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /** GET /banners/admin — Lista admin: todos (activos e inactivos). */
  async getAdmin(req: Request, res: Response): Promise<void> {
    try {
      const tipo = typeof req.query.tipo === 'string' ? req.query.tipo : undefined;
      const data = (await bannersService.getAdminBanners(tipo)).map(addUrl);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /** POST /banners — Crea slot de banner sin imagen. Body: { orden, tipo, link? } */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authenticatedUser?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        return;
      }
      const { orden, tipo, link } = req.body as {
        orden?: unknown;
        tipo?: unknown;
        link?: unknown;
      };
      if (!orden || !tipo) {
        res.status(400).json({ success: false, error: '"orden" y "tipo" son requeridos.' });
        return;
      }
      const data = await bannersService.createBanner(
        { orden: Number(orden), tipo: String(tipo), link: link ? String(link) : undefined },
        userId
      );
      res.status(201).json({ success: true, data: addUrl(data as unknown as Record<string, unknown>) });
    } catch (error: any) {
      res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
    }
  },

  /** POST /banners/:id/imagen — Sube o reemplaza imagen del banner. Multer field "image". */
  async uploadImage(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No se envió imagen. Use el campo "image".' });
        return;
      }
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'ID de banner inválido.' });
        return;
      }
      const userId = req.authenticatedUser?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        return;
      }
      const data = await bannersService.uploadBannerImage(id, req.file, userId);
      res.json({ success: true, data: addUrl(data as unknown as Record<string, unknown>) });
    } catch (error: any) {
      res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
    }
  },

  /** PATCH /banners/:id/activo — Activa o desactiva. Body: { activo: boolean } */
  async toggleActivo(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'ID de banner inválido.' });
        return;
      }
      const { activo } = req.body as { activo?: unknown };
      if (typeof activo !== 'boolean') {
        res.status(400).json({ success: false, error: '"activo" debe ser un booleano.' });
        return;
      }
      const userId = req.authenticatedUser?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        return;
      }
      const data = await bannersService.toggleActivo(id, activo, userId);
      res.json({ success: true, data: addUrl(data as unknown as Record<string, unknown>) });
    } catch (error: any) {
      res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
    }
  },

  /** PATCH /banners/:id — Actualiza orden y/o link. Hace swap automático si el orden ya existe. */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'ID de banner inválido.' });
        return;
      }
      const userId = req.authenticatedUser?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        return;
      }
      const { orden, link } = req.body as { orden?: unknown; link?: unknown };
      const updateData: { orden?: number; link?: string } = {};
      if (orden !== undefined) updateData.orden = Number(orden);
      if (link !== undefined) updateData.link = String(link);

      const data = await bannersService.updateBanner(id, updateData, userId);
      res.json({ success: true, data: addUrl(data as unknown as Record<string, unknown>) });
    } catch (error: any) {
      res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
    }
  },

  /** DELETE /banners/:id — Elimina banner y su archivo en disco. */
  async remove(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'ID de banner inválido.' });
        return;
      }
      const userId = req.authenticatedUser?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        return;
      }
      await bannersService.deleteBanner(id, userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
    }
  },
};
