/**
 * Rutas para gestión de facturas
 * 
 * TODAS las rutas requieren autenticación de administrador
 */

import { Router } from 'express';
import facturasController from '../controllers/facturas.controller';
import { verifyFirebaseToken, loadUserFromDatabase, requireRole } from '../middlewares/auth.middleware';
import { adminRateLimiter, syncRateLimiter } from '../middlewares/rate-limit.middleware';

const facturasRoutes = Router();

// Middleware de autenticación para todas las rutas de facturas
const adminAuth = [
    verifyFirebaseToken,
    loadUserFromDatabase,
    requireRole('ADMIN'),
];

// Sincronización manual (rate limiting especial + auth admin)
facturasRoutes.post('/sync', adminAuth, syncRateLimiter, facturasController.syncFacturas.bind(facturasController));

// Consulta de ventas pendientes (auth admin)
facturasRoutes.get('/pendientes', adminAuth, adminRateLimiter, facturasController.getVentasPendientes.bind(facturasController));

// Estadísticas (auth admin)
facturasRoutes.get('/estadisticas', adminAuth, adminRateLimiter, facturasController.getEstadisticas.bind(facturasController));

// Debug (diagnóstico) - Solo admin
facturasRoutes.get('/debug', adminAuth, adminRateLimiter, facturasController.debugFacturas.bind(facturasController));

export default facturasRoutes;
