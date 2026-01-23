import { Router } from 'express';
import sincronizacionController from '../controllers/sincronizacion.controller';
// TODO: Agregar middleware de autenticación cuando esté listo
// import { verifyFirebaseToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

/**
 * POST /api/sincronizacion/completa
 * Sincronización completa: Descarga FTP → Convierte DBF → Importa CSV → BD
 * 
 * Body: (opcional)
 * {
 *   force?: boolean  // Forzar ejecución aunque haya errores
 * }
 */
router.post('/completa', sincronizacionController.sincronizarCompleto.bind(sincronizacionController));

/**
 * POST /api/sincronizacion/importar
 * Solo importa CSV a BD (asume CSV ya generados en backend/data/csv)
 * 
 * Body: (opcional)
 * {
 *   csvDir?: string  // Directorio de CSV (default: backend/data/csv)
 * }
 */
router.post('/importar', sincronizacionController.importarCSV.bind(sincronizacionController));

/**
 * GET /api/sincronizacion/estado
 * Obtiene el estado de la última sincronización
 */
router.get('/estado', sincronizacionController.obtenerEstado.bind(sincronizacionController));

export default router;
