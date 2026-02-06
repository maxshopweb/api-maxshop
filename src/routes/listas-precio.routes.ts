import { Router } from 'express';
import { ListasPrecioController } from '../controllers/listas-precio.controller';

const router = Router();
const listasPrecioController = new ListasPrecioController();

router.get('/', listasPrecioController.getAll.bind(listasPrecioController));
router.get('/codigo/:codigo', listasPrecioController.getByCodigo.bind(listasPrecioController));
router.get('/:id', listasPrecioController.getById.bind(listasPrecioController));

export default router;
