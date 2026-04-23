import { Router } from 'express';
import { z } from 'zod';
import { VentasController } from '../controllers/ventas.controller';
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

const checkoutBodySchema = z.object({
    id_cliente: z.string().trim().min(1).max(128).optional(),
    metodo_pago: z.string().trim().min(2).max(32),
    observaciones: z.string().trim().max(500).optional(),
    costo_envio: z.number().finite().min(0).max(2_000_000).optional(),
    id_direccion: z.string().trim().min(1).max(128).optional(),
    tipo_documento: z.string().trim().min(2).max(32).optional(),
    numero_documento: z.string().trim().min(3).max(32).optional(),
    direccion: z.object({
        direccion: z.string().trim().max(200).optional(),
        altura: z.string().trim().max(20).optional(),
        piso: z.string().trim().max(10).optional(),
        dpto: z.string().trim().max(10).optional(),
        ciudad: z.string().trim().max(80).optional(),
        provincia: z.string().trim().max(80).optional(),
        cod_postal: z.number().int().min(0).max(100000).nullable().optional(),
        telefono: z.string().trim().max(30).optional(),
    }).optional(),
    detalles: z.array(z.object({
        id_prod: z.number().int().positive(),
        cantidad: z.number().int().positive().max(1000),
        precio_unitario: z.number().finite().min(0).max(100_000_000).optional(),
        descuento_aplicado: z.number().finite().min(0).max(100_000_000).optional(),
        bonificacion_porcentaje: z.number().finite().min(0).max(100).optional(),
    })).min(1).max(200),
}).strict();

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
router.get('/:id', ...adminAuth, ventasController.getById.bind(ventasController));
router.post('/', ...adminAuth, ventasController.create.bind(ventasController));
router.put('/:id', ...adminAuth, ventasController.update.bind(ventasController));
router.delete('/:id', ...adminAuth, ventasController.delete.bind(ventasController));

// Rutas para actualizar estados y envío (solo admin)
router.patch('/:id/estado-pago', ...adminAuth, ventasController.updateEstadoPago.bind(ventasController));
router.patch('/:id/estado-envio', ...adminAuth, ventasController.updateEstadoEnvio.bind(ventasController));
router.patch('/:id/envio', ...adminAuth, ventasController.updateEnvio.bind(ventasController));

export default router;

