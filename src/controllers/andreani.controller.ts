/**
 * Controlador de Andreani
 * 
 * Maneja las requests HTTP relacionadas con la integración de Andreani.
 * Separado en:
 * - Pre-envíos (órdenes de envío)
 * - Envíos reales
 * - Cotizaciones
 */

import { Request, Response } from 'express';
import { andreaniPreEnvioService } from '../services/andreani/andreani.preenvio.service';
import { andreaniEnvioService } from '../services/andreani/andreani.envio.service';
import { andreaniEnviosService } from '../services/andreani/andreani.envios.service';
import { ICotizarEnvioRequest } from '../services/andreani/andreani.types';
import { IApiResponse } from '../types';

export class AndreaniController {
    // ============================================
    // PRE-ENVÍOS (Órdenes de envío)
    // ============================================

    /**
     * Crea un pre-envío para una venta confirmada
     * POST /api/andreani/pre-envios
     * Body: { id_venta: number, datosEnvio?: {...} }
     */
    async crearPreEnvio(req: Request, res: Response): Promise<void> {
        try {
            const { id_venta, datosEnvio } = req.body;

            if (!id_venta || typeof id_venta !== 'number') {
                res.status(400).json({
                    success: false,
                    error: 'id_venta es requerido y debe ser un número',
                });
                return;
            }

            const preEnvio = await andreaniPreEnvioService.crearPreEnvio(
                id_venta,
                datosEnvio
            );

            const response: IApiResponse = {
                success: true,
                data: preEnvio,
                message: 'Pre-envío creado exitosamente',
            };

            res.status(201).json(response);
        } catch (error: any) {
            console.error('❌ [AndreaniController] Error al crear pre-envío:', error);
            
            let statusCode = 500;
            if (error.message?.includes('no encontrada')) {
                statusCode = 404;
            } else if (error.message?.includes('no está confirmada')) {
                statusCode = 400;
            } else if (error.message?.includes('Ya existe')) {
                statusCode = 409;
            }

            res.status(statusCode).json({
                success: false,
                error: error.message || 'Error al crear pre-envío',
            });
        }
    }

    /**
     * Consulta un pre-envío por número de envío
     * GET /api/andreani/pre-envios/:numeroDeEnvio
     */
    async consultarPreEnvio(req: Request, res: Response): Promise<void> {
        try {
            const { numeroDeEnvio } = req.params;

            if (!numeroDeEnvio) {
                res.status(400).json({
                    success: false,
                    error: 'numeroDeEnvio es requerido',
                });
                return;
            }

            const preEnvio = await andreaniPreEnvioService.consultarPreEnvio(numeroDeEnvio);

            const response: IApiResponse = {
                success: true,
                data: preEnvio,
            };

            res.json(response);
        } catch (error: any) {
            console.error('❌ [AndreaniController] Error al consultar pre-envío:', error);
            
            res.status(404).json({
                success: false,
                error: error.message || 'Error al consultar pre-envío',
            });
        }
    }

    // ============================================
    // ENVÍOS REALES
    // ============================================

    /**
     * Consulta el estado de un ENVÍO real
     * GET /api/andreani/envios/:numeroAndreani/estado
     * 
     * IMPORTANTE: Solo funciona si el pre-envío fue aceptado (estado "Creada")
     */
    async consultarEstadoEnvio(req: Request, res: Response): Promise<void> {
        try {
            const { numeroAndreani } = req.params;

            if (!numeroAndreani) {
                res.status(400).json({
                    success: false,
                    error: 'numeroAndreani es requerido',
                });
                return;
            }

            const estado = await andreaniEnvioService.consultarEstadoEnvio(numeroAndreani);

            const response: IApiResponse = {
                success: true,
                data: estado,
            };

            res.json(response);
        } catch (error: any) {
            console.error('❌ [AndreaniController] Error al consultar estado de envío:', error);
            
            let statusCode = 404;
            if (error.message?.includes('aún no está disponible')) {
                statusCode = 404;
            }

            res.status(statusCode).json({
                success: false,
                error: error.message || 'Error al consultar estado de envío',
            });
        }
    }

    /**
     * Obtiene la etiqueta de un envío
     * GET /api/andreani/envios/:agrupadorDeBultos/etiquetas?bulto=1
     */
    async obtenerEtiqueta(req: Request, res: Response): Promise<void> {
        try {
            const { agrupadorDeBultos } = req.params;
            const { bulto } = req.query;

            if (!agrupadorDeBultos) {
                res.status(400).json({
                    success: false,
                    error: 'agrupadorDeBultos es requerido',
                });
                return;
            }

            const bultoNumero = bulto ? parseInt(bulto as string) : undefined;
            const etiqueta = await andreaniEnvioService.obtenerEtiqueta(
                agrupadorDeBultos,
                bultoNumero
            );

            const response: IApiResponse = {
                success: true,
                data: etiqueta,
            };

            res.json(response);
        } catch (error: any) {
            console.error('❌ [AndreaniController] Error al obtener etiqueta:', error);
            
            res.status(404).json({
                success: false,
                error: error.message || 'Error al obtener etiqueta',
            });
        }
    }

