/**
 * Rutas para webhooks externos
 * 
 * Endpoints públicos (sin autenticación - los llama MP):
 * - POST /api/webhooks/mercadopago - Recibe webhooks de Mercado Pago
 * - GET  /api/webhooks/mercadopago/health - Health check
 * 
 * Endpoints protegidos (requieren autenticación admin):
 * - POST /api/webhooks/mercadopago/manual/:paymentId - Procesa pago manualmente
 * - GET  /api/webhooks/mercadopago/stats - Estadísticas
 * - GET  /api/webhooks/mercadopago/failed - Lista webhooks fallidos
 * - POST /api/webhooks/mercadopago/retry/:webhookId - Reintenta webhook
 * - POST /api/webhooks/mercadopago/reset/:webhookId - Resetea webhook
 * 
 * @author MaxShop
 */

import { Router } from 'express';
import { paymentWebhookController } from '../controllers/payment-webhook.controller';
import { validateMercadoPagoSignature, validateWebhookTimestamp } from '../middlewares/webhook-signature.middleware';
import { verifyFirebaseToken, loadUserFromDatabase, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// Middleware de autenticación para rutas admin
const adminAuth = [verifyFirebaseToken, loadUserFromDatabase, requireRole('ADMIN')];

// ============================================
// ENDPOINTS PÚBLICOS (sin autenticación)
// ============================================

/**
 * Webhook de Mercado Pago
 * POST /api/webhooks/mercadopago
 * 
 * Este endpoint es llamado por Mercado Pago cuando hay eventos de pago.
 * No requiere autenticación de nuestra app, pero valida la firma de MP.
 * 
 * Middlewares:
 * 1. validateWebhookTimestamp - Verifica que el webhook no sea muy antiguo (5 min)
 * 2. validateMercadoPagoSignature - Valida la firma HMAC-SHA256
 * 
 * NOTA: En sandbox, los webhooks merchant_order pueden tener validación relajada
 */
router.post(
    '/mercadopago',
    validateWebhookTimestamp(300), // 5 minutos de tolerancia
    validateMercadoPagoSignature({ 
        logDetails: process.env.NODE_ENV !== 'production',
        skipValidation: false, // No saltar, pero el middleware maneja merchant_order en sandbox
    }),
    (req, res) => paymentWebhookController.handleWebhook(req, res)
);

/**
 * Health check del servicio de webhooks
 * GET /api/webhooks/mercadopago/health
 * 
 * Endpoint público para monitoreo (ej: desde MP o sistemas de uptime)
 */
router.get(
    '/mercadopago/health',
    (req, res) => paymentWebhookController.healthCheck(req, res)
);

/**
 * Obtiene información del usuario de prueba (solo desarrollo)
 * GET /api/webhooks/mercadopago/test-user-info
 * 
 * Útil para obtener el email del usuario de prueba y configurarlo
 */
router.get(
    '/mercadopago/test-user-info',
    (req, res) => paymentWebhookController.getTestUserInfo(req, res)
);

/**
 * Diagnóstico de preferencia/pago
 * GET /api/webhooks/mercadopago/diagnose/:preferenceId
 * 
 * Útil para diagnosticar por qué un pago falló
 * No requiere autenticación (público para debugging)
 */
router.get(
    '/mercadopago/diagnose/:preferenceId',
    (req, res) => paymentWebhookController.diagnosePreference(req, res)
);

// ============================================
// ENDPOINTS PROTEGIDOS (requieren admin)
// ============================================

/**
 * Procesa un pago manualmente
 * POST /api/webhooks/mercadopago/manual/:paymentId
 * 
 * Útil para:
 * - Reprocesar pagos que fallaron
 * - Testing
 * - Sincronizar pagos que no llegaron por webhook
 */
router.post(
    '/mercadopago/manual/:paymentId',
    ...adminAuth,
    (req, res) => paymentWebhookController.processManualPayment(req, res)
);

/**
 * Estadísticas de webhooks
 * GET /api/webhooks/mercadopago/stats
 */
router.get(
    '/mercadopago/stats',
    ...adminAuth,
    (req, res) => paymentWebhookController.getStats(req, res)
);

/**
 * Lista webhooks fallidos
 * GET /api/webhooks/mercadopago/failed
 * 
 * Query params:
 * - status: 'pending' | 'failed' (opcional, default: todos)
 */
router.get(
    '/mercadopago/failed',
    ...adminAuth,
    (req, res) => paymentWebhookController.getFailedWebhooks(req, res)
);

/**
 * Reintenta un webhook específico
 * POST /api/webhooks/mercadopago/retry/:webhookId
 */
router.post(
    '/mercadopago/retry/:webhookId',
    ...adminAuth,
    (req, res) => paymentWebhookController.retryWebhook(req, res)
);

/**
 * Resetea un webhook para permitir nuevos intentos
 * POST /api/webhooks/mercadopago/reset/:webhookId
 */
router.post(
    '/mercadopago/reset/:webhookId',
    ...adminAuth,
    (req, res) => paymentWebhookController.resetWebhook(req, res)
);

export default router;
