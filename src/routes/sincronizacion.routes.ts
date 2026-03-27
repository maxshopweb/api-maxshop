import { Router } from 'express';
import sincronizacionController from '../controllers/sincronizacion.controller';
import {
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole,
} from '../middlewares/auth.middleware';

const router = Router();

const adminAuth = [
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];

/**
 * POST /api/sincronizacion/completa
 * Sincronización completa: Descarga FTP → Convierte DBF → Importa CSV → BD
 *
 * Body (opcional):
 * - force_overwrite o force: true → resetea flags ERP en todos los productos y luego sync (requiere confirmacion)
 * - confirmacion: "FORZAR_SINCRONIZACION_ERP_TOTAL"
 */
router.post(
  '/completa',
  ...adminAuth,
  sincronizacionController.sincronizarCompleto.bind(sincronizacionController)
);

/**
 * POST /api/sincronizacion/actualizar-catalogo
 * Igual que /completa (cron o admin).
 */
router.post(
  '/actualizar-catalogo',
  ...adminAuth,
  sincronizacionController.sincronizarCompleto.bind(sincronizacionController)
);

/**
 * POST /api/sincronizacion/importar
 * Solo importa CSV a BD (CSV en backend/data/csv salvo csvDir en body).
 * Mismas opciones force_overwrite + confirmacion que /completa.
 */
router.post(
  '/importar',
  ...adminAuth,
  sincronizacionController.importarCSV.bind(sincronizacionController)
);

/**
 * GET /api/sincronizacion/estado
 * Placeholder + ejemplo de body para force_overwrite (público para documentación rápida).
 */
router.get('/estado', sincronizacionController.obtenerEstado.bind(sincronizacionController));

export default router;
