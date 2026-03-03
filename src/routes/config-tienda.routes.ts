import { Router } from 'express';
import { ConfigTiendaController } from '../controllers/config-tienda.controller';
import {
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole,
} from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { configTiendaUpdateValidators } from '../validators/config-tienda.validator';

const router = Router();
const controller = new ConfigTiendaController();

// GET público – config completa (reglas + datos_bancarios). Usado por admin y por resultado checkout.
router.get('/', controller.getConfig.bind(controller));

const adminMiddleware = [
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];
router.put(
  '/',
  ...adminMiddleware,
  configTiendaUpdateValidators(),
  handleValidationErrors,
  controller.updateConfig.bind(controller)
);

export default router;
