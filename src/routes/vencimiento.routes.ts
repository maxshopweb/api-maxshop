import { Router } from 'express';
import { expirarVentas, aprobarDesdeVencido } from '../controllers/vencimiento.controller';
import {
  verifyFirebaseToken,
  loadUserFromDatabase,
  requireRole,
} from '../middlewares/auth.middleware';
import { adminRateLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();
const adminAuth = [
  adminRateLimiter,
  verifyFirebaseToken,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];

router.post('/expirar', ...adminAuth, expirarVentas);
router.post('/:id/aprobar-desde-vencido', ...adminAuth, aprobarDesdeVencido);

export default router;
