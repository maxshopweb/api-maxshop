/**
 * Controlador de subida de imágenes (productos y banners).
 * Delega validación y persistencia al UploadService y devuelve el path relativo para que el front concatene con FILES_BASE_URL.
 */

import { Request, Response } from 'express';
import { uploadService } from '../services/upload.service';
import { FILES_BASE_URL } from '../config/upload.config';

const uploadController = {
  /**
   * POST /upload/productos/:id
   * Sube la imagen principal del producto. Actualiza producto.img_principal y devuelve path.
   */
  async uploadProductImage(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No se envió ninguna imagen. Use el campo "image".',
        });
        return;
      }
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'ID de producto inválido.' });
        return;
      }
      const userId = req.authenticatedUser?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        return;
      }

      const { path: relativePath } = await uploadService.uploadProductImage(id, req.file, userId);

      res.json({
        success: true,
        path: relativePath,
        url: `${FILES_BASE_URL}/${relativePath}`,
      });
    } catch (error: any) {
      const status = error?.statusCode ?? 500;
      const message = error?.message ?? 'Error al subir la imagen del producto.';
      res.status(status).json({ success: false, error: message });
    }
  },

  /**
   * POST /upload/productos/:id/imagenes
   * Sube una imagen secundaria. La guarda como [id]_2, [id]_3, ... y la appendea a producto.imagenes.
   */
  async uploadProductSecondaryImage(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No se envió ninguna imagen. Use el campo "image".',
        });
        return;
      }
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'ID de producto inválido.' });
        return;
      }
      const userId = req.authenticatedUser?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        return;
      }

      const { path: relativePath } = await uploadService.uploadProductSecondaryImage(
        id,
        req.file,
        userId
      );

      res.json({
        success: true,
        path: relativePath,
        url: `${FILES_BASE_URL}/${relativePath}`,
      });
    } catch (error: any) {
      const status = error?.statusCode ?? 500;
      const message = error?.message ?? 'Error al subir la imagen secundaria.';
      res.status(status).json({ success: false, error: message });
    }
  },

  /**
   * POST /upload/banners
   * Sube un banner (banner-1, banner-2, ...). Devuelve path para asociar desde el front o eventos.
   */
  async uploadBanner(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No se envió ninguna imagen. Use el campo "image".',
        });
        return;
      }
      const userId = req.authenticatedUser?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        return;
      }

      const { path: relativePath } = await uploadService.uploadBanner(req.file, userId);

      res.json({
        success: true,
        path: relativePath,
        url: `${FILES_BASE_URL}/${relativePath}`,
      });
    } catch (error: any) {
      const status = error?.statusCode ?? 500;
      const message = error?.message ?? 'Error al subir el banner.';
      res.status(status).json({ success: false, error: message });
    }
  },
};

export default uploadController;
