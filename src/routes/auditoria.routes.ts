import { Router } from 'express';
import { AuditoriaController } from '../controllers/auditoria.controller';
import {
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole,
} from '../middlewares/auth.middleware';
import { adminRateLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();
const controller = new AuditoriaController();

const adminMiddleware = [
  adminRateLimiter,
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];

router.get('/', ...adminMiddleware, controller.getLogs.bind(controller));

export default router;
