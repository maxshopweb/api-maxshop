import { Router } from 'express';
import { DireccionesController } from '../controllers/direcciones.controller';
import { verifyFirebaseToken, loadUserFromDatabase } from '../middlewares/auth.middleware';

const router = Router();
const controller = new DireccionesController();

// Todas las rutas requieren autenticación
// Primero verificar el token de Firebase, luego cargar el usuario de la base de datos
router.use(verifyFirebaseToken, loadUserFromDatabase);

router.get('/', controller.getByUsuario.bind(controller));
router.post('/', controller.create.bind(controller));
router.put('/:id', controller.update.bind(controller));
router.delete('/:id', controller.delete.bind(controller));
router.patch('/:id/principal', controller.setPrincipal.bind(controller));

export default router;

