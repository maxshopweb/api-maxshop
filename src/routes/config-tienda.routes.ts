import { Router } from 'express';
import { ConfigTiendaController } from '../controllers/config-tienda.controller';
import {
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole,
} from '../middlewares/auth.middleware';

const router = Router();
const controller = new ConfigTiendaController();

// GET público (sin auth) – para banner, beneficios, etc.
router.get('/', controller.getConfig.bind(controller));

// PUT solo admin
const adminMiddleware = [
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];
router.put('/', ...adminMiddleware, controller.updateConfig.bind(controller));

export default router;
