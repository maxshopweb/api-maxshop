/**
 * Rutas para gestión de facturas
 *
 * TODAS las rutas requieren autenticación de administrador
 */

import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import facturasController from '../controllers/facturas.controller';
import { verifyFirebaseToken, loadUserFromDatabase, requireRole } from '../middlewares/auth.middleware';
import { adminRateLimiter, syncRateLimiter } from '../middlewares/rate-limit.middleware';

const facturasRoutes = Router();

const FACTURA_TEMP_DIR = (() => {
    const cwd = process.cwd();
    if (cwd.endsWith('backend')) {
        return path.join(cwd, 'data', 'temp', 'facturas');
    }
    return path.join(cwd, 'backend', 'data', 'temp', 'facturas');
})();

const uploadFactura = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            if (!fs.existsSync(FACTURA_TEMP_DIR)) {
                fs.mkdirSync(FACTURA_TEMP_DIR, { recursive: true });
            }
            cb(null, FACTURA_TEMP_DIR);
        },
        filename: (_req, file, cb) => {
            const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            cb(null, `manual_${unique}${path.extname(file.originalname) || '.pdf'}`);
        },
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const isPdf =
            file.mimetype === 'application/pdf' ||
            file.originalname.toLowerCase().endsWith('.pdf');
        cb(null, isPdf);
    },
});

// Middleware de autenticación para todas las rutas de facturas
const adminAuth = [
    verifyFirebaseToken,
    loadUserFromDatabase,
    requireRole('ADMIN'),
];

// Sincronización manual (rate limiting especial + auth admin)
facturasRoutes.post('/sync', adminAuth, syncRateLimiter, facturasController.syncFacturas.bind(facturasController));

// Envío manual de factura PDF (admin sube archivo)
facturasRoutes.post(
    '/:ventaId/enviar-manual',
    adminAuth,
    adminRateLimiter,
    uploadFactura.single('factura'),
    facturasController.enviarManual.bind(facturasController)
);

// Consulta de ventas pendientes (auth admin)
facturasRoutes.get('/pendientes', adminAuth, adminRateLimiter, facturasController.getVentasPendientes.bind(facturasController));

// Estadísticas (auth admin)
facturasRoutes.get('/estadisticas', adminAuth, adminRateLimiter, facturasController.getEstadisticas.bind(facturasController));

// Debug (diagnóstico) - Solo admin
facturasRoutes.get('/debug', adminAuth, adminRateLimiter, facturasController.debugFacturas.bind(facturasController));

export default facturasRoutes;
