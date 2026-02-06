/**
 * Rutas de subida de imágenes (productos y banners).
 * Requieren autenticación y rol ADMIN. Multer en memoria para validar tipo por magic bytes en el servicio.
 */

import { Router } from 'express';
import multer from 'multer';
import uploadController from '../controllers/upload.controller';
import { verifyFirebaseToken, loadUserFromDatabase, requireRole } from '../middlewares/auth.middleware';
import {
  UPLOAD_MAX_FILE_SIZE,
  UPLOAD_FIELD_NAME,
} from '../config/upload.config';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_FILE_SIZE },
});

const adminAuth = [
  verifyFirebaseToken,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];

/** POST /upload/productos/:id — Imagen principal del producto (actualiza producto.img_principal). */
router.post(
  '/productos/:id',
  adminAuth,
  upload.single(UPLOAD_FIELD_NAME),
  uploadController.uploadProductImage.bind(uploadController)
);

/** POST /upload/productos/:id/imagenes — Imagen secundaria (appendea a producto.imagenes). */
router.post(
  '/productos/:id/imagenes',
  adminAuth,
  upload.single(UPLOAD_FIELD_NAME),
  uploadController.uploadProductSecondaryImage.bind(uploadController)
);

/** POST /upload/banners — Banner (banner-1, banner-2, ...). */
router.post(
  '/banners',
  adminAuth,
  upload.single(UPLOAD_FIELD_NAME),
  uploadController.uploadBanner.bind(uploadController)
);

export default router;
