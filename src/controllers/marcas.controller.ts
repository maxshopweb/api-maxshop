// src/controllers/marcas.controller.ts
import { Request, Response } from 'express';
import { asSingleString } from '../utils/validation.utils';
import { parseAdminListQuery, shouldPaginateAdminList } from '../utils/adminPaginationQuery';
import { MarcasService } from '../services/marcas.service';
import { ICreateMarcaDTO, IUpdateMarcaDTO } from '../types/index';
import { IApiResponse } from '../types';

const marcasService = new MarcasService();

export class MarcasController {

    async getAll(req: Request, res: Response): Promise<void> {
        try {
            if (shouldPaginateAdminList(req)) {
                const { page, limit, busqueda } = parseAdminListQuery(req);
                const result = await marcasService.getPaginated(page, limit, busqueda);
                res.json({
                    success: true,
                    data: result.data,
                    pagination: result.pagination,
                });
                return;
            }

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

    async getSiguienteCodigo(req: Request, res: Response): Promise<void> {
        try {
            const codigo = await marcasService.getSiguienteCodigo();
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

            const auditContext = req.authenticatedUser
                ? {
                      userId: req.authenticatedUser.id,
                      userAgent: req.headers['user-agent']?.toString() ?? null,
                      endpoint: req.originalUrl,
                  }
                : undefined;
            await marcasService.create(data, auditContext);

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

            const auditContext = req.authenticatedUser
                ? {
                      userId: req.authenticatedUser.id,
                      userAgent: req.headers['user-agent']?.toString() ?? null,
                      endpoint: req.originalUrl,
                  }
                : undefined;
            const marcaActualizada = await marcasService.update(id, data, auditContext);

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

            const auditContext = req.authenticatedUser
                ? {
                      userId: req.authenticatedUser.id,
                      userAgent: req.headers['user-agent']?.toString() ?? null,
                      endpoint: req.originalUrl,
                  }
                : undefined;
            await marcasService.delete(id, auditContext);

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

    async getAllActive(req: Request, res: Response): Promise<void> {
        try {
            const marcas = await marcasService.getAllActive();
            res.json({
                success: true,
                data: marcas
            });
        } catch (error) {
            console.error('Error en getAllActive:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener marcas activas'
            });
        }
    }

    async toggleActivo(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));
            const { activo } = req.body;

            if (isNaN(id)) {
                res.status(400).json({ success: false, error: 'ID inválido' });
                return;
            }

            if (typeof activo !== 'boolean') {
                res.status(400).json({ success: false, error: 'El campo activo es requerido y debe ser booleano' });
                return;
            }

            const auditContext = req.authenticatedUser
                ? {
                      userId: req.authenticatedUser.id,
                      userAgent: req.headers['user-agent']?.toString() ?? null,
                      endpoint: req.originalUrl,
                  }
                : undefined;

            const marca = await marcasService.toggleActivo(id, activo, auditContext);
            res.json({
                success: true,
                data: marca,
                message: `Marca ${activo ? 'habilitada' : 'deshabilitada'} exitosamente`
            });
        } catch (error) {
            console.error('Error en toggleActivo:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Error al togglear estado'
            });
        }
    }

    async toggleAllActivos(req: Request, res: Response): Promise<void> {
        try {
            const { activo } = req.body;

            if (typeof activo !== 'boolean') {
                res.status(400).json({ success: false, error: 'El campo activo es requerido y debe ser booleano' });
                return;
            }

            const auditContext = req.authenticatedUser
                ? {
                      userId: req.authenticatedUser.id,
                      userAgent: req.headers['user-agent']?.toString() ?? null,
                      endpoint: req.originalUrl,
                  }
                : undefined;

            const result = await marcasService.toggleAllActivos(activo, auditContext);
            res.json({
                success: true,
                data: result,
                message: `${result.count} marca(s) ${activo ? 'habilitada(s)' : 'deshabilitada(s)'} exitosamente`
            });
        } catch (error) {
            console.error('Error en toggleAllActivos:', error);
            res.status(500).json({
                success: false,
                error: 'Error al togglear todos los estados'
            });
        }
    }
}
