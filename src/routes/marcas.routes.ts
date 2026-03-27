import { Router } from 'express';
import { MarcasController } from '../controllers/marcas.controller';
import {
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole,
} from '../middlewares/auth.middleware';

const router = Router();
const marcasController = new MarcasController();

const adminAuth = [
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];

router.get('/', marcasController.getAll.bind(marcasController));
router.get('/siguiente-codigo', marcasController.getSiguienteCodigo.bind(marcasController));
router.get('/codigo/:codigo', marcasController.getByCodigo.bind(marcasController));
router.get('/:id', marcasController.getById.bind(marcasController));
router.post('/', adminAuth, marcasController.create.bind(marcasController));
router.put('/:id', adminAuth, marcasController.update.bind(marcasController));
router.delete('/:id', adminAuth, marcasController.delete.bind(marcasController));

export default router;
