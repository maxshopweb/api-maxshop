import { Request, Response } from 'express';
import { asSingleString } from '../utils/validation.utils';
import { clientesService } from '../services/clientes.service';
import { IClienteFilters, EstadoGeneral } from '../types';

export class ClientesController {
    async getAll(req: Request, res: Response) {
        try {
            const filters: IClienteFilters = {
                page: req.query.page ? Number(req.query.page) : undefined,
                limit: req.query.limit ? Number(req.query.limit) : undefined,
                order_by: req.query.order_by as any,
                order: req.query.order as 'asc' | 'desc',
                busqueda: req.query.busqueda as string,
                estado: req.query.estado ? (Number(req.query.estado) as EstadoGeneral) : undefined,
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
}

export const clientesController = new ClientesController();

