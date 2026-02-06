import { Request, Response } from 'express';
import { asSingleString } from '../utils/validation.utils';
import { GruposService, ICreateGrupoDTO, IUpdateGrupoDTO } from '../services/grupos.service';
import { IApiResponse } from '../types';

const gruposService = new GruposService();

export class GruposController {

    async getAll(req: Request, res: Response): Promise<void> {
        try {
            const grupos = await gruposService.getAll();
            
            const response: IApiResponse = {
                success: true,
                data: grupos
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getAll:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener grupos'
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

            const grupo = await gruposService.getById(id);

            if (!grupo) {
                res.status(404).json({
                    success: false,
                    error: 'Grupo no encontrado'
                });
                return;
            }

            const response: IApiResponse = {
                success: true,
                data: grupo
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getById:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener grupo'
            });
        }
    }

    async getSiguienteCodigo(req: Request, res: Response): Promise<void> {
        try {
            const codigo = await gruposService.getSiguienteCodigo();
            res.json({
                success: true,
                data: { codigo }
            });
        } catch (error) {
            console.error('Error en getSiguienteCodigo:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener siguiente código'
            });
        }
    }

    async getByCodigo(req: Request, res: Response): Promise<void> {
        try {
            const codi_grupo = asSingleString(req.params.codigo);

            if (!codi_grupo) {
                res.status(400).json({
                    success: false,
                    error: 'Código inválido'
                });
                return;
            }

            const grupo = await gruposService.getByCodigo(codi_grupo);

            if (!grupo) {
                res.status(404).json({
                    success: false,
                    error: 'Grupo no encontrado'
                });
                return;
            }

            const response: IApiResponse = {
                success: true,
                data: grupo
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getByCodigo:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener grupo'
            });
        }
    }

    async create(req: Request, res: Response): Promise<void> {
        try {
            const data: ICreateGrupoDTO = req.body;

            // Validaciones básicas
            if (!data.codi_grupo || data.codi_grupo.trim() === '') {
                res.status(400).json({
                    success: false,
                    error: 'El código de grupo es requerido'
                });
                return;
            }

            // Verificar si ya existe un grupo con ese código
            const existe = await gruposService.existsByCodigo(data.codi_grupo);
            if (existe) {
                res.status(400).json({
                    success: false,
                    error: 'Ya existe un grupo con ese código'
                });
                return;
            }

            await gruposService.create(data);

            const response: IApiResponse = {
                success: true,
                message: 'Grupo creado exitosamente'
            };

            res.status(201).json(response);
        } catch (error) {
            console.error('Error en create:', error);
            res.status(500).json({
                success: false,
                error: 'Error al crear grupo'
            });
        }
    }

    async update(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));
            const data: IUpdateGrupoDTO = req.body;

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            // Verificar si existe
            const existe = await gruposService.exists(id);
            if (!existe) {
                res.status(404).json({
                    success: false,
                    error: 'Grupo no encontrado'
                });
                return;
            }

            const grupoActualizado = await gruposService.update(id, data);

            const response: IApiResponse = {
                success: true,
                data: grupoActualizado,
                message: 'Grupo actualizado exitosamente'
            };

            res.json(response);
        } catch (error) {
            console.error('Error en update:', error);
            res.status(500).json({
                success: false,
                error: 'Error al actualizar grupo'
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
            const existe = await gruposService.exists(id);
            if (!existe) {
                res.status(404).json({
                    success: false,
                    error: 'Grupo no encontrado'
                });
                return;
            }

            await gruposService.delete(id);

            const response: IApiResponse = {
                success: true,
                message: 'Grupo eliminado exitosamente'
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
                error: 'Error al eliminar grupo'
            });
        }
    }
}

