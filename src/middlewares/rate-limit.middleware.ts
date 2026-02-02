/**
 * Middleware de Rate Limiting
 * 
 * Implementa límites de velocidad para proteger contra:
 * - DDoS attacks
 * - Brute force attacks
 * - Abuso de API
 * 
 * NOTA: Por defecto usa store en memoria.
 * Para usar Redis en producción, instalar: npm install rate-limit-redis
 * y configurar el store según la documentación oficial.
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * NOTA: Store personalizado de Redis removido por incompatibilidad de tipos.
 * 
 * Para usar Redis en producción:
 * 1. Instalar: npm install rate-limit-redis
 * 2. Importar: import { RedisStore } from 'rate-limit-redis'
 * 3. Configurar: store: new RedisStore({ client: redisClient })
 * 
 * Por ahora usamos el store en memoria por defecto (funciona bien para single instance).
 */

/**
 * Generar clave única para rate limiting
 */
function generateKey(req: Request): string {
    // Usar IP + ruta + usuario (si está autenticado)
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const path = req.path;
    const userId = (req as any).authenticatedUser?.id || (req as any).decodedToken?.uid || 'anonymous';
    
    return `${ip}:${path}:${userId}`;
}

/**
 * Rate limiter para endpoints públicos (productos, categorías, etc.)
 * 100 requests por minuto por IP
 */
export const publicRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 100, // 100 requests por ventana
    message: {
        success: false,
        error: 'Demasiadas solicitudes. Por favor, intenta nuevamente en un momento.',
    },
    standardHeaders: true, // Retornar rate limit info en headers `RateLimit-*`
    legacyHeaders: false, // Deshabilitar `X-RateLimit-*` headers
    // store: undefined (usa memoria por defecto)
    keyGenerator: generateKey,
    skip: (req: Request) => {
        // En desarrollo, opcionalmente saltar rate limiting
        return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
    },
});

/**
 * Rate limiter para endpoints autenticados
 * 200 requests por minuto por usuario
 */
export const authenticatedRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 200, // 200 requests por ventana
    message: {
        success: false,
        error: 'Demasiadas solicitudes. Por favor, intenta nuevamente en un momento.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // store: undefined (usa memoria por defecto)
    keyGenerator: generateKey,
    skip: (req: Request) => {
        return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
    },
});

/**
 * Rate limiter para endpoints de autenticación (login, register)
 * 5 requests por minuto por IP (muy restrictivo para prevenir brute force)
 */
export const authRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 5, // Solo 5 intentos por minuto
    message: {
        success: false,
        error: 'Demasiados intentos de autenticación. Por favor, espera un minuto antes de intentar nuevamente.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // store: undefined (usa memoria por defecto)
    keyGenerator: (req: Request) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return `auth:${ip}`;
    },
    skip: (req: Request) => {
        return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
    },
});

/**
 * Rate limiter para webhooks de Mercado Pago
 * 10 requests por minuto por IP (MP envía pocos webhooks)
 */
export const webhookRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 10, // 10 webhooks por minuto
    message: {
        success: false,
        error: 'Demasiados webhooks recibidos.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // store: undefined (usa memoria por defecto)
    keyGenerator: (req: Request) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return `webhook:${ip}`;
    },
    // No saltar en desarrollo para webhooks (son críticos)
});

/**
 * Rate limiter para endpoints de administración
 * 50 requests por minuto por usuario admin
 */
export const adminRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 50, // 50 requests por minuto
    message: {
        success: false,
        error: 'Demasiadas solicitudes de administración. Por favor, intenta nuevamente en un momento.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // store: undefined (usa memoria por defecto)
    keyGenerator: generateKey,
    skip: (req: Request) => {
        return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
    },
});

/**
 * Rate limiter para endpoints de sincronización (facturas, etc.)
 * 5 requests por minuto (operaciones pesadas)
 */
export const syncRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 5, // Solo 5 sincronizaciones por minuto
    message: {
        success: false,
        error: 'Demasiadas solicitudes de sincronización. Por favor, espera un minuto.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // store: undefined (usa memoria por defecto)
    keyGenerator: generateKey,
    skip: (req: Request) => {
        return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
    },
});
