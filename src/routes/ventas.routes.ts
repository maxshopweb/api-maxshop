import { Router } from 'express';
import { VentasController } from '../controllers/ventas.controller';

const router = Router();
const ventasController = new VentasController();

// Rutas CRUD generales
router.get('/', ventasController.getAll.bind(ventasController));
router.get('/:id', ventasController.getById.bind(ventasController));
router.post('/', ventasController.create.bind(ventasController));
router.put('/:id', ventasController.update.bind(ventasController));
router.delete('/:id', ventasController.delete.bind(ventasController));

// Rutas para actualizar estados
router.patch('/:id/estado-pago', ventasController.updateEstadoPago.bind(ventasController));
router.patch('/:id/estado-envio', ventasController.updateEstadoEnvio.bind(ventasController));

export default router;

