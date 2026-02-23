/**
 * Rutas de banners.
 * GET /banners          — público, solo activos con imagen.
 * GET /banners/admin    — admin, todos.
 * POST /banners         — admin, crear slot.
 * POST /banners/:id/imagen — admin, subir/reemplazar imagen (multer, límite 2 MB).
 * PATCH /banners/:id/activo — admin, activar/desactivar.
 * PATCH /banners/:id    — admin, actualizar orden o link.
 * DELETE /banners/:id   — admin, eliminar banner y archivo.
 */

import { Router } from 'express';
import multer from 'multer';
import { bannersController } from '../controllers/banners.controller';
import {
  verifyFirebaseToken,
  loadUserFromDatabase,
  requireRole,
} from '../middlewares/auth.middleware';
import {
  UPLOAD_BANNER_MAX_FILE_SIZE,
  UPLOAD_FIELD_NAME,
} from '../config/upload.config';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_BANNER_MAX_FILE_SIZE },
});

const adminAuth = [
  verifyFirebaseToken,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];

// Pública
router.get('/', bannersController.getPublic);

// Admin — la ruta /admin debe ir antes de /:id para no colisionar
router.get('/admin', ...adminAuth, bannersController.getAdmin);
router.post('/', ...adminAuth, bannersController.create);
router.post('/:id/imagen', ...adminAuth, upload.single(UPLOAD_FIELD_NAME), bannersController.uploadImage);
router.patch('/:id/activo', ...adminAuth, bannersController.toggleActivo);
router.patch('/:id', ...adminAuth, bannersController.update);
router.delete('/:id', ...adminAuth, bannersController.remove);

export default router;
