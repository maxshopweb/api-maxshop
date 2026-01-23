import { Request, Response } from 'express';
import openCageService from '../services/opencage.service';
import { IApiResponse } from '../types';

/**
 * Controller para endpoints de ubicación/geocodificación
 * 
 * Endpoints:
 * - GET /api/location/search - Buscar direcciones
 * - POST /api/location/reverse - Geocodificación inversa
 */
export class LocationController {
    /**
     * Buscar direcciones mediante OpenCage
     * GET /api/location/search?q=...&limit=5&country=ar
     */
    async search(req: Request, res: Response): Promise<void> {
        try {
            const { q, limit = '5', country = 'ar' } = req.query;

            if (!q || typeof q !== 'string') {
                res.status(400).json({
                    success: false,
                    error: 'El parámetro "q" es requerido'
                });
                return;
            }

            const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 5, 1), 10);
            const countryCode = (country as string).toLowerCase().substring(0, 2);

            const results = await openCageService.search(q, limitNum, countryCode);

            const response: IApiResponse = {
                success: true,
                data: results
            };

            res.json(response);
        } catch (error: any) {
            console.error('[Location] Error en search:', error.message);
            
            // Determinar código de estado según el error
            let statusCode = 500;
            if (error.message.includes('3 caracteres')) {
                statusCode = 400;
            } else if (error.message.includes('Límite de solicitudes')) {
                statusCode = 429;
            } else if (error.message.includes('API key')) {
                statusCode = 503;
            }

            res.status(statusCode).json({
                success: false,
                error: error.message || 'Error al buscar direcciones'
            });
        }
    }

    /**
     * Geocodificación inversa (coordenadas → dirección)
     * POST /api/location/reverse
     * Body: { lat: number, lng: number, country?: string }
     */
    async reverse(req: Request, res: Response): Promise<void> {
        try {
            const { lat, lng, country = 'ar' } = req.body;

            if (lat === undefined || lng === undefined) {
                res.status(400).json({
                    success: false,
                    error: 'Se requieren los parámetros "lat" y "lng"'
                });
                return;
            }

            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);

            if (isNaN(latNum) || isNaN(lngNum)) {
                res.status(400).json({
                    success: false,
                    error: 'Las coordenadas deben ser números válidos'
                });
                return;
            }

            const countryCode = (country as string).toLowerCase().substring(0, 2);

            const result = await openCageService.reverse(latNum, lngNum, countryCode);

            const response: IApiResponse = {
                success: true,
                data: result,
                message: result ? undefined : 'No se encontró dirección para las coordenadas proporcionadas'
            };

            res.json(response);
        } catch (error: any) {
            console.error('[Location] Error en reverse:', error.message);
            
            let statusCode = 500;
            if (error.message.includes('inválidas') || error.message.includes('fuera de rango')) {
                statusCode = 400;
            } else if (error.message.includes('Límite de solicitudes')) {
                statusCode = 429;
            } else if (error.message.includes('API key')) {
                statusCode = 503;
            }

            res.status(statusCode).json({
                success: false,
                error: error.message || 'Error en geocodificación inversa'
            });
        }
    }
}
