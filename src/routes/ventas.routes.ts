import { Router } from 'express';
import { VentasController } from '../controllers/ventas.controller';
import { checkoutBodySchema } from '../schemas/checkout.schema';
import {
    verifyFirebaseToken,
    verifyFirebaseTokenOptional,
    requireAuthenticatedUser,
    loadUserFromDatabase,
    loadUserFromDatabaseOptional,
    requireRole,
} from '../middlewares/auth.middleware';
import { adminRateLimiter, authenticatedRateLimiter, checkoutRateLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();
const ventasController = new VentasController();
const adminAuth = [verifyFirebaseToken, requireAuthenticatedUser, loadUserFromDatabase, requireRole('ADMIN'), adminRateLimiter];

const validateCheckoutPayload = (req: any, res: any, next: any) => {
    const parsed = checkoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            error: 'Payload de checkout inválido',
            details: parsed.error.issues.map((issue) => issue.message),
        });
    }
    req.body = parsed.data;
    return next();
};

// Rutas específicas ANTES de las rutas con parámetros dinámicos
// Ruta para obtener pedidos del usuario autenticado (requiere autenticación)
router.get(
    '/mis-pedidos',
    authenticatedRateLimiter,
    verifyFirebaseToken,
    requireAuthenticatedUser,
    loadUserFromDatabase,
    ventasController.getMyPedidos.bind(ventasController)
);

// Ruta específica para crear pedidos desde checkout (invitado o usuario autenticado)
router.post(
    '/checkout',
    checkoutRateLimiter,
    verifyFirebaseTokenOptional,
    loadUserFromDatabaseOptional,
    validateCheckoutPayload,
    ventasController.createFromCheckout.bind(ventasController)
);

// Ruta para confirmar pago manual (solo admin)
router.post(
    '/:id/confirmar-pago',
    ...adminAuth,
    ventasController.confirmarPago.bind(ventasController)
);

// Rutas CRUD generales (solo admin)
router.get('/', ...adminAuth, ventasController.getAll.bind(ventasController));
router.get('/stats', ...adminAuth, ventasController.getStats.bind(ventasController));
router.get('/export', ...adminAuth, ventasController.exportVentas.bind(ventasController));
router.post('/export-excel', ...adminAuth, ventasController.exportVentasExcel.bind(ventasController));
router.get('/excel-ftp', ...adminAuth, ventasController.downloadVentasExcelFtp.bind(ventasController));
router.get('/:id', ...adminAuth, ventasController.getById.bind(ventasController));
router.post('/', ...adminAuth, ventasController.create.bind(ventasController));
router.put('/:id', ...adminAuth, ventasController.update.bind(ventasController));
router.delete('/:id', ...adminAuth, ventasController.delete.bind(ventasController));

// Rutas para actualizar estados y envío (solo admin)
router.patch('/:id/estado-pago', ...adminAuth, ventasController.updateEstadoPago.bind(ventasController));
router.patch('/:id/estado-envio', ...adminAuth, ventasController.updateEstadoEnvio.bind(ventasController));
router.patch('/:id/envio', ...adminAuth, ventasController.updateEnvio.bind(ventasController));

export default router;

