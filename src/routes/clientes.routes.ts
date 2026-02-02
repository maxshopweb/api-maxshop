import { Router } from 'express';
import { clientesController } from '../controllers/clientes.controller';
import { 
    verifyFirebaseToken, 
    requireAuthenticatedUser, 
    loadUserFromDatabase 
} from '../middlewares/auth.middleware';
import { cacheMiddleware } from '../middlewares/cache.middleware';
import { authenticatedRateLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();

// Middleware de autenticación para todas las rutas
router.use(authenticatedRateLimiter, verifyFirebaseToken, requireAuthenticatedUser, loadUserFromDatabase);

// Rutas
router.get('/', cacheMiddleware(1800), clientesController.getAll.bind(clientesController));
router.get('/:id', cacheMiddleware(3600), clientesController.getById.bind(clientesController));
router.get('/:id/stats', cacheMiddleware(600), clientesController.getStats.bind(clientesController));
router.get('/:id/ventas', cacheMiddleware(1800), clientesController.getVentas.bind(clientesController));

export default router;

