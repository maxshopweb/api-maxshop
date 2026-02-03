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
 * { force?: boolean }
 */
router.post('/completa', sincronizacionController.sincronizarCompleto.bind(sincronizacionController));

/**
 * POST /api/sincronizacion/actualizar-catalogo
 * Actualiza todo el catálogo desde el FTP (mismo flujo que /completa).
 * Uso: manual desde admin o llamado por cron cada X minutos.
 */
router.post('/actualizar-catalogo', sincronizacionController.sincronizarCompleto.bind(sincronizacionController));

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