    /**
     * Consulta las trazas (historial completo) de un ENVÍO real
     * GET /api/andreani/envios/:numeroAndreani/trazas
     * 
     * IMPORTANTE: Solo funciona si el pre-envío fue aceptado (estado "Creada")
     */
    async consultarTrazasEnvio(req: Request, res: Response): Promise<void> {
        try {
            const { numeroAndreani } = req.params;

            if (!numeroAndreani) {
                res.status(400).json({
                    success: false,
                    error: 'numeroAndreani es requerido',
                });
                return;
            }

            const trazas = await andreaniEnvioService.consultarTrazasEnvio(numeroAndreani);

            const response: IApiResponse = {
                success: true,
                data: trazas,
            };

            res.json(response);
        } catch (error: any) {
            console.error('❌ [AndreaniController] Error al consultar trazas del envío:', error);
            
            let statusCode = 404;
            if (error.message?.includes('aún no está disponible')) {
                statusCode = 404;
            }

            res.status(statusCode).json({
                success: false,
                error: error.message || 'Error al consultar trazas del envío',
            });
        }
    }

    /**
     * Cotiza un envío con Andreani
     * 
     * POST /api/andreani/envios/cotizar
     * Body: { cpDestino, contrato, cliente, sucursalOrigen?, bultos[0][volumen], bultos[0][kilos]?, ... }
     * 
     * IMPORTANTE: La API de tarifas usa query params (GET), pero mantenemos POST para consistencia
     */
    async cotizarEnvio(req: Request, res: Response): Promise<void> {
        try {
            const {
                cpDestino,
                contrato,
                cliente,
                sucursalOrigen,
                volumen,
                kilos,
                valorDeclarado,
                altoCm,
                largoCm,
                anchoCm,
            } = req.body;

            // Validar campos obligatorios
            if (!cpDestino || typeof cpDestino !== 'string') {
                res.status(400).json({
                    success: false,
                    error: 'cpDestino es requerido y debe ser un string',
                });
                return;
            }

            if (!contrato || typeof contrato !== 'string') {
                res.status(400).json({
                    success: false,
                    error: 'contrato es requerido y debe ser un string',
                });
                return;
            }

            if (!cliente || typeof cliente !== 'string') {
                res.status(400).json({
                    success: false,
                    error: 'cliente es requerido y debe ser un string',
                });
                return;
            }

            if (!volumen || typeof volumen !== 'string') {
                res.status(400).json({
                    success: false,
                    error: 'bultos[0][volumen] es requerido y debe ser un string',
                });
                return;
            }

            // Preparar input para el service
            const input: ICotizarEnvioRequest = {
                cpDestino,
                contrato,
                cliente,
                sucursalOrigen,
                'bultos[0][volumen]': volumen,
                'bultos[0][kilos]': kilos ? String(kilos) : undefined,
                'bultos[0][valorDeclarado]': valorDeclarado ? String(valorDeclarado) : undefined,
                'bultos[0][altoCm]': altoCm ? String(altoCm) : undefined,
                'bultos[0][largoCm]': largoCm ? String(largoCm) : undefined,
                'bultos[0][anchoCm]': anchoCm ? String(anchoCm) : undefined,
            };

            // Delegar al service
            const cotizacion = await andreaniEnviosService.cotizarEnvioAndreani(input);

            // Devolver solo el precio con IVA de forma simple
            const response: IApiResponse = {
                success: true,
                data: {
                    precio: cotizacion.precio, // Ya es con IVA
                    moneda: cotizacion.moneda,
                    // Opcional: devolver detalles si se necesitan
                    tarifaConIva: cotizacion.tarifaConIva,
                },
                message: 'Cotización obtenida exitosamente',
            };

            res.json(response);
        } catch (error: any) {
            console.error('❌ [AndreaniController] Error al cotizar envío:', error);
            
            let statusCode = 500;
            if (error.message?.includes('requerido') || error.message?.includes('obligatorio')) {
                statusCode = 400;
            } else if (error.message?.includes('no encontrada') || error.message?.includes('no existe')) {
                statusCode = 404;
            }

            res.status(statusCode).json({
                success: false,
                error: error.message || 'Error al cotizar envío',
            });
        }
    }
}

