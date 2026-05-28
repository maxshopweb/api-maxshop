import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { 
    ICategoria, 
    ICreateCategoriaDTO, 
    IUpdateCategoriaDTO
} from '../types/categoria.type';
import type { AdminAuditContext } from '../types/auth.type';
import { auditService } from './audit.service';
import { AdminPaginationMeta, buildPaginationMeta } from '../utils/adminPaginationQuery';
import { buildContainsOrConditions } from '../utils/search.utils';

export class CategoriasService {
    
    // ========================================
    // MÉTODOS PARA CATEGORÍAS
    // ========================================

    async getCategoriasPaginated(
        page: number,
        limit: number,
        busqueda: string
    ): Promise<{ data: ICategoria[]; pagination: AdminPaginationMeta }> {
        const where: Prisma.categoriaWhereInput = busqueda
            ? { OR: buildContainsOrConditions(['codi_categoria', 'nombre'], busqueda) }
            : {};

        const total = await prisma.categoria.count({ where });
        const pagination = buildPaginationMeta(total, page, limit);

        const categorias = await prisma.categoria.findMany({
            where,
            orderBy: { nombre: 'asc' },
            skip: (pagination.page - 1) * limit,
            take: limit,
        });

        const data = categorias.map((cat: ICategoria) => ({
            ...cat,
            nombre: cat.nombre ? cat.nombre.toUpperCase() : cat.nombre,
        })) as ICategoria[];

        return { data, pagination };
    }
    
    async getAllCategorias(): Promise<ICategoria[]> {
        const categorias = await prisma.categoria.findMany({
            orderBy: {
                nombre: 'asc'
            }
        });
        return categorias.map((cat: ICategoria) => ({
            ...cat,
            nombre: cat.nombre ? cat.nombre.toUpperCase() : cat.nombre
        })) as ICategoria[];
    }

    async getAllActive(): Promise<ICategoria[]> {
        const categorias = await prisma.categoria.findMany({
            where: { activo: true },
            orderBy: { nombre: 'asc' }
        });
        return categorias.map((cat: ICategoria) => ({
            ...cat,
            nombre: cat.nombre ? cat.nombre.toUpperCase() : cat.nombre
        })) as ICategoria[];
    }

    async toggleActivo(id: number, activo: boolean, ctx?: AdminAuditContext): Promise<ICategoria> {
        const anterior = await prisma.categoria.findUnique({ where: { id_cat: id } });
        if (!anterior) {
            throw new Error('Categoría no encontrada');
        }
        const actualizada = await prisma.categoria.update({
            where: { id_cat: id },
            data: {
                activo,
                actualizado_en: new Date()
            }
        });
        if (ctx) {
            await auditService.record({
                action: activo ? 'CATEGORIA_ENABLE' : 'CATEGORIA_DISABLE',
                table: 'categorias',
                description: `Categoría ${activo ? 'habilitada' : 'deshabilitada'}: ${actualizada.codi_categoria} — ${actualizada.nombre ?? ''}`,
                previousData: anterior as unknown as Record<string, unknown>,
                currentData: actualizada as unknown as Record<string, unknown>,
                userId: ctx.userId,
                userAgent: ctx.userAgent ?? null,
                endpoint: ctx.endpoint ?? null,
                status: 'SUCCESS',
                adminAudit: true,
            });
        }
        return actualizada as ICategoria;
    }

    async toggleAllActivos(activo: boolean, ctx?: AdminAuditContext): Promise<{ count: number }> {
        const result = await prisma.categoria.updateMany({
            where: {},
            data: { activo, actualizado_en: new Date() }
        });
        if (ctx) {
            await auditService.record({
                action: activo ? 'CATEGORIA_ENABLE_ALL' : 'CATEGORIA_DISABLE_ALL',
                table: 'categorias',
                description: `Se ${activo ? 'habilitaron' : 'deshabilitaron'} todas las categorías (${result.count})`,
                previousData: null,
                currentData: { count: result.count },
                userId: ctx.userId,
                userAgent: ctx.userAgent ?? null,
                endpoint: ctx.endpoint ?? null,
                status: 'SUCCESS',
                adminAudit: true,
            });
        }
        return { count: result.count };
    }

