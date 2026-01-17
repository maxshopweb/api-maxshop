import { Request, Response } from 'express';
import { direccionesService, ICreateDireccionDTO, IUpdateDireccionDTO } from '../services/direcciones.service';
import { IApiResponse } from '../types';

export class DireccionesController {
    async getByUsuario(req: Request, res: Response): Promise<void> {
        try {
            const idUsuario = req.authenticatedUser?.id;
            
            if (!idUsuario) {
                res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
                return;
            }

            const direcciones = await direccionesService.getByUsuario(idUsuario);

            const response: IApiResponse = {
                success: true,
                data: direcciones
            };

            res.json(response);
        } catch (error: any) {
            console.error('Error en getByUsuario:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Error al obtener direcciones'
            });
        }
    }

    async create(req: Request, res: Response): Promise<void> {
        try {
            const idUsuario = req.authenticatedUser?.id;
            const data: ICreateDireccionDTO = req.body;

            if (!idUsuario) {
                res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
                return;
            }

            const direccion = await direccionesService.create(data, idUsuario);

            const response: IApiResponse = {
                success: true,
                data: direccion,
                message: 'Dirección creada exitosamente'
            };

            res.status(201).json(response);
        } catch (error: any) {
            console.error('Error en create:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Error al crear dirección'
            });
        }
    }

    async update(req: Request, res: Response): Promise<void> {
        try {
            const idUsuario = req.authenticatedUser?.id;
            const idDireccion = req.params.id;
            const data: IUpdateDireccionDTO = req.body;

            if (!idUsuario) {
                res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
                return;
            }

            const direccion = await direccionesService.update(idDireccion, data, idUsuario);

            const response: IApiResponse = {
                success: true,
                data: direccion,
                message: 'Dirección actualizada exitosamente'
            };

            res.json(response);
        } catch (error: any) {
            console.error('Error en update:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Error al actualizar dirección'
            });
        }
    }

    async delete(req: Request, res: Response): Promise<void> {
        try {
            const idUsuario = req.authenticatedUser?.id;
            const idDireccion = req.params.id;

            if (!idUsuario) {
                res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
                return;
            }

            await direccionesService.delete(idDireccion, idUsuario);

            const response: IApiResponse = {
                success: true,
                message: 'Dirección eliminada exitosamente'
            };

            res.json(response);
        } catch (error: any) {
            console.error('Error en delete:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Error al eliminar dirección'
            });
        }
    }

    async setPrincipal(req: Request, res: Response): Promise<void> {
        try {
            const idUsuario = req.authenticatedUser?.id;
            const idDireccion = req.params.id;

            if (!idUsuario) {
                res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
                return;
            }

            const direccion = await direccionesService.setPrincipal(idDireccion, idUsuario);

            const response: IApiResponse = {
                success: true,
                data: direccion,
                message: 'Dirección marcada como principal'
            };

            res.json(response);
        } catch (error: any) {
            console.error('Error en setPrincipal:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Error al marcar dirección como principal'
            });
        }
    }
}

