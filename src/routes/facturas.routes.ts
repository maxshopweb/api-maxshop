/**
 * Rutas para gestión de facturas
 */

import { Router } from 'express';
import facturasController from '../controllers/facturas.controller';

const facturasRoutes = Router();

// Sincronización manual
facturasRoutes.post('/sync', facturasController.syncFacturas.bind(facturasController));

// Consulta de ventas pendientes
facturasRoutes.get('/pendientes', facturasController.getVentasPendientes.bind(facturasController));

// Estadísticas
facturasRoutes.get('/estadisticas', facturasController.getEstadisticas.bind(facturasController));

// Debug (diagnóstico)
facturasRoutes.get('/debug', facturasController.debugFacturas.bind(facturasController));

export default facturasRoutes;
