import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import {
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole,
} from '../middlewares/auth.middleware';

const router = Router();
const dashboardController = new DashboardController();

// Todos los endpoints requieren autenticación y rol ADMIN
const adminMiddleware = [
  verifyFirebaseToken,
  requireAuthenticatedUser,
  loadUserFromDatabase,
  requireRole('ADMIN'),
];

// 1. KPIs principales
router.get('/kpis', ...adminMiddleware, dashboardController.getKpis.bind(dashboardController));

// 2. Ventas en el tiempo
router.get(
  '/sales-over-time',
  ...adminMiddleware,
  dashboardController.getSalesOverTime.bind(dashboardController)
);

// 3. Estado de órdenes
router.get(
  '/order-status',
  ...adminMiddleware,
  dashboardController.getOrderStatus.bind(dashboardController)
);

// 4. Top productos
router.get('/top-products', ...adminMiddleware, dashboardController.getTopProducts.bind(dashboardController));

// 5. Ventas por categoría
router.get(
  '/sales-by-category',
  ...adminMiddleware,
  dashboardController.getSalesByCategory.bind(dashboardController)
);

// 6. Resumen de clientes
router.get(
  '/customers-summary',
  ...adminMiddleware,
  dashboardController.getCustomersSummary.bind(dashboardController)
);

// 7. Alertas operativas
router.get('/alerts', ...adminMiddleware, dashboardController.getAlerts.bind(dashboardController));

export default router;

