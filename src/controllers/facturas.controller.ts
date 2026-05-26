/**
 * Controller para gestión de facturas
 * Endpoints para sincronización manual y consulta de estado
 */

import { Request, Response } from 'express';
import facturaSyncService, { SyncFacturasResult } from '../services/factura-sync.service';
import { prisma } from '../index';
import * as fs from 'fs';

export class FacturasController {
    /**
     * Sincroniza facturas pendientes manualmente
     * POST /api/facturas/sync
     */
    async syncFacturas(req: Request, res: Response): Promise<void> {
        try {
            console.log('🔄 [FacturasController] Sincronización manual iniciada...');
            const auditContext = req.authenticatedUser
                ? {
                    userId: req.authenticatedUser.id,
                    userAgent: req.headers['user-agent']?.toString() ?? null,
                    endpoint: req.originalUrl,
                }
                : undefined;
            const resultado = await facturaSyncService.syncFacturasPendientes(auditContext);

            res.status(200).json({
                success: true,
                message: 'Sincronización completada',
                data: resultado,
            });
        } catch (error: any) {
            console.error('❌ [FacturasController] Error en sincronización:', error);
            res.status(500).json({
                success: false,
                message: 'Error al sincronizar facturas',
                error: error.message || String(error),
            });
        }
    }

    /**
     * Envía manualmente una factura PDF al cliente (admin sube el archivo)
     * POST /api/facturas/:ventaId/enviar-manual
     */
    async enviarManual(req: Request, res: Response): Promise<void> {
        const ventaId = Number(req.params.ventaId);
        const file = req.file;

        if (!ventaId || Number.isNaN(ventaId)) {
            res.status(400).json({ success: false, message: 'ID de venta inválido' });
            return;
        }

        if (!file) {
            res.status(400).json({ success: false, message: 'Debe adjuntar un archivo PDF' });
            return;
        }

        if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            res.status(400).json({ success: false, message: 'Solo se permiten archivos PDF' });
            return;
        }

        try {
            console.log(`📧 [FacturasController] Envío manual de factura para venta #${ventaId}...`);

            const auditContext = req.authenticatedUser
                ? {
                    userId: req.authenticatedUser.id,
                    userAgent: req.headers['user-agent']?.toString() ?? null,
                    endpoint: req.originalUrl,
                }
                : undefined;

            await facturaSyncService.enviarFacturaManual(ventaId, file.path, auditContext);

            res.status(200).json({
                success: true,
                message: 'Factura enviada correctamente',
            });
        } catch (error: any) {
            console.error(`❌ [FacturasController] Error en envío manual venta #${ventaId}:`, error);
            res.status(500).json({
                success: false,
                message: error.message || 'Error al enviar la factura',
            });
        } finally {
            if (file.path && fs.existsSync(file.path)) {
                try {
                    fs.unlinkSync(file.path);
                } catch {
                    // ignore cleanup errors
                }
            }
        }
    }

    /**
     * Obtiene todas las ventas pendientes de factura
     * GET /api/facturas/pendientes
     */
    async getVentasPendientes(req: Request, res: Response): Promise<void> {
        try {
            const { estado, page = 1, limit = 50 } = req.query;

            const where: any = {};
            if (estado) {
                where.estado = estado;
            } else {
                where.estado = 'pendiente';
            }

            const skip = (Number(page) - 1) * Number(limit);

            const [ventasPendientes, total] = await Promise.all([
                prisma.ventas_pendientes_factura.findMany({
                    where,
                    include: {
                        venta: {
                            include: {
                                cliente: {
                                    include: {
                                        usuarios: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        fecha_creacion: 'desc',
                    },
                    skip,
                    take: Number(limit),
                }),
                prisma.ventas_pendientes_factura.count({ where }),
            ]);

            res.status(200).json({
                success: true,
                data: ventasPendientes,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / Number(limit)),
                },
            });
        } catch (error: any) {
            console.error('❌ [FacturasController] Error al obtener ventas pendientes:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener ventas pendientes',
                error: error.message || String(error),
            });
        }
    }

    /**
     * Obtiene estadísticas de facturas pendientes
     * GET /api/facturas/estadisticas
     */
    async getEstadisticas(req: Request, res: Response): Promise<void> {
        try {
            const [pendientes, procesando, completados, errores] = await Promise.all([
                prisma.ventas_pendientes_factura.count({ where: { estado: 'pendiente' } }),
                prisma.ventas_pendientes_factura.count({ where: { estado: 'procesando' } }),
                prisma.ventas_pendientes_factura.count({ where: { estado: 'completado' } }),
                prisma.ventas_pendientes_factura.count({ where: { estado: 'error' } }),
            ]);

            res.status(200).json({
                success: true,
                data: {
                    pendientes,
                    procesando,
                    completados,
                    errores,
                    total: pendientes + procesando + completados + errores,
                },
            });
        } catch (error: any) {
            console.error('❌ [FacturasController] Error al obtener estadísticas:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener estadísticas',
                error: error.message || String(error),
            });
        }
    }

    /**
     * Endpoint de diagnóstico: muestra todos los registros de facturas pendientes
     * GET /api/facturas/debug
     */
    async debugFacturas(req: Request, res: Response): Promise<void> {
        try {
            const todasLasFacturas = await prisma.ventas_pendientes_factura.findMany({
                include: {
                    venta: {
                        select: {
                            id_venta: true,
                            estado_pago: true,
                            total_neto: true,
                            fecha: true,
                        },
                    },
                },
                orderBy: {
                    fecha_creacion: 'desc',
                },
            });

            res.status(200).json({
                success: true,
                message: 'Registros de facturas pendientes',
                data: todasLasFacturas,
                total: todasLasFacturas.length,
            });
        } catch (error: any) {
            console.error('❌ [FacturasController] Error en debug:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener registros',
                error: error.message || String(error),
            });
        }
    }
}

export default new FacturasController();
