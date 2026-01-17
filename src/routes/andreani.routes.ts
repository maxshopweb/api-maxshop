/**
 * Rutas de Andreani
 * 
 * Define los endpoints para la integración con Andreani.
 * Separado en:
 * - Pre-envíos (órdenes de envío) - Requiere admin
 * - Envíos reales - Requiere admin
 * - Cotizaciones - Requiere solo autenticación
 * 
 * La cotización puede ser usada por usuarios autenticados,
 * las demás rutas requieren autenticación de administrador.
 */

import { Router } from 'express';
import { AndreaniController } from '../controllers/andreani.controller';
import { verifyFirebaseToken, requireAuthenticatedUser } from '../middlewares/auth.middleware';

const router = Router();
const andreaniController = new AndreaniController();

// ============================================
// COTIZACIONES (Solo requiere autenticación, no admin)
// ============================================

// POST: Cotizar envío - Disponible para usuarios autenticados
router.post(
    '/envios/cotizar',
    verifyFirebaseToken, // Solo autenticación, no requiere admin
    andreaniController.cotizarEnvio.bind(andreaniController)
);

// ============================================
// PRE-ENVÍOS Y ENVÍOS (Requieren admin)
// ============================================

// Todas las demás rutas requieren autenticación de administrador
router.use(verifyFirebaseToken);
router.use(requireAuthenticatedUser);

// PRE-ENVÍOS (Órdenes de envío)
// POST: Crear pre-envío
router.post(
    '/pre-envios',
    andreaniController.crearPreEnvio.bind(andreaniController)
);

// GET: Consultar pre-envío
router.get(
    '/pre-envios/:numeroDeEnvio',
    andreaniController.consultarPreEnvio.bind(andreaniController)
);

// ENVÍOS REALES
// GET: Consultar estado de envío real
router.get(
    '/envios/:numeroAndreani/estado',
    andreaniController.consultarEstadoEnvio.bind(andreaniController)
);

// GET: Obtener etiqueta de envío
router.get(
    '/envios/:agrupadorDeBultos/etiquetas',
    andreaniController.obtenerEtiqueta.bind(andreaniController)
);

// GET: Consultar trazas de envío
router.get(
    '/envios/:numeroAndreani/trazas',
    andreaniController.consultarTrazasEnvio.bind(andreaniController)
);

export default router;

