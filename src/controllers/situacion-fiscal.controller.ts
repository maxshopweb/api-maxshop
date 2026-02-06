import { Request, Response } from 'express';
import { asSingleString } from '../utils/validation.utils';
import { SituacionFiscalService } from '../services/situacion-fiscal.service';
import { IApiResponse } from '../types';

const situacionFiscalService = new SituacionFiscalService();

export class SituacionFiscalController {

    async getAll(req: Request, res: Response): Promise<void> {
        try {
            const activoOnly = req.query.activo !== 'false';
            const situaciones = await situacionFiscalService.getAll(activoOnly);
            const response: IApiResponse = {
                success: true,
                data: situaciones
            };
            res.json(response);
        } catch (error) {
            console.error('Error en getAll situacion fiscal:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener situaciones fiscales'
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
            const situacion = await situacionFiscalService.getById(id);
            if (!situacion) {
                res.status(404).json({
                    success: false,
                    error: 'Situación fiscal no encontrada'
                });
                return;
            }
            const response: IApiResponse = {
                success: true,
                data: situacion
            };
            res.json(response);
        } catch (error) {
            console.error('Error en getById situacion fiscal:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener situación fiscal'
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
            const situacion = await situacionFiscalService.getByCodigo(codigo);
            if (!situacion) {
                res.status(404).json({
                    success: false,
                    error: 'Situación fiscal no encontrada'
                });
                return;
            }
            const response: IApiResponse = {
                success: true,
                data: situacion
            };
            res.json(response);
        } catch (error) {
            console.error('Error en getByCodigo situacion fiscal:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener situación fiscal'
            });
        }
    }
}
