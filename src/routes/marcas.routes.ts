import { Router } from 'express';
import { MarcasController } from '../controllers/marcas.controller';

const router = Router();
const marcasController = new MarcasController();

router.get('/', marcasController.getAll.bind(marcasController));
router.get('/siguiente-codigo', marcasController.getSiguienteCodigo.bind(marcasController));
router.get('/codigo/:codigo', marcasController.getByCodigo.bind(marcasController));
router.get('/:id', marcasController.getById.bind(marcasController));
router.post('/', marcasController.create.bind(marcasController));
router.put('/:id', marcasController.update.bind(marcasController));
router.delete('/:id', marcasController.delete.bind(marcasController));

export default router;