    async getCategoriaById(id: number): Promise<ICategoria | null> {
        const categoria = await prisma.categoria.findFirst({
            where: { id_cat: id }
        });
        if (!categoria) return null;
        return {
            ...categoria,
            nombre: categoria.nombre ? categoria.nombre.toUpperCase() : categoria.nombre
        } as ICategoria;
    }

    async getCategoriaByCodigo(codi_categoria: string): Promise<ICategoria | null> {
        const categoria = await prisma.categoria.findUnique({
            where: { codi_categoria }
        });
        if (!categoria) return null;
        return {
            ...categoria,
            nombre: categoria.nombre ? categoria.nombre.toUpperCase() : categoria.nombre
        } as ICategoria;
    }

    async createCategoria(data: ICreateCategoriaDTO, ctx?: AdminAuditContext): Promise<ICategoria> {
        const nuevaCategoria = await prisma.categoria.create({
            data: {
                codi_categoria: data.codi_categoria,
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion
            }
        });
        if (ctx) {
            await auditService.record({
                action: 'CATEGORIA_CREATE',
                table: 'categorias',
                description: `Categoría creada: ${nuevaCategoria.codi_categoria} — ${nuevaCategoria.nombre ?? ''}`,
                previousData: null,
                currentData: nuevaCategoria as unknown as Record<string, unknown>,
                userId: ctx.userId,
                userAgent: ctx.userAgent ?? null,
                endpoint: ctx.endpoint ?? null,
                status: 'SUCCESS',
                adminAudit: true,
            });
        }
        return nuevaCategoria as ICategoria;
    }

    async updateCategoria(id: number, data: IUpdateCategoriaDTO, ctx?: AdminAuditContext): Promise<ICategoria> {
        const anterior = await prisma.categoria.findUnique({ where: { id_cat: id } });
        const categoriaActualizada = await prisma.categoria.update({
            where: { id_cat: id },
            data: {
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion,
                activo: data.activo,
                actualizado_en: data.activo !== undefined ? new Date() : undefined
            }
        });
        if (ctx) {
            await auditService.record({
                action: 'CATEGORIA_UPDATE',
                table: 'categorias',
                description: `Categoría actualizada: ${categoriaActualizada.codi_categoria} — ${categoriaActualizada.nombre ?? ''}`,
                previousData: anterior ? (anterior as unknown as Record<string, unknown>) : null,
                currentData: categoriaActualizada as unknown as Record<string, unknown>,
                userId: ctx.userId,
                userAgent: ctx.userAgent ?? null,
                endpoint: ctx.endpoint ?? null,
                status: 'SUCCESS',
                adminAudit: true,
            });
        }
        return categoriaActualizada as ICategoria;
    }

    async deleteCategoria(id: number, ctx?: AdminAuditContext): Promise<void> {
        // Verificar si hay productos usando esta categoría
        const categoria = await prisma.categoria.findUnique({
            where: { id_cat: id }
        });

        if (!categoria) {
            throw new Error('Categoría no encontrada');
        }

        const productosCount = await prisma.productos.count({
            where: { codi_categoria: categoria.codi_categoria }
        });

        if (productosCount > 0) {
            throw new Error(`No se puede eliminar la categoría porque tiene ${productosCount} producto(s) asociado(s)`);
        }

        await prisma.categoria.delete({
            where: { id_cat: id }
        });
        if (ctx) {
            await auditService.record({
                action: 'CATEGORIA_DELETE',
                table: 'categorias',
                description: `Categoría eliminada: ${categoria.codi_categoria} — ${categoria.nombre ?? ''}`,
                previousData: categoria as unknown as Record<string, unknown>,
                currentData: null,
                userId: ctx.userId,
                userAgent: ctx.userAgent ?? null,
                endpoint: ctx.endpoint ?? null,
                status: 'SUCCESS',
                adminAudit: true,
            });
        }
    }

    async categoriaExists(id: number): Promise<boolean> {
        const count = await prisma.categoria.count({
            where: { id_cat: id }
        });
        return count > 0;
    }

    /** Devuelve el siguiente código disponible (último id + 1, formateado a 4 dígitos). */
    async getSiguienteCodigo(): Promise<string> {
        const ultima = await prisma.categoria.findFirst({
            orderBy: { id_cat: 'desc' },
            select: { codi_categoria: true }
        });
        const num = ultima ? (parseInt(ultima.codi_categoria, 10) || 0) + 1 : 1;
        return num.toString().padStart(4, '0');
    }
}
