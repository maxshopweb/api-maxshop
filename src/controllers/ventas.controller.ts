import { Request, Response } from 'express';
import { VentasService } from '../services/ventas.service';
import { paymentProcessingService } from '../services/payment-processing.service';
import { IApiResponse } from '../types';
import { IVentaFilters, ICreateVentaDTO, IUpdateVentaDTO, IVenta } from '../types';

const ventasService = new VentasService();

export class VentasController {
    async getAll(req: Request, res: Response): Promise<void> {
        try {
            const filters: IVentaFilters = {
                page: parseInt(req.query.page as string) || 1,
                limit: parseInt(req.query.limit as string) || 25,
                order_by: (req.query.order_by as any) || 'fecha',
                order: (req.query.order as any) || 'desc',
                busqueda: req.query.busqueda as string,
                id_cliente: req.query.id_cliente as string,
                id_usuario: req.query.id_usuario as string,
                fecha_desde: req.query.fecha_desde as string,
                fecha_hasta: req.query.fecha_hasta as string,
                estado_pago: req.query.estado_pago as any,
                estado_envio: req.query.estado_envio as any,
                metodo_pago: req.query.metodo_pago as any,
                tipo_venta: req.query.tipo_venta as any,
                total_min: req.query.total_min ? parseFloat(req.query.total_min as string) : undefined,
                total_max: req.query.total_max ? parseFloat(req.query.total_max as string) : undefined,
            };

            const result = await ventasService.getAll(filters);
            res.json(result);
        } catch (error) {
            console.error('Error en getAll:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener ventas'
            });
        }
    }

    async getById(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            const venta = await ventasService.getById(id);

            const response: IApiResponse = {
                success: true,
                data: venta
            };

            res.json(response);
        } catch (error: any) {
            console.error('Error en getById:', error);
            res.status(404).json({
                success: false,
                error: error.message || 'Venta no encontrada'
            });
        }
    }

    async create(req: Request, res: Response): Promise<void> {
        try {
            const data: ICreateVentaDTO = req.body;
            const idUsuario = (req as any).user?.id_usuario; // Desde el middleware de auth

            if (!data.detalles || data.detalles.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'La venta debe tener al menos un producto'
                });
                return;
            }

            await ventasService.create(data, idUsuario);

            const response: IApiResponse = {
                success: true,
                message: 'Venta creada exitosamente'
            };

            res.status(201).json(response);
        } catch (error: any) {
            console.error('Error en create:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Error al crear venta'
            });
        }
    }

    async update(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const data: IUpdateVentaDTO = req.body;

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            const venta = await ventasService.update(id, data);

            const response: IApiResponse = {
                success: true,
                data: venta,
                message: 'Venta actualizada exitosamente'
            };

            res.json(response);
        } catch (error: any) {
            console.error('Error en update:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Error al actualizar venta'
            });
        }
    }

    async delete(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            await ventasService.delete(id);

            const response: IApiResponse = {
                success: true,
                message: 'Venta eliminada exitosamente'
            };

            res.json(response);
        } catch (error: any) {
            console.error('Error en delete:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Error al eliminar venta'
            });
        }
    }

    async updateEstadoPago(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const { estado_pago } = req.body;

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            const venta = await ventasService.updateEstadoPago(id, estado_pago);

            const response: IApiResponse = {
                success: true,
                data: venta,
                message: 'Estado de pago actualizado exitosamente'
            };

            res.json(response);
        } catch (error: any) {
            console.error('Error en updateEstadoPago:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Error al actualizar estado de pago'
            });
        }
    }

    async updateEstadoEnvio(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const { estado_envio } = req.body;

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            const venta = await ventasService.updateEstadoEnvio(id, estado_envio);

            const response: IApiResponse = {
                success: true,
                data: venta,
                message: 'Estado de envío actualizado exitosamente'
            };

            res.json(response);
        } catch (error: any) {
            console.error('Error en updateEstadoEnvio:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Error al actualizar estado de envío'
            });
        }
    }

    /**
     * Obtiene los pedidos del usuario autenticado
     * Requiere autenticación
     */
    async getMyPedidos(req: Request, res: Response): Promise<void> {
        try {
            const idUsuario = req.authenticatedUser?.id;
            
            if (!idUsuario) {
                res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
                return;
            }

            const filters: IVentaFilters = {
                page: parseInt(req.query.page as string) || 1,
                limit: parseInt(req.query.limit as string) || 25,
                order_by: (req.query.order_by as any) || 'fecha',
                order: (req.query.order as any) || 'desc',
                estado_pago: req.query.estado_pago as any,
                estado_envio: req.query.estado_envio as any,
            };

            const result = await ventasService.getMyPedidos(idUsuario, filters);
            res.json(result);
        } catch (error: any) {
            console.error('Error en getMyPedidos:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Error al obtener pedidos'
            });
        }
    }

    /**
     * Endpoint específico para crear pedidos desde el checkout
     * Requiere autenticación
     */
    async createFromCheckout(req: Request, res: Response): Promise<void> {
        try {
            const data = req.body;
            // Obtener id_usuario del usuario autenticado (del middleware loadUserFromDatabase)
            // Convertir null a undefined para cumplir con el tipo esperado
            const idUsuario = req.authenticatedUser?.id || req.decodedToken?.uid || undefined;
            

            // Validaciones
            if (!data.detalles || data.detalles.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'El pedido debe tener al menos un producto'
                });
                return;
            }

            if (!data.metodo_pago) {
                res.status(400).json({
                    success: false,
                    error: 'El método de pago es requerido'
                });
                return;
            }

            // Validar que los productos existan y tengan stock
            for (const detalle of data.detalles) {
                // Validar que id_prod exista y no sea null/undefined
                if (detalle.id_prod === undefined || detalle.id_prod === null) {
                    res.status(400).json({
                        success: false,
                        error: 'Todos los detalles deben tener id_prod, cantidad y precio_unitario'
                    });
                    return;
                }
                // Validar que cantidad exista y sea mayor a 0
                if (detalle.cantidad === undefined || detalle.cantidad === null || detalle.cantidad <= 0) {
                    res.status(400).json({
                        success: false,
                        error: 'Todos los detalles deben tener id_prod, cantidad y precio_unitario'
                    });
                    return;
                }
                // Validar que precio_unitario exista (puede ser 0 para productos gratuitos)
                if (detalle.precio_unitario === undefined || detalle.precio_unitario === null) {
                    res.status(400).json({
                        success: false,
                        error: 'Todos los detalles deben tener id_prod, cantidad y precio_unitario'
                    });
                    return;
                }
            }

            const venta = await ventasService.createFromCheckout(data, idUsuario);

            // Extraer URL de Mercado Pago si existe
            const mercadoPagoPreferenceUrl = (venta as any).mercadoPagoPreferenceUrl || null;

            const response: IApiResponse<IVenta & { mercadoPagoPreferenceUrl?: string | null }> = {
                success: true,
                message: 'Pedido creado exitosamente',
                data: {
                    ...venta,
                    mercadoPagoPreferenceUrl,
                }
            };

            res.status(201).json(response);
        } catch (error: any) {
            console.error('❌ Error en createFromCheckout:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Error al crear pedido'
            });
        }
    }

    /**
     * Confirma el pago de una venta (para pagos manuales de efectivo/transferencia)
     * Requiere autenticación y rol de admin
     */
    async confirmarPago(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const { notas } = req.body; // Notas opcionales del admin

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            // Confirmar pago usando el servicio centralizado
            await paymentProcessingService.confirmPayment(id, {
                notas: notas || 'Pago confirmado manualmente por administrador',
            });

            const response: IApiResponse = {
                success: true,
                message: 'Pago confirmado exitosamente. Stock descontado y orden de envío creada.'
            };

            res.json(response);
        } catch (error: any) {
            console.error('❌ Error en confirmarPago:', error);
            
            // Determinar código de estado apropiado
            let statusCode = 400;
            if (error.message?.includes('no encontrada')) {
                statusCode = 404;
            } else if (error.message?.includes('ya está aprobada')) {
                statusCode = 200; // Idempotente, no es error
            } else if (error.message?.includes('Stock insuficiente')) {
                statusCode = 409; // Conflict
            }

            res.status(statusCode).json({
                success: false,
                error: error.message || 'Error al confirmar pago'
            });
        }
    }

    async getStats(req: Request, res: Response): Promise<void> {
        try {
            const filters: IVentaFilters = {
                busqueda: req.query.busqueda as string,
                id_cliente: req.query.id_cliente as string,
                id_usuario: req.query.id_usuario as string,
                fecha_desde: req.query.fecha_desde as string,
                fecha_hasta: req.query.fecha_hasta as string,
                estado_pago: req.query.estado_pago as any,
                estado_envio: req.query.estado_envio as any,
                metodo_pago: req.query.metodo_pago as any,
                tipo_venta: req.query.tipo_venta as any,
                total_min: req.query.total_min ? parseFloat(req.query.total_min as string) : undefined,
                total_max: req.query.total_max ? parseFloat(req.query.total_max as string) : undefined,
            };

            const stats = await ventasService.getStats(filters);
            
            const response: IApiResponse = {
                success: true,
                data: stats,
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getStats:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener estadísticas de ventas'
            });
        }
    }
}

