import { Request, Response } from 'express';
import { asSingleString } from '../utils/validation.utils';
import { parseAdminListQuery, shouldPaginateAdminList } from '../utils/adminPaginationQuery';
import { CategoriasService } from '../services/categorias.service';
import { 
    ICreateCategoriaDTO, 
    IUpdateCategoriaDTO,
} from '../types/categoria.type';
import { IApiResponse } from '../types/index';

const categoriasService = new CategoriasService();

export class CategoriasController {

    // ========================================
    // CONTROLADORES PARA CATEGORÍAS
    // ========================================

    async getAllCategorias(req: Request, res: Response): Promise<void> {
        try {
            if (shouldPaginateAdminList(req)) {
                const { page, limit, busqueda } = parseAdminListQuery(req);
                const result = await categoriasService.getCategoriasPaginated(page, limit, busqueda);
                res.json({
                    success: true,
                    data: result.data,
                    pagination: result.pagination,
                });
                return;
            }

            const categorias = await categoriasService.getAllCategorias();
            
            const response: IApiResponse = {
                success: true,
                data: categorias
            };

            res.json(response);
        } catch (error) {
            console.error('❌ Error en getAllCategorias:', error);
            console.error('📋 Tipo de error:', typeof error);
            console.error('📝 Mensaje:', error instanceof Error ? error.message : 'Sin mensaje');
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Error al obtener categorías'
            });
        }
    }

    async getCategoriaById(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            const categoria = await categoriasService.getCategoriaById(id);

            if (!categoria) {
                res.status(404).json({
                    success: false,
                    error: 'Categoría no encontrada'
                });
                return;
            }

            const response: IApiResponse = {
                success: true,
                data: categoria
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getCategoriaById:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener categoría'
            });
        }
    }

    async getSiguienteCodigo(req: Request, res: Response): Promise<void> {
        try {
            const codigo = await categoriasService.getSiguienteCodigo();
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

    async getCategoriaByCodigo(req: Request, res: Response): Promise<void> {
        try {
            const codi_categoria = asSingleString(req.params.codigo);

            if (!codi_categoria) {
                res.status(400).json({
                    success: false,
                    error: 'Código inválido'
                });
                return;
            }

            const categoria = await categoriasService.getCategoriaByCodigo(codi_categoria);

            if (!categoria) {
                res.status(404).json({
                    success: false,
                    error: 'Categoría no encontrada'
                });
                return;
            }

            const response: IApiResponse = {
                success: true,
                data: categoria
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getCategoriaByCodigo:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener categoría'
            });
        }
    }

    async createCategoria(req: Request, res: Response): Promise<void> {
        try {
            const data: ICreateCategoriaDTO = req.body;

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
            await categoriasService.createCategoria(data, auditContext);

            const response: IApiResponse = {
                success: true,
                message: 'Categoría creada exitosamente'
            };

            res.status(201).json(response);
        } catch (error) {
            console.error('Error en createCategoria:', error);
            res.status(500).json({
                success: false,
                error: 'Error al crear categoría'
            });
        }
    }

    async updateCategoria(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));
            const data: IUpdateCategoriaDTO = req.body;

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            // Verificar si existe
            const existe = await categoriasService.categoriaExists(id);
            if (!existe) {
                res.status(404).json({
                    success: false,
                    error: 'Categoría no encontrada'
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
            const categoriaActualizada = await categoriasService.updateCategoria(id, data, auditContext);

            const response: IApiResponse = {
                success: true,
                data: categoriaActualizada,
                message: 'Categoría actualizada exitosamente'
            };

            res.json(response);
        } catch (error) {
            console.error('Error en updateCategoria:', error);
            res.status(500).json({
                success: false,
                error: 'Error al actualizar categoría'
            });
        }
    }

    async deleteCategoria(req: Request, res: Response): Promise<void> {
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
            const existe = await categoriasService.categoriaExists(id);
            if (!existe) {
                res.status(404).json({
                    success: false,
                    error: 'Categoría no encontrada'
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
            await categoriasService.deleteCategoria(id, auditContext);

            const response: IApiResponse = {
                success: true,
                message: 'Categoría eliminada exitosamente'
            };

            res.json(response);
        } catch (error) {
            console.error('Error en deleteCategoria:', error);
            
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
                error: 'Error al eliminar categoría'
            });
        }
    }

}
