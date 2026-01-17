import { Request, Response } from 'express';
import { ProductosService } from '../services/productos.service';
import { IApiResponse } from '../types';
import { IProductoFilters, ICreateProductoDTO, IUpdateProductoDTO } from '../types/product.type';

const productosService = new ProductosService();

export class ProductosController {

    async getAll(req: Request, res: Response): Promise<void> {
        try {
            // Parsear filtros, aceptando códigos o IDs
            const id_cat = req.query.id_cat as string | undefined;
            const id_marca = req.query.id_marca as string | undefined;
            const codi_grupo = req.query.codi_grupo as string | undefined;

            const codi_impuesto = req.query.codi_impuesto as string | undefined;

            const filters: IProductoFilters = {
                page: parseInt(req.query.page as string) || 1,
                limit: parseInt(req.query.limit as string) || 100, // ⭐ Límite por defecto 100
                order_by: (req.query.order_by as any) || 'creado_en',
                order: (req.query.order as any) || 'desc',
                estado: req.query.estado !== undefined ? parseInt(req.query.estado as string) as 0 | 1 | 2 : undefined,
                activo: req.query.activo as string | undefined, // "A" = publicado, "I" = despublicado
                busqueda: req.query.busqueda as string,
                id_cat: id_cat ? (isNaN(Number(id_cat)) ? id_cat : Number(id_cat)) : undefined,
                id_marca: id_marca ? (isNaN(Number(id_marca)) ? id_marca : Number(id_marca)) : undefined,
                codi_grupo: codi_grupo,
                codi_impuesto: codi_impuesto ? (isNaN(Number(codi_impuesto)) ? codi_impuesto : Number(codi_impuesto)) : undefined,
                precio_min: req.query.precio_min ? parseFloat(req.query.precio_min as string) : undefined,
                precio_max: req.query.precio_max ? parseFloat(req.query.precio_max as string) : undefined,
                destacado: req.query.destacado === 'true' ? true : req.query.destacado === 'false' ? false : undefined,
                financiacion: req.query.financiacion === 'true' ? true : req.query.financiacion === 'false' ? false : undefined,
                stock_bajo: req.query.stock_bajo === 'true' ? true : req.query.stock_bajo === 'false' ? false : undefined,
            };

            const result = await productosService.getAll(filters);
            res.json(result);
        } catch (error) {
            console.error('Error en getAll:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener productos'
            });
        }
    }

    async getById(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            const producto = await productosService.getById(id);

            if (!producto) {
                res.status(404).json({
                    success: false,
                    error: 'Producto no encontrado o inactivo'
                });
                return;
            }

            const response: IApiResponse = {
                success: true,
                data: producto
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getById:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener producto'
            });
        }
    }

    async getByCodigo(req: Request, res: Response): Promise<void> {
        try {
            const codi_arti = req.params.codigo;

            if (!codi_arti) {
                res.status(400).json({
                    success: false,
                    error: 'Código inválido'
                });
                return;
            }

            const producto = await productosService.getByCodigo(codi_arti);

            if (!producto) {
                res.status(404).json({
                    success: false,
                    error: 'Producto no encontrado o inactivo'
                });
                return;
            }

            const response: IApiResponse = {
                success: true,
                data: producto
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getByCodigo:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener producto'
            });
        }
    }

    async create(req: Request, res: Response): Promise<void> {
        try {
            const data: ICreateProductoDTO = req.body;

            // Validaciones básicas
            if (!data.nombre || !data.precio) {
                res.status(400).json({
                    success: false,
                    error: 'Nombre y precio son requeridos'
                });
                return;
            }

            const nuevoProducto = await productosService.create(data);

            const response: IApiResponse = {
                success: true,
                data: nuevoProducto,
                message: 'Producto creado exitosamente'
            };

            res.status(201).json(response);
        } catch (error) {
            console.error('Error en create:', error);
            res.status(500).json({
                success: false,
                error: 'Error al crear producto'
            });
        }
    }

    async update(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const data: IUpdateProductoDTO = req.body;

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            // Verificar si el producto existe (cualquier estado excepto eliminado)
            const existe = await productosService.existsAny(id);
            if (!existe) {
                res.status(404).json({
                    success: false,
                    error: 'Producto no encontrado'
                });
                return;
            }

            const productoActualizado = await productosService.update(id, data);

            const response: IApiResponse = {
                success: true,
                data: productoActualizado,
                message: 'Producto actualizado exitosamente'
            };

            res.json(response);
        } catch (error) {
            console.error('Error en update:', error);
            res.status(500).json({
                success: false,
                error: 'Error al actualizar producto'
            });
        }
    }

    async delete(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            // Verificar si el producto existe y está activo
            const existe = await productosService.exists(id);
            if (!existe) {
                res.status(404).json({
                    success: false,
                    error: 'Producto no encontrado o ya está inactivo'
                });
                return;
            }

            await productosService.delete(id);

            const response: IApiResponse = {
                success: true,
                message: 'Producto eliminado exitosamente (soft delete)'
            };

            res.json(response);
        } catch (error) {
            console.error('Error en delete:', error);
            res.status(500).json({
                success: false,
                error: 'Error al eliminar producto'
            });
        }
    }

    async getDestacados(req: Request, res: Response): Promise<void> {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const productos = await productosService.getDestacados(limit);

            const response: IApiResponse = {
                success: true,
                data: productos
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getDestacados:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener productos destacados'
            });
        }
    }

    async getStockBajo(req: Request, res: Response): Promise<void> {
        try {
            const productos = await productosService.getStockBajo();

            const response: IApiResponse = {
                success: true,
                data: productos
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getStockBajo:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener productos con stock bajo'
            });
        }
    }

    async updateStock(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const { cantidad } = req.body;

            if (isNaN(id) || cantidad === undefined) {
                res.status(400).json({
                    success: false,
                    error: 'ID y cantidad son requeridos'
                });
                return;
            }

            const producto = await productosService.updateStock(id, cantidad);

            const response: IApiResponse = {
                success: true,
                data: producto,
                message: 'Stock actualizado exitosamente'
            };

            res.json(response);
        } catch (error) {
            console.error('Error en updateStock:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Error al actualizar stock'
            });
        }
    }

    async getContenidoCrearProducto(req: Request, res: Response): Promise<void> {
        try {
            const contenido = await productosService.getContenidoCrearProducto();

            const response: IApiResponse = {
                success: true,
                data: contenido
            };

            res.json(response);
        } catch (error) {
            console.error('Error en getContenidoCrearProducto:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener contenido para crear producto'
            });
        }
    }

    async toggleDestacado(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }

            const producto = await productosService.toggleDestacado(id);

            const mensaje = producto.destacado 
                ? `Producto "${producto.nombre}" marcado como destacado`
                : `Producto "${producto.nombre}" removido de destacados`;

            const response: IApiResponse = {
                success: true,
                data: producto,
                message: mensaje
            };

            console.log(`✅ ${mensaje}`);
            res.json(response);
        } catch (error) {
            console.error('Error en toggleDestacado:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Error al cambiar estado destacado'
            });
        }
    }

    async getProductosConImagenes(req: Request, res: Response): Promise<void> {
        try {
            // Parsear filtros, aceptando códigos o IDs
            const id_cat = req.query.id_cat as string | undefined;
            const id_marca = req.query.id_marca as string | undefined;
            const codi_grupo = req.query.codi_grupo as string | undefined;
            const codi_impuesto = req.query.codi_impuesto as string | undefined;

            const filters: IProductoFilters = {
                page: parseInt(req.query.page as string) || 1,
                limit: parseInt(req.query.limit as string) || 100,
                order_by: (req.query.order_by as any) || 'creado_en',
                order: (req.query.order as any) || 'desc',
                estado: req.query.estado !== undefined ? parseInt(req.query.estado as string) as 0 | 1 : undefined,
                busqueda: req.query.busqueda as string,
                id_cat: id_cat ? (isNaN(Number(id_cat)) ? id_cat : Number(id_cat)) : undefined,
                id_marca: id_marca ? (isNaN(Number(id_marca)) ? id_marca : Number(id_marca)) : undefined,
                codi_grupo: codi_grupo,
                codi_impuesto: codi_impuesto ? (isNaN(Number(codi_impuesto)) ? codi_impuesto : Number(codi_impuesto)) : undefined,
                precio_min: req.query.precio_min ? parseFloat(req.query.precio_min as string) : undefined,
                precio_max: req.query.precio_max ? parseFloat(req.query.precio_max as string) : undefined,
                destacado: req.query.destacado === 'true' ? true : req.query.destacado === 'false' ? false : undefined,
                financiacion: req.query.financiacion === 'true' ? true : req.query.financiacion === 'false' ? false : undefined,
                stock_bajo: req.query.stock_bajo === 'true' ? true : req.query.stock_bajo === 'false' ? false : undefined,
            };

            const result = await productosService.getProductosConImagenes(filters);
            res.json(result);
        } catch (error) {
            console.error('Error en getProductosConImagenes:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener productos con imágenes'
            });
        }
    }
}