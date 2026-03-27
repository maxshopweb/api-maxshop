import { Router } from 'express';
import { CategoriasController } from '../controllers/categorias.controller';
import {
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole,
} from '../middlewares/auth.middleware';

const router = Router();
const categoriasController = new CategoriasController();

const adminAuth = [
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];

// ========================================
// RUTAS PARA CATEGORÍAS
// ========================================

router.get('/', categoriasController.getAllCategorias.bind(categoriasController));
router.get('/siguiente-codigo', categoriasController.getSiguienteCodigo.bind(categoriasController));
router.get('/codigo/:codigo', categoriasController.getCategoriaByCodigo.bind(categoriasController));
router.get('/:id', categoriasController.getCategoriaById.bind(categoriasController));
router.post('/', adminAuth, categoriasController.createCategoria.bind(categoriasController));
router.put('/:id', adminAuth, categoriasController.updateCategoria.bind(categoriasController));
router.delete('/:id', adminAuth, categoriasController.deleteCategoria.bind(categoriasController));

export default router;
