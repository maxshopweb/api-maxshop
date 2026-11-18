import { Router } from 'express';
import { cuponesController } from '../controllers/cupones.controller';
import {
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole,
} from '../middlewares/auth.middleware';
import { adminRateLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();

const adminMiddleware = [
  adminRateLimiter,
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];

// Público: validar cupón en checkout
router.post('/validar', (req, res) => cuponesController.validate(req, res));

// Admin
router.get('/', ...adminMiddleware, (req, res) => cuponesController.list(req, res));
router.post('/', ...adminMiddleware, (req, res) => cuponesController.create(req, res));
router.get('/:id/canjes', ...adminMiddleware, (req, res) =>
  cuponesController.listCanjes(req, res)
);
router.get('/:id', ...adminMiddleware, (req, res) => cuponesController.getById(req, res));
router.put('/:id', ...adminMiddleware, (req, res) => cuponesController.update(req, res));
router.patch('/:id/toggle', ...adminMiddleware, (req, res) =>
  cuponesController.toggle(req, res)
);

export default router;
