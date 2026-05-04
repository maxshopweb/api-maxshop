import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { asSingleString } from '../utils/validation.utils';
import { VentasService } from '../services/ventas.service';
import { paymentProcessingService } from '../services/payment-processing.service';
import { IApiResponse } from '../types';
import { IVentaFilters, ICreateVentaDTO, IUpdateVentaDTO, IVenta } from '../types';
import ftpService from '../services/ftp.service';
import { ftpPathsConfig } from '../config/ftp-paths.config';

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
                incluir_canceladas: req.query.incluir_canceladas === 'true',
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

    async exportVentas(req: Request, res: Response): Promise<void> {
        try {
            const idsParam = req.query.ids as string;
            if (!idsParam || typeof idsParam !== 'string') {
                res.status(400).json({ success: false, error: 'Parámetro ids requerido (ej: ids=1,2,3)' });
                return;
            }
            const ids = idsParam
                .split(',')
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => !isNaN(n) && n > 0);
            if (ids.length === 0) {
                res.status(400).json({ success: false, error: 'Ningún ID de venta válido' });
                return;
            }
            const csvBuffer = await ventasService.exportVentasCsv(ids);
            const filename = `ventas-${new Date().toISOString().slice(0, 10)}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csvBuffer);
        } catch (error: any) {
            console.error('Error en exportVentas:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Error al exportar ventas',
            });
        }
    }

    /** Descarga Ventas.xlsx desde el FTP (misma ruta que ExcelHandler). Solo admin. */
    async downloadVentasExcelFtp(req: Request, res: Response): Promise<void> {
        const localPath = path.join(
            process.cwd(),
            'backend',
            'data',
            'temp',
            `Ventas_admin_${Date.now()}.xlsx`
        );
        let connected = false;
        try {
            await ftpService.connect();
            connected = true;
            const remotePath = ftpPathsConfig.ventasExcel;
            if (!(await ftpService.fileExists(remotePath))) {
                res.status(404).json({
                    success: false,
                    error: 'Excel no existen. Consulte al Administrador',
                });
                return;
            }
            const dir = path.dirname(localPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            await ftpService.downloadExcel(remotePath, localPath);
            const buf = fs.readFileSync(localPath);
            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            res.setHeader('Content-Disposition', 'attachment; filename="Ventas.xlsx"');
            res.send(buf);
        } catch (error: any) {
            console.error('Error en downloadVentasExcelFtp:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: error?.message || 'Error al descargar el Excel del FTP',
                });
            }
        } finally {
            try {
                if (fs.existsSync(localPath)) {
                    fs.unlinkSync(localPath);
                }
            } catch {
                /* ignore */
            }
            if (connected) {
                await ftpService.disconnect();
            }
        }
    }

    async getById(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));

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

            const venta = await ventasService.create(data, idUsuario);

            const response: IApiResponse<IVenta> = {
                success: true,
                message: 'Venta creada exitosamente',
                data: venta,
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
            const id = parseInt(asSingleString(req.params.id));
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
            const id = parseInt(asSingleString(req.params.id));

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
            const isAlreadyCancelled = error?.message?.toLowerCase().includes('ya está dada de baja');
            res.status(isAlreadyCancelled ? 409 : 400).json({
                success: false,
                error: error.message || 'Error al eliminar venta'
            });
        }
    }

    async updateEstadoPago(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));
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
            const id = parseInt(asSingleString(req.params.id));
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
     * Actualiza datos de envío de una venta (número de seguimiento, empresa de transporte).
     * PATCH /ventas/:id/envio body: { cod_seguimiento?, empresa_envio? }
     */
    async updateEnvio(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));
            const { cod_seguimiento, empresa_envio } = req.body || {};

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID de venta inválido',
                });
                return;
            }

            const venta = await ventasService.updateEnvio(id, {
                cod_seguimiento: cod_seguimiento !== undefined ? cod_seguimiento : undefined,
                empresa_envio: empresa_envio !== undefined ? empresa_envio : undefined,
            });

            res.json({
                success: true,
                data: venta,
                message: 'Envío actualizado correctamente',
            });
        } catch (error: any) {
            console.error('Error en updateEnvio:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Error al actualizar envío',
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

            // Validar forma de los detalles (stock real: VentasService.create + tipo_venta online)
            for (const detalle of data.detalles) {
                // Validar que id_prod exista y no sea null/undefined
                if (detalle.id_prod === undefined || detalle.id_prod === null) {
                    res.status(400).json({
                        success: false,
                        error: 'Todos los detalles deben tener id_prod y cantidad válidos'
                    });
                    return;
                }
                // Validar que cantidad exista y sea mayor a 0
                if (detalle.cantidad === undefined || detalle.cantidad === null || detalle.cantidad <= 0) {
                    res.status(400).json({
                        success: false,
                        error: 'Todos los detalles deben tener id_prod y cantidad válidos'
                    });
                    return;
                }
                // Precio: en checkout online el servidor calcula desde el catálogo (precio_unitario opcional).
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
            const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
            res.status(statusCode).json({
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
            const id = parseInt(asSingleString(req.params.id));
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

