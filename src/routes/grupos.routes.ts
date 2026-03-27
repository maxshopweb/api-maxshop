import { Router } from 'express';
import { GruposController } from '../controllers/grupos.controller';
import {
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole,
} from '../middlewares/auth.middleware';

const router = Router();
const gruposController = new GruposController();

const adminAuth = [
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];

router.get('/', gruposController.getAll.bind(gruposController));
router.get('/siguiente-codigo', gruposController.getSiguienteCodigo.bind(gruposController));
router.get('/codigo/:codigo', gruposController.getByCodigo.bind(gruposController));
router.get('/:id', gruposController.getById.bind(gruposController));
router.post('/', adminAuth, gruposController.create.bind(gruposController));
router.put('/:id', adminAuth, gruposController.update.bind(gruposController));
router.delete('/:id', adminAuth, gruposController.delete.bind(gruposController));

export default router;

