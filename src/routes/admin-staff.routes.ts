import { Router } from 'express';
import { adminStaffController } from '../controllers/admin-staff.controller';
import {
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole
} from '../middlewares/auth.middleware';
import { adminRateLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();

const adminMiddleware = [
  adminRateLimiter,
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole('ADMIN')
];

router.get('/', ...adminMiddleware, (req, res) => adminStaffController.list(req, res));
router.post('/', ...adminMiddleware, (req, res) => adminStaffController.create(req, res));
router.patch('/:idUsuario/active', ...adminMiddleware, (req, res) =>
  adminStaffController.setActive(req, res)
);
router.post('/:idUsuario/reset-password', ...adminMiddleware, (req, res) =>
  adminStaffController.resetPassword(req, res)
);
router.get('/:idUsuario', ...adminMiddleware, (req, res) =>
  adminStaffController.getById(req, res)
);
router.patch('/:idUsuario', ...adminMiddleware, (req, res) =>
  adminStaffController.update(req, res)
);

export default router;
