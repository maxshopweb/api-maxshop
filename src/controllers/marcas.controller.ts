// src/controllers/marcas.controller.ts
import { Request, Response } from 'express';
import { asSingleString } from '../utils/validation.utils';
import { MarcasService } from '../services/marcas.service';
import { ICreateMarcaDTO, IUpdateMarcaDTO } from '../types/index';
import { IApiResponse } from '../types';

const marcasService = new MarcasService();

export class MarcasController {

    async getAll(req: Request, res: Response): Promise<void> {
        try {
            const marcas = await marcasService.getAll();
            
            const response: IApiResponse = {
                success: true,
                data: marcas
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getAll:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener marcas'
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

            const marca = await marcasService.getById(id);

            if (!marca) {
                res.status(404).json({
                    success: false,
                    error: 'Marca no encontrada'
                });
                return;
            }

            const response: IApiResponse = {
                success: true,
                data: marca
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getById:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener marca'
            });
        }
    }

    async getByCodigo(req: Request, res: Response): Promise<void> {
        try {
            const codi_marca = asSingleString(req.params.codigo);

            if (!codi_marca) {
                res.status(400).json({
                    success: false,
                    error: 'Código inválido'
                });
                return;
            }

            const marca = await marcasService.getByCodigo(codi_marca);

            if (!marca) {
                res.status(404).json({
                    success: false,
                    error: 'Marca no encontrada'
                });
                return;
            }

            const response: IApiResponse = {
                success: true,
                data: marca
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getByCodigo:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener marca'
            });
        }
    }

    async create(req: Request, res: Response): Promise<void> {
        try {
            const data: ICreateMarcaDTO = req.body;

            // Validaciones básicas
            if (!data.nombre || data.nombre.trim() === '') {
                res.status(400).json({
                    success: false,
                    error: 'El nombre es requerido'
                });
                return;
            }

            await marcasService.create(data);

            const response: IApiResponse = {
                success: true,
                message: 'Marca creada exitosamente'
            };

            res.status(201).json(response);
        } catch (error) {
            console.error('Error en create:', error);
            res.status(500).json({
                success: false,
                error: 'Error al crear marca'
            });
        }
    }

    async update(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));
            const data: IUpdateMarcaDTO = req.body;

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            // Verificar si existe
            const existe = await marcasService.exists(id);
            if (!existe) {
                res.status(404).json({
                    success: false,
                    error: 'Marca no encontrada'
                });
                return;
            }

            const marcaActualizada = await marcasService.update(id, data);

            const response: IApiResponse = {
                success: true,
                data: marcaActualizada,
                message: 'Marca actualizada exitosamente'
            };

            res.json(response);
        } catch (error) {
            console.error('Error en update:', error);
            res.status(500).json({
                success: false,
                error: 'Error al actualizar marca'
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

            // Verificar si existe
            const existe = await marcasService.exists(id);
            if (!existe) {
                res.status(404).json({
                    success: false,
                    error: 'Marca no encontrada'
                });
                return;
            }

            await marcasService.delete(id);

            const response: IApiResponse = {
                success: true,
                message: 'Marca eliminada exitosamente'
            };

            res.json(response);
        } catch (error) {
            console.error('Error en delete:', error);
            
            // Si el error es por productos asociados, enviar mensaje específico
            if (error instanceof Error && error.message.includes('producto(s) asociado(s)')) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }

            res.status(500).json({
                success: false,
                error: 'Error al eliminar marca'
            });
        }
    }
}
