/**
 * Middleware de validación de firma para webhooks de Mercado Pago
 * 
 * Mercado Pago envía un header x-signature con formato:
 * "ts={timestamp},v1={hmac_signature}"
 * 
 * La firma se genera con HMAC-SHA256 sobre un "manifest" que contiene:
 * - id: el data.id del payload
 * - request-id: header x-request-id
 * - ts: timestamp del header x-signature
 * 
 * Documentación: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Interfaz para request con rawBody
interface RequestWithRawBody extends Request {
    rawBody?: Buffer;
}

/**
 * Parsea el header x-signature de Mercado Pago
 * Formato: "ts=1234567890,v1=abc123..."
 */
function parseSignatureHeader(signatureHeader: string): { ts: string | null; v1: string | null } {
    const result: { ts: string | null; v1: string | null } = { ts: null, v1: null };
    
    if (!signatureHeader) {
        return result;
    }
    
    const parts = signatureHeader.split(',');
    for (const part of parts) {
        const [key, ...valueParts] = part.split('=');
        const value = valueParts.join('='); // Por si el valor contiene '='
        
        if (key === 'ts') {
            result.ts = value;
        } else if (key === 'v1') {
            result.v1 = value;
        }
    }
    
    return result;
}

/**
 * Construye el manifest para la validación de firma
 * Según documentación MP: "id:{data.id};request-id:{x-request-id};ts:{ts};"
 */
function buildManifest(dataId: string | number, requestId: string, ts: string): string {
    let manifest = '';
    
    // Agregar id si existe
    if (dataId) {
        manifest += `id:${dataId};`;
    }
    
    // Agregar request-id si existe
    if (requestId) {
        manifest += `request-id:${requestId};`;
    }
    
    // Agregar timestamp
    manifest += `ts:${ts};`;
    
    return manifest;
}

/**
 * Genera la firma HMAC-SHA256
 */
function generateSignature(manifest: string, secret: string): string {
    return crypto
        .createHmac('sha256', secret)
        .update(manifest)
        .digest('hex');
}

/**
 * Middleware que valida la firma del webhook de Mercado Pago
 * 
 * IMPORTANTE: Este middleware debe usarse DESPUÉS de un body parser que preserve rawBody
 * o configurar express.json() con la opción verify para guardar el raw body
 * 
 * @param options - Opciones de configuración
 * @param options.skipValidation - Si es true, salta la validación (útil para desarrollo)
 * @param options.logDetails - Si es true, loguea detalles de la validación
 */
