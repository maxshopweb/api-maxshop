import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { asSingleString } from '../utils/validation.utils';
import { clientesService } from '../services/clientes.service';
import { buildClientesExcelBuffer } from '../services/clientes-excel.service';
import ftpService from '../services/ftp.service';
import { IClienteFilters, IUpdateClienteDTO } from '../types';
import { ftpPathsConfig } from '../config/ftp-paths.config';

function parseActivoQuery(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const v = String(Array.isArray(value) ? value[0] : value).toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
    return undefined;
}

export class ClientesController {
    async getAll(req: Request, res: Response) {
        try {
            const filters: IClienteFilters = {
                page: req.query.page ? Number(req.query.page) : undefined,
                limit: req.query.limit ? Number(req.query.limit) : undefined,
                order_by: req.query.order_by as any,
                order: req.query.order as 'asc' | 'desc',
                busqueda: req.query.busqueda as string,
                activo: parseActivoQuery(req.query.activo),
                ciudad: req.query.ciudad as string,
                provincia: req.query.provincia as string,
                creado_desde: req.query.creado_desde as string,
                creado_hasta: req.query.creado_hasta as string,
                ultimo_login_desde: req.query.ultimo_login_desde as string,
                ultimo_login_hasta: req.query.ultimo_login_hasta as string,
            };

            const result = await clientesService.getAll(filters);
            res.json(result);
        } catch (error: any) {
            console.error('❌ Error en getAll clientes:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Error al obtener clientes',
            });
        }
    }

    async getById(req: Request, res: Response) {
        try {
            const id = asSingleString(req.params.id);
            const cliente = await clientesService.getById(id);
            res.json({
                success: true,
                data: cliente,
            });
        } catch (error: any) {
            console.error('❌ Error en getById cliente:', error);
            res.status(404).json({
                success: false,
                error: error.message || 'Cliente no encontrado',
            });
        }
    }

    async getStats(req: Request, res: Response) {
        try {
            const id = asSingleString(req.params.id);
            const stats = await clientesService.getStats(id);
            res.json({
                success: true,
                data: stats,
            });
        } catch (error: any) {
            console.error('❌ Error en getStats cliente:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Error al obtener estadísticas',
            });
        }
    }

    async getVentas(req: Request, res: Response) {
        try {
            const id = asSingleString(req.params.id);
            const filters: IClienteFilters = {
                page: req.query.page ? Number(req.query.page) : undefined,
                limit: req.query.limit ? Number(req.query.limit) : undefined,
            };

            const result = await clientesService.getVentas(id, filters);
            res.json(result);
        } catch (error: any) {
            console.error('❌ Error en getVentas cliente:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Error al obtener ventas del cliente',
            });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const id = asSingleString(req.params.id);
            const data: IUpdateClienteDTO = req.body || {};
            const cliente = await clientesService.update(id, data);
            res.json({
                success: true,
                data: cliente,
                message: 'Cliente actualizado correctamente',
            });
        } catch (error: any) {
            console.error('❌ Error en update cliente:', error);
            const msg = error?.message || '';
            const status =
                msg === 'Cliente no encontrado'
                    ? 404
                    : msg.includes('Ya existe otro usuario con ese número de documento')
                      ? 409
                      : 500;
            res.status(status).json({
                success: false,
                error: msg || 'Error al actualizar cliente',
            });
        }
    }

    /**
     * Exporta todos los clientes a Excel, sube el archivo al FTP y lo devuelve para descarga.
     */
    async exportExcel(req: Request, res: Response) {
        const TEMP_DIR = path.join(process.cwd(), 'backend', 'data', 'temp');
        const REMOTE_PATH = ftpPathsConfig.clientesExcel;
        const FILENAME = 'Clientes.xlsx';

        try {
            const clientes = await clientesService.getAllForExport();
            const buffer = buildClientesExcelBuffer(clientes);

            const localPath = path.join(TEMP_DIR, FILENAME);
            if (!fs.existsSync(TEMP_DIR)) {
                fs.mkdirSync(TEMP_DIR, { recursive: true });
            }
            fs.writeFileSync(localPath, buffer);

            try {
                await ftpService.connect();
                await ftpService.uploadExcel(localPath, REMOTE_PATH);
                console.log(`✅ [Clientes] Excel exportado y subido a FTP: ${REMOTE_PATH}`);
            } finally {
                await ftpService.disconnect();
            }

            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            res.setHeader('Content-Disposition', `attachment; filename="${FILENAME}"`);
            res.setHeader('Content-Length', buffer.length);
            res.send(buffer);
        } catch (error: any) {
            console.error('❌ Error en export Excel clientes:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Error al exportar clientes a Excel',
            });
        }
    }
}

export const clientesController = new ClientesController();

