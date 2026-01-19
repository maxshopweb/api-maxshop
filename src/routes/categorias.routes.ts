import { Router } from 'express';
import { CategoriasController } from '../controllers/categorias.controller';

const router = Router();
const categoriasController = new CategoriasController();

// ========================================
// RUTAS PARA CATEGORÍAS
// ========================================

router.get('/', categoriasController.getAllCategorias.bind(categoriasController));
router.get('/codigo/:codigo', categoriasController.getCategoriaByCodigo.bind(categoriasController));
router.get('/:id', categoriasController.getCategoriaById.bind(categoriasController));
router.post('/', categoriasController.createCategoria.bind(categoriasController));
router.put('/:id', categoriasController.updateCategoria.bind(categoriasController));
router.delete('/:id', categoriasController.deleteCategoria.bind(categoriasController));

export default router;
