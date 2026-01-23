import { Router } from 'express';
import { LocationController } from '../controllers/location.controller';

const router = Router();
const controller = new LocationController();

/**
 * Rutas de ubicación/geocodificación
 * 
 * Estas rutas son PÚBLICAS (no requieren autenticación)
 * para permitir que usuarios invitados busquen direcciones
 * durante el checkout.
 */

// GET /api/location/search?q=...&limit=5&country=ar
router.get('/search', controller.search.bind(controller));

// POST /api/location/reverse
// Body: { lat: number, lng: number, country?: string }
router.post('/reverse', controller.reverse.bind(controller));

export default router;
