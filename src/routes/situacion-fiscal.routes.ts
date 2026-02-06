import { Router } from 'express';
import { SituacionFiscalController } from '../controllers/situacion-fiscal.controller';

const router = Router();
const situacionFiscalController = new SituacionFiscalController();

router.get('/', situacionFiscalController.getAll.bind(situacionFiscalController));
router.get('/codigo/:codigo', situacionFiscalController.getByCodigo.bind(situacionFiscalController));
router.get('/:id', situacionFiscalController.getById.bind(situacionFiscalController));

export default router;
