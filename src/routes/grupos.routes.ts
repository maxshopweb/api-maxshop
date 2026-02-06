import { Router } from 'express';
import { GruposController } from '../controllers/grupos.controller';

const router = Router();
const gruposController = new GruposController();

router.get('/', gruposController.getAll.bind(gruposController));
router.get('/siguiente-codigo', gruposController.getSiguienteCodigo.bind(gruposController));
router.get('/codigo/:codigo', gruposController.getByCodigo.bind(gruposController));
router.get('/:id', gruposController.getById.bind(gruposController));
router.post('/', gruposController.create.bind(gruposController));
router.put('/:id', gruposController.update.bind(gruposController));
router.delete('/:id', gruposController.delete.bind(gruposController));

export default router;