export function validateMercadoPagoSignature(options?: {
    skipValidation?: boolean;
    logDetails?: boolean;
}) {
    return (req: RequestWithRawBody, res: Response, next: NextFunction): void => {
        const { skipValidation = false, logDetails = false } = options || {};
        
        // En modo desarrollo, permitir saltar validación si no hay secret configurado
        const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
        
        if (!webhookSecret) {
            if (process.env.NODE_ENV === 'production') {
                console.error('❌ [WebhookSignature] MERCADOPAGO_WEBHOOK_SECRET no configurado en producción');
                res.status(500).json({ 
                    error: 'Webhook secret not configured',
                    code: 'WEBHOOK_SECRET_MISSING'
                });
                return;
            }
            
            if (process.env.NODE_ENV === 'production') {
                console.error('❌ [WebhookSignature] MERCADOPAGO_WEBHOOK_SECRET no configurado en producción');
            }
            next();
            return;
        }
        
        if (skipValidation) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('⚠️ [WebhookSignature] Validación de firma deshabilitada por configuración');
            }
            next();
            return;
        }
        
        // Verificar si es merchant_order ANTES de validar firma
        // En sandbox, merchant_order puede tener problemas con la validación de firma
        const topic = req.query['topic'] as string;
        const isSandbox = process.env.NODE_ENV !== 'production' || process.env.MERCADOPAGO_ENV === 'test';
        if (topic === 'merchant_order' && isSandbox) {
            // En sandbox, permitir merchant_order sin validación estricta
            // La seguridad real se hace consultando la API de MP en el controller
            next();
            return;
        }
        
        // Obtener headers
        const xSignature = req.headers['x-signature'] as string;
        const xRequestId = req.headers['x-request-id'] as string;
        
        if (!xSignature) {
            // En desarrollo, permitir sin firma para pruebas manuales
            if (process.env.NODE_ENV !== 'production') {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn('⚠️ [WebhookSignature] Webhook sin firma - permitido en desarrollo');
                }
                next();
                return;
            }
            
            console.error('❌ [WebhookSignature] Webhook sin header x-signature en producción');
            
            res.status(401).json({ 
                error: 'Missing signature header',
                code: 'SIGNATURE_MISSING'
            });
            return;
        }
        
        // Parsear x-signature
        const { ts, v1 } = parseSignatureHeader(xSignature);
        
        if (!ts || !v1) {
            console.error('❌ [WebhookSignature] Header x-signature con formato inválido:', xSignature);
            res.status(401).json({ 
                error: 'Invalid signature format',
                code: 'SIGNATURE_FORMAT_INVALID'
            });
            return;
        }
        
        // Obtener data.id del body, query params, o id directo (para merchant_order)
        // MP puede enviar:
        // - payment: { data: { id: "123" } } o ?data.id=123
        // - merchant_order: ?id=123&topic=merchant_order
        const dataId = req.query['data.id'] || req.body?.data?.id || req.query['id'];
        
        // Si no hay dataId, rechazar (merchant_order ya fue manejado arriba)
        if (!dataId) {
            console.error('❌ [WebhookSignature] No se encontró data.id en el webhook');
            res.status(400).json({ 
                error: 'Missing data.id in webhook',
                code: 'DATA_ID_MISSING'
            });
            return;
        }
        
        // Construir manifest
        const manifest = buildManifest(dataId.toString(), xRequestId || '', ts);
        
        // Generar firma esperada
        const expectedSignature = generateSignature(manifest, webhookSecret);
        
        // Log detallado solo en desarrollo
        if (logDetails && process.env.NODE_ENV !== 'production') {
            console.log(`🔐 [WebhookSignature] Validando firma: ${dataId}`);
        }
        
        // Comparar firmas de forma segura (timing-safe)
        const receivedBuffer = Buffer.from(v1);
        const expectedBuffer = Buffer.from(expectedSignature);
        
        let isValid = false;
        if (receivedBuffer.length === expectedBuffer.length) {
            isValid = crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
        }
        
        if (!isValid) {
            console.error('❌ [WebhookSignature] Firma inválida para webhook', {
                dataId,
                xRequestId,
                receivedSignatureStart: v1.substring(0, 10),
            });
            
            res.status(401).json({ 
                error: 'Invalid signature',
                code: 'SIGNATURE_INVALID'
            });
            return;
        }
        
        // Log solo en desarrollo
        if (process.env.NODE_ENV !== 'production') {
            console.log(`✅ [WebhookSignature] Firma válida: ${dataId}`);
        }
        
        // Agregar metadata al request para uso posterior
        (req as any).webhookValidation = {
            validated: true,
            dataId,
            requestId: xRequestId,
            timestamp: ts,
        };
        
        next();
    };
}

/**
 * Middleware opcional que verifica que el timestamp no sea muy antiguo
 * Previene ataques de replay
 */
export function validateWebhookTimestamp(maxAgeSeconds: number = 300) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const xSignature = req.headers['x-signature'] as string;
        
        if (!xSignature) {
            next();
            return;
        }
        
        const { ts } = parseSignatureHeader(xSignature);
        
        if (!ts) {
            next();
            return;
        }
        
        const webhookTimestamp = parseInt(ts, 10);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const age = currentTimestamp - webhookTimestamp;
        
        if (age > maxAgeSeconds) {
            console.error(`❌ [WebhookTimestamp] Webhook demasiado antiguo: ${age}s (max: ${maxAgeSeconds}s)`);
            
            // En desarrollo, solo advertir
            if (process.env.NODE_ENV !== 'production') {
                next();
                return;
            }
            
            res.status(401).json({
                error: 'Webhook timestamp too old',
                code: 'TIMESTAMP_EXPIRED',
                age,
                maxAge: maxAgeSeconds,
            });
            return;
        }
        
        next();
    };
}

export default validateMercadoPagoSignature;
