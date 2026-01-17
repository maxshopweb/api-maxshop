import { Router } from 'express';
import { DireccionesController } from '../controllers/direcciones.controller';
import { loadUserFromDatabase } from '../middlewares/auth.middleware';

const router = Router();
const controller = new DireccionesController();

// Todas las rutas requieren autenticación
router.use(loadUserFromDatabase);

router.get('/', controller.getByUsuario.bind(controller));
router.post('/', controller.create.bind(controller));
router.put('/:id', controller.update.bind(controller));
router.delete('/:id', controller.delete.bind(controller));
router.patch('/:id/principal', controller.setPrincipal.bind(controller));

export default router;

