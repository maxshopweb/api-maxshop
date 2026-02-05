// src/middlewares/validarProducto.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { asSingleString } from '../utils/validation.utils';
import { prisma } from '../index';

/**
 * Middleware para validar que un producto existe, está activo y cumple condiciones
 */
export const validarProductoActivo = async (
    req: Request, 
    res: Response, 
    next: NextFunction
): Promise<void> => {
    try {
        const id = parseInt(asSingleString(req.params.id));

        if (isNaN(id)) {
            res.status(400).json({
                success: false,
                error: 'ID de producto inválido'
            });
            return;
        }

        const producto = await prisma.productos.findFirst({
            where: { id_prod: id }
        });

        // Validar existencia
        if (!producto) {
            console.error(`❌ [Validación] Producto ID ${id} no encontrado`);
            res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
            return;
        }

        // Validar que NO esté eliminado (estado: 0)
        // Permitir operar sobre productos activos (estado: 1) e inactivos (estado: 2)
        if (producto.estado === 0) {
            console.error(`❌ [Validación] Producto ID ${id} está eliminado (soft delete)`);
            res.status(400).json({
                success: false,
                error: 'No se puede operar sobre un producto eliminado'
            });
            return;
        }

        // Permitir operar sobre productos con estado 1 (activo) o 2 (inactivo)
        // Solo bloquear si está eliminado (estado: 0)

        
        // Adjuntar producto al request para uso posterior
        (req as any).producto = producto;
        
        next();
    } catch (error) {
        console.error('❌ [Validación] Error en validarProductoActivo:', error);
        res.status(500).json({
            success: false,
            error: 'Error al validar producto'
        });
    }
};

/**
 * Middleware para validar que un producto tiene stock disponible
 */
export const validarStockDisponible = async (
    req: Request, 
    res: Response, 
    next: NextFunction
): Promise<void> => {
    try {
        const producto = (req as any).producto;

        if (!producto) {
            res.status(500).json({
                success: false,
                error: 'Error: producto no encontrado en el contexto'
            });
            return;
        }

        const stockActual = producto.stock || 0;

        if (stockActual <= 0) {
            console.error(`❌ [Validación] Producto "${producto.nombre}" sin stock (stock: ${stockActual})`);
            res.status(400).json({
                success: false,
                error: `El producto "${producto.nombre}" no tiene stock disponible (stock actual: ${stockActual})`
            });
            return;
        }

        next();
    } catch (error) {
        console.error('❌ [Validación] Error en validarStockDisponible:', error);
        res.status(500).json({
            success: false,
            error: 'Error al validar stock'
        });
    }
};

/**
 * Middleware para validar que las relaciones del producto son válidas
 * (marca, categoría, grupo, IVA) - usando códigos CSV
 */
export const validarRelacionesProducto = async (
    req: Request, 
    res: Response, 
    next: NextFunction
): Promise<void> => {
    try {
        const { codi_marca, codi_categoria, codi_grupo, codi_impuesto } = req.body;

        // Validar marca si se proporciona
        if (codi_marca) {
            const marca = await prisma.marca.findUnique({
                where: { codi_marca }
            });

            if (!marca) {
                console.error(`❌ [Validación] Marca código ${codi_marca} no encontrada`);
                res.status(400).json({
                    success: false,
                    error: `La marca especificada (código: ${codi_marca}) no existe`
                });
                return;
            }
        }

        // Validar categoría si se proporciona
        if (codi_categoria) {
            const categoria = await prisma.categoria.findUnique({
                where: { codi_categoria }
            });

            if (!categoria) {
                console.error(`❌ [Validación] Categoría código ${codi_categoria} no encontrada`);
                res.status(400).json({
                    success: false,
                    error: `La categoría especificada (código: ${codi_categoria}) no existe`
                });
                return;
            }
        }

        // Validar grupo si se proporciona
        if (codi_grupo) {
            const grupo = await prisma.grupo.findUnique({
                where: { codi_grupo }
            });

            if (!grupo) {
                console.error(`❌ [Validación] Grupo código ${codi_grupo} no encontrado`);
                res.status(400).json({
                    success: false,
                    error: `El grupo especificado (código: ${codi_grupo}) no existe`
                });
                return;
            }
        }

        // Validar IVA si se proporciona
        if (codi_impuesto) {
            const iva = await prisma.iva.findUnique({
                where: { codi_impuesto }
            });

            if (!iva) {
                console.error(`❌ [Validación] IVA código ${codi_impuesto} no encontrado`);
                res.status(400).json({
                    success: false,
                    error: `El tipo de IVA especificado (código: ${codi_impuesto}) no existe`
                });
                return;
            }
        }

        next();
    } catch (error) {
        console.error('❌ [Validación] Error en validarRelacionesProducto:', error);
        res.status(500).json({
            success: false,
            error: 'Error al validar relaciones del producto'
        });
    }
};
