/**
 * Rutas de Health Check
 * 
 * Endpoints para verificar el estado del sistema:
 * - GET /api/health - Estado general
 * - GET /api/health/db - Estado de PostgreSQL
 * - GET /api/health/redis - Estado de Redis
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import redisClient, { isRedisEnabled } from '../config/redis.config';

const healthRoutes = Router();

/**
 * Health check general
 * GET /api/health
 */
healthRoutes.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: process.env.npm_package_version || '1.0.0',
        };

        res.status(200).json({
            success: true,
            data: health,
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message || 'Error en health check',
        });
    }
});

/**
 * Health check de base de datos
 * GET /api/health/db
 */
healthRoutes.get('/db', async (req: Request, res: Response): Promise<void> => {
    try {
        const startTime = Date.now();
        
        // Intentar una query simple
        await prisma.$queryRaw`SELECT 1`;
        
        const responseTime = Date.now() - startTime;
        
        res.status(200).json({
            success: true,
            data: {
                status: 'ok',
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error: any) {
        res.status(503).json({
            success: false,
            error: 'Database no disponible',
            details: error.message,
        });
    }
});

/**
 * Health check de Redis
 * GET /api/health/redis
 */
healthRoutes.get('/redis', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!isRedisEnabled() || !redisClient) {
            res.status(200).json({
                success: true,
                data: {
                    status: 'disabled',
                    message: 'Redis está deshabilitado',
                },
            });
            return;
        }

        const startTime = Date.now();
        const pingResult = await redisClient.ping();
        const responseTime = Date.now() - startTime;

        if (pingResult === 'PONG') {
            res.status(200).json({
                success: true,
                data: {
                    status: 'ok',
                    responseTime: `${responseTime}ms`,
                    timestamp: new Date().toISOString(),
                },
            });
        } else {
            res.status(503).json({
                success: false,
                error: 'Redis no responde correctamente',
            });
        }
    } catch (error: any) {
        res.status(503).json({
            success: false,
            error: 'Redis no disponible',
            details: error.message,
        });
    }
});

/**
 * Health check completo (todos los servicios)
 * GET /api/health/full
 */
healthRoutes.get('/full', async (req: Request, res: Response): Promise<void> => {
    try {
        const checks: any = {
            api: { status: 'ok' },
            database: { status: 'unknown' },
            redis: { status: 'unknown' },
        };

        // Verificar base de datos
        try {
            const dbStart = Date.now();
            await prisma.$queryRaw`SELECT 1`;
            checks.database = {
                status: 'ok',
                responseTime: `${Date.now() - dbStart}ms`,
            };
        } catch (error: any) {
            checks.database = {
                status: 'error',
                error: error.message,
            };
        }

        // Verificar Redis
        if (isRedisEnabled() && redisClient) {
            try {
                const redisStart = Date.now();
                const pingResult = await redisClient.ping();
                checks.redis = {
                    status: pingResult === 'PONG' ? 'ok' : 'error',
                    responseTime: `${Date.now() - redisStart}ms`,
                };
            } catch (error: any) {
                checks.redis = {
                    status: 'error',
                    error: error.message,
                };
            }
        } else {
            checks.redis = {
                status: 'disabled',
            };
        }

        // Determinar estado general
        const allOk = Object.values(checks).every((check: any) => 
            check.status === 'ok' || check.status === 'disabled'
        );

        res.status(allOk ? 200 : 503).json({
            success: allOk,
            data: {
                status: allOk ? 'healthy' : 'degraded',
                checks,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message || 'Error en health check completo',
        });
    }
});

export default healthRoutes;
