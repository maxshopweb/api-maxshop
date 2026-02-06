import { Request, Response } from 'express';
import { asSingleString } from '../utils/validation.utils';
import { ListasPrecioService } from '../services/listas-precio.service';
import { IApiResponse } from '../types';

const listasPrecioService = new ListasPrecioService();

export class ListasPrecioController {

    async getAll(req: Request, res: Response): Promise<void> {
        try {
            const activoOnly = req.query.activo !== 'false';
            const listas = await listasPrecioService.getAll(activoOnly);
            const response: IApiResponse = {
                success: true,
                data: listas
            };
            res.json(response);
        } catch (error) {
            console.error('Error en getAll listas precio:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener listas de precio'
            });
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
            const lista = await listasPrecioService.getById(id);
            if (!lista) {
                res.status(404).json({
                    success: false,
                    error: 'Lista de precio no encontrada'
                });
                return;
            }
            const response: IApiResponse = {
                success: true,
                data: lista
            };
            res.json(response);
        } catch (error) {
            console.error('Error en getById listas precio:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener lista de precio'
            });
        }
    }

    async getByCodigo(req: Request, res: Response): Promise<void> {
        try {
            const codigo = asSingleString(req.params.codigo);
            if (!codigo) {
                res.status(400).json({
                    success: false,
                    error: 'Código inválido'
                });
                return;
            }
            const lista = await listasPrecioService.getByCodigo(codigo);
            if (!lista) {
                res.status(404).json({
                    success: false,
                    error: 'Lista de precio no encontrada'
                });
                return;
            }
            const response: IApiResponse = {
                success: true,
                data: lista
            };
            res.json(response);
        } catch (error) {
            console.error('Error en getByCodigo listas precio:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener lista de precio'
            });
        }
    }
}
