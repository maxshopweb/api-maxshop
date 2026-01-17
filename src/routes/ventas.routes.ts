import { Router } from 'express';
import { VentasController } from '../controllers/ventas.controller';
import { verifyFirebaseToken, requireAuthenticatedUser, loadUserFromDatabase } from '../middlewares/auth.middleware';

const router = Router();
const ventasController = new VentasController();

// Rutas específicas ANTES de las rutas con parámetros dinámicos
// Ruta para obtener pedidos del usuario autenticado (requiere autenticación)
router.get(
    '/mis-pedidos',
    verifyFirebaseToken,
    requireAuthenticatedUser,
    loadUserFromDatabase,
    ventasController.getMyPedidos.bind(ventasController)
);

// Ruta específica para crear pedidos desde checkout (requiere autenticación)
router.post(
    '/checkout',
    verifyFirebaseToken,
    requireAuthenticatedUser,
    loadUserFromDatabase,
    ventasController.createFromCheckout.bind(ventasController)
);

// Ruta para confirmar pago manual (requiere autenticación)
router.post(
    '/:id/confirmar-pago',
    verifyFirebaseToken,
    requireAuthenticatedUser,
    loadUserFromDatabase,
    // TODO: Agregar middleware de autorización para admin si lo tienes
    ventasController.confirmarPago.bind(ventasController)
);

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

