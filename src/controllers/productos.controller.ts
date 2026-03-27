import { Request, Response } from 'express';
import { asSingleString } from '../utils/validation.utils';
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
                busqueda: (req.query.busqueda || req.query.search) as string, // Soporte para ambos: busqueda y search
                id_cat: id_cat ? (isNaN(Number(id_cat)) ? id_cat : Number(id_cat)) : undefined,
                id_marca: id_marca ? (isNaN(Number(id_marca)) ? id_marca : Number(id_marca)) : undefined,
                codi_grupo: codi_grupo,
                codi_impuesto: codi_impuesto ? (isNaN(Number(codi_impuesto)) ? codi_impuesto : Number(codi_impuesto)) : undefined,
                precio_min: req.query.precio_min ? parseFloat(req.query.precio_min as string) : undefined,
                precio_max: req.query.precio_max ? parseFloat(req.query.precio_max as string) : undefined,
                destacado: req.query.destacado === 'true' ? true : req.query.destacado === 'false' ? false : undefined,
                publicado: req.query.publicado === 'true' ? true : req.query.publicado === 'false' ? false : undefined,
                financiacion: req.query.financiacion === 'true' ? true : req.query.financiacion === 'false' ? false : undefined,
                oferta: req.query.oferta === 'true' ? true : req.query.oferta === 'false' ? false : undefined,
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
            const id = parseInt(asSingleString(req.params.id));

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
            const codi_arti = asSingleString(req.params.codigo);

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

            // Compatibilidad: si envían "precio" lo mapeamos a precio_venta
            if ((data as any).precio != null) {
                data.precio_venta = (data as any).precio;
            }

            const tienePrecio = data.precio_venta != null || data.precio_especial != null || data.precio_pvp != null || data.precio_campanya != null
                || ((data.lista_precio_activa as string)?.toUpperCase() === 'E' && data.precio_manual != null);
            if (!data.nombre || !tienePrecio) {
                res.status(400).json({
                    success: false,
                    error: 'Nombre y al menos un precio por lista (precio_venta/V, precio_especial/O, precio_pvp/P, precio_campanya/Q, o lista E con precio_manual) son requeridos'
                });
                return;
            }
            const listasValidas = ['V', 'O', 'P', 'Q', 'E'];
            if (data.lista_precio_activa != null && data.lista_precio_activa !== '' && !listasValidas.includes((data.lista_precio_activa as string).toUpperCase())) {
                res.status(400).json({
                    success: false,
                    error: 'lista_precio_activa debe ser uno de: V, O, P, Q, E'
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
            const producto = await productosService.create(data, auditContext);

            const response: IApiResponse = {
                success: true,
                data: producto,
                message: 'Producto creado exitosamente'
            };

            res.status(201).json(response);
        } catch (error: any) {
            console.error('Error en create:', error);
            if (error?.code === 'P2002' && error?.meta?.target?.includes('codi_arti')) {
                res.status(409).json({
                    success: false,
                    error: 'Ya existe un producto con ese código de artículo. Usá otro código.'
                });
                return;
            }
            if (error?.code === 'P2000') {
                res.status(400).json({
                    success: false,
                    error: 'Algún dato es demasiado largo. Código de artículo máx. 10 caracteres, nombre 255, código de barras 22, unidad de medida 3.'
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: error?.message || 'Error al crear producto'
            });
        }
    }

    async update(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));
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
            const listasValidas = ['V', 'O', 'P', 'Q', 'E'];
            if (data.lista_precio_activa != null && data.lista_precio_activa !== '' && !listasValidas.includes((data.lista_precio_activa as string).toUpperCase())) {
                res.status(400).json({
                    success: false,
                    error: 'lista_precio_activa debe ser uno de: V, O, P, Q, E'
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
            const producto = await productosService.update(id, data, auditContext);

            const response: IApiResponse = {
                success: true,
                data: producto,
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
            const id = parseInt(asSingleString(req.params.id));

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

            const auditContext = req.authenticatedUser
                ? {
                    userId: req.authenticatedUser.id,
                    userAgent: req.headers['user-agent']?.toString() ?? null,
                    endpoint: req.originalUrl,
                }
                : undefined;
            await productosService.delete(id, auditContext);

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
            const id = parseInt(asSingleString(req.params.id));
            const { cantidad } = req.body;

            if (isNaN(id) || cantidad === undefined) {
                res.status(400).json({
                    success: false,
                    error: 'ID y cantidad son requeridos'
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
            const producto = await productosService.updateStock(id, cantidad, auditContext);

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

    /**
     * PATCH /api/productos/:id/reanudar-sync-erp
     * Quita el bloqueo manual (`precio_editado_manualmente`) para que la próxima sync FTP/CSV
     * vuelva a actualizar stock, precios y maestros de este producto. Solo admin.
     */
    async reanudarSincronizacionErp(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));
            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
                });
                return;
            }
            const producto = await productosService.reanudarSincronizacionErp(id);
            res.json({
                success: true,
                data: producto,
                message:
                    'La sincronización con FTP/CSV volverá a actualizar este producto (stock, precios y datos maestros) en la próxima ejecución.'
            });
        } catch (error) {
            if (error instanceof Error && error.message === 'Producto no encontrado') {
                res.status(404).json({
                    success: false,
                    error: 'Producto no encontrado'
                });
                return;
            }
            console.error('Error en reanudarSincronizacionErp:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Error al reanudar sincronización ERP'
            });
        }
    }

    /**
     * POST /api/productos/:id/restaurar-desde-erp
     * Descarga MAESARTI/MAESSTOK/MAESPREC por FTP, convierte a CSV y aplica solo este producto. Solo admin.
     */
    async restaurarProductoDesdeErp(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));
            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido',
                });
                return;
            }
            const producto = await productosService.restaurarProductoDesdeErp(id);
            res.json({
                success: true,
                data: producto,
                message:
                    'Producto actualizado desde el ERP: últimos datos descargados por FTP y aplicados a este artículo.',
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (msg === 'Producto no encontrado') {
                res.status(404).json({ success: false, error: msg });
                return;
            }
            if (msg.includes('no tiene codi_arti')) {
                res.status(422).json({ success: false, error: msg });
                return;
            }
            if (msg.includes('no está en el CSV actual')) {
                res.status(422).json({ success: false, error: msg });
                return;
            }
            if (
                msg.includes('Error de conexión FTP')
                || msg.includes('Error al listar archivos')
                || msg.includes('Error al descargar archivo')
            ) {
                res.status(503).json({ success: false, error: msg });
                return;
            }
            if (msg.includes('No se encontró') && msg.includes('.DBF') && msg.includes('FTP')) {
                res.status(400).json({ success: false, error: msg });
                return;
            }
            if (msg.includes('Tras la descarga FTP')) {
                res.status(502).json({ success: false, error: msg });
                return;
            }
            if (
                msg.includes('No existe MAESARTI.csv')
                || msg.includes('No existe MAESSTOK.csv')
                || msg.includes('maesprec')
                || msg.includes('CSV de precios')
            ) {
                res.status(400).json({ success: false, error: msg });
                return;
            }
            if (
                msg === 'codi_arti inválido'
                || msg.includes('MAESARTI.csv está vacío')
                || msg.includes('no se encontró la columna CODIARTI')
            ) {
                res.status(400).json({ success: false, error: msg });
                return;
            }
            console.error('Error en restaurarProductoDesdeErp:', error);
            res.status(500).json({
                success: false,
                error: msg,
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
            const id = parseInt(asSingleString(req.params.id));

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
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
            const producto = await productosService.toggleDestacado(id, auditContext);

            const mensaje = producto.destacado 
                ? `Producto "${producto.nombre}" marcado como destacado`
                : `Producto "${producto.nombre}" removido de destacados`;

            const response: IApiResponse = {
                success: true,
                data: producto,
                message: mensaje
            };

            res.json(response);
        } catch (error) {
            console.error('Error en toggleDestacado:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Error al cambiar estado destacado'
            });
        }
    }

    async togglePublicado(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(asSingleString(req.params.id));

            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: 'ID inválido'
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
            const producto = await productosService.togglePublicado(id, auditContext);

            const mensaje = producto.publicado
                ? `Producto "${producto.nombre}" publicado`
                : `Producto "${producto.nombre}" despublicado`;

            const response: IApiResponse = {
                success: true,
                data: producto,
                message: mensaje
            };

            res.json(response);
        } catch (error) {
            console.error('Error en togglePublicado:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Error al cambiar estado publicado'
            });
        }
    }

    async bulkSetPublicado(req: Request, res: Response): Promise<void> {
        try {
            const { ids, publicado } = req.body as { ids?: number[]; publicado?: boolean };

            if (!Array.isArray(ids) || ids.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'Se requiere un array "ids" no vacío'
                });
                return;
            }

            if (typeof publicado !== 'boolean') {
                res.status(400).json({
                    success: false,
                    error: 'Se requiere "publicado" (boolean)'
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
            const result = await productosService.bulkSetPublicado(ids, publicado, auditContext);

            const response: IApiResponse = {
                success: true,
                data: result,
                message: `${result.count} producto(s) ${publicado ? 'publicado(s)' : 'despublicado(s)'}`
            };

            res.json(response);
        } catch (error) {
            console.error('Error en bulkSetPublicado:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Error al actualizar estado publicado'
            });
        }
    }

    /** PATCH /api/productos/bulk/cuotas - ids: number[], cuotas_habilitadas: true | false | null */
    async bulkUpdateCuotas(req: Request, res: Response): Promise<void> {
        try {
            const { ids, cuotas_habilitadas } = req.body as { ids?: number[]; cuotas_habilitadas?: boolean | null };

            if (!Array.isArray(ids) || ids.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'Se requiere un array "ids" no vacío'
                });
                return;
            }

            if (cuotas_habilitadas !== true && cuotas_habilitadas !== false && cuotas_habilitadas !== null) {
                res.status(400).json({
                    success: false,
                    error: 'cuotas_habilitadas debe ser true, false o null (regla general)'
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
            const result = await productosService.bulkUpdateCuotas(ids, cuotas_habilitadas, auditContext);

            const msg = cuotas_habilitadas === null ? 'regla general' : cuotas_habilitadas ? '3 cuotas habilitadas' : '3 cuotas deshabilitadas';
            res.json({
                success: true,
                data: result,
                message: `${result.updated} producto(s) actualizado(s): ${msg}`
            });
        } catch (error) {
            console.error('Error en bulkUpdateCuotas:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Error al actualizar cuotas'
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
                busqueda: (req.query.busqueda || req.query.search) as string, // Soporte para ambos: busqueda y search
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

    // Endpoint tienda: solo productos activos + publicados; filtros opcionales (categoría, marca, grupo, etc.)
    async getProductosTienda(req: Request, res: Response): Promise<void> {
        try {
            const id_cat = req.query.id_cat as string | undefined;
            const id_marca = req.query.id_marca as string | undefined;
            const codi_grupo = req.query.codi_grupo as string | undefined;

            const filters: IProductoFilters = {
                page: parseInt(req.query.page as string) || 1,
                limit: parseInt(req.query.limit as string) || 21,
                order_by: (req.query.order_by as any) || 'creado_en',
                order: (req.query.order as any) || 'desc',
                busqueda: (req.query.busqueda || req.query.search) as string,
                id_cat: id_cat ? (isNaN(Number(id_cat)) ? id_cat : Number(id_cat)) : undefined,
                id_marca: id_marca ? (isNaN(Number(id_marca)) ? id_marca : Number(id_marca)) : undefined,
                codi_grupo: codi_grupo,
                precio_min: req.query.precio_min ? parseFloat(req.query.precio_min as string) : undefined,
                precio_max: req.query.precio_max ? parseFloat(req.query.precio_max as string) : undefined,
                destacado: req.query.destacado === 'true' ? true : req.query.destacado === 'false' ? false : undefined,
                financiacion: req.query.financiacion === 'true' ? true : req.query.financiacion === 'false' ? false : undefined,
                oferta: req.query.oferta === 'true' ? true : req.query.oferta === 'false' ? false : undefined,
            };

            const result = await productosService.getProductosTienda(filters);
            res.json(result);
        } catch (error) {
            console.error('Error en getProductosTienda:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener productos de tienda'
            });
        }
    }
}
