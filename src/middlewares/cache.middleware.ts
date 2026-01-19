import { Request, Response, NextFunction } from 'express';
import cacheService from '../services/cache.service';

// Middleware para cachear respuestas de endpoints
export const cacheMiddleware = (ttl: number = 300) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Solo cachear GET requests
        if (req.method !== 'GET') {
            return next();
        }

        // Generar key única basada en URL y query params
        const cacheKey = `endpoint:${req.originalUrl}`;

        try {
            // Buscar en caché
            const cachedResponse = await cacheService.get(cacheKey);

            if (cachedResponse) {
                return res.json(cachedResponse);
            }

            // Si no está en caché, interceptar la respuesta original
            const originalJson = res.json.bind(res);
            
            res.json = function(data: any) {
                // Guardar en caché
                cacheService.set(cacheKey, data, ttl);
                // Enviar respuesta original
                return originalJson(data);
            };

            next();
        } catch (error) {
            console.error('Error en cache middleware:', error);
            next();
        }
    };
};
