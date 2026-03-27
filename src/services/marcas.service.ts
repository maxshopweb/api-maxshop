// src/services/marcas.service.ts
import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { IMarca, ICreateMarcaDTO, IUpdateMarcaDTO } from '../types';
import type { AdminAuditContext } from '../types/auth.type';
import { auditService } from './audit.service';
import { AdminPaginationMeta, buildPaginationMeta } from '../utils/adminPaginationQuery';

export class MarcasService {
    
    async getPaginated(
        page: number,
        limit: number,
        busqueda: string
    ): Promise<{ data: IMarca[]; pagination: AdminPaginationMeta }> {
        const where: Prisma.marcaWhereInput = busqueda
            ? {
                OR: [
                    { codi_marca: { contains: busqueda, mode: 'insensitive' } },
                    { nombre: { contains: busqueda, mode: 'insensitive' } },
                ],
            }
            : {};

        const total = await prisma.marca.count({ where });
        const pagination = buildPaginationMeta(total, page, limit);

        const marcas = await prisma.marca.findMany({
            where,
            orderBy: { nombre: 'asc' },
            skip: (pagination.page - 1) * limit,
            take: limit,
        });

        const data = marcas.map((marca: IMarca) => ({
            ...marca,
            nombre: marca.nombre ? marca.nombre.toUpperCase() : marca.nombre,
        })) as IMarca[];

        return { data, pagination };
    }

    async getAll(): Promise<IMarca[]> {
        const marcas = await prisma.marca.findMany({
            orderBy: {
                nombre: 'asc'
            }
        });
        return marcas.map((marca: IMarca) => ({
            ...marca,
            nombre: marca.nombre ? marca.nombre.toUpperCase() : marca.nombre
        })) as IMarca[];
    }

    async getById(id: number): Promise<IMarca | null> {
        const marca = await prisma.marca.findFirst({
            where: { id_marca: id }
        });
        if (!marca) return null;
        return {
            ...marca,
            nombre: marca.nombre ? marca.nombre.toUpperCase() : marca.nombre
        } as IMarca;
    }

    async getByCodigo(codi_marca: string): Promise<IMarca | null> {
        const marca = await prisma.marca.findUnique({
            where: { codi_marca }
        });
        if (!marca) return null;
        return {
            ...marca,
            nombre: marca.nombre ? marca.nombre.toUpperCase() : marca.nombre
        } as IMarca;
    }

    async create(data: ICreateMarcaDTO, ctx?: AdminAuditContext): Promise<IMarca> {
        const nuevaMarca = await prisma.marca.create({
            data: {
                codi_marca: data.codi_marca,
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion 
            }
        });
        if (ctx) {
            await auditService.record({
                action: 'MARCA_CREATE',
                table: 'marcas',
                description: `Marca creada: ${nuevaMarca.codi_marca} — ${nuevaMarca.nombre ?? ''}`,
                previousData: null,
                currentData: nuevaMarca as unknown as Record<string, unknown>,
                userId: ctx.userId,
                userAgent: ctx.userAgent ?? null,
                endpoint: ctx.endpoint ?? null,
                status: 'SUCCESS',
                adminAudit: true,
            });
        }
        return nuevaMarca as IMarca;
    }

    async update(id: number, data: IUpdateMarcaDTO, ctx?: AdminAuditContext): Promise<IMarca> {
        const anterior = await prisma.marca.findUnique({ where: { id_marca: id } });
        const marcaActualizada = await prisma.marca.update({
            where: { id_marca: id },
            data: {
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion  
            }
        });
        if (ctx) {
            await auditService.record({
                action: 'MARCA_UPDATE',
                table: 'marcas',
                description: `Marca actualizada: ${marcaActualizada.codi_marca} — ${marcaActualizada.nombre ?? ''}`,
                previousData: anterior ? (anterior as unknown as Record<string, unknown>) : null,
                currentData: marcaActualizada as unknown as Record<string, unknown>,
                userId: ctx.userId,
                userAgent: ctx.userAgent ?? null,
                endpoint: ctx.endpoint ?? null,
                status: 'SUCCESS',
                adminAudit: true,
            });
        }
        return marcaActualizada as IMarca;
    }

    async delete(id: number, ctx?: AdminAuditContext): Promise<void> {
        // Verificar si hay productos usando esta marca
        const marca = await prisma.marca.findUnique({
            where: { id_marca: id }
        });

        if (!marca) {
            throw new Error('Marca no encontrada');
        }

        const productosCount = await prisma.productos.count({
            where: { codi_marca: marca.codi_marca }
        });

        if (productosCount > 0) {
            throw new Error(`No se puede eliminar la marca porque tiene ${productosCount} producto(s) asociado(s)`);
        }

        await prisma.marca.delete({
            where: { id_marca: id }
        });
        if (ctx) {
            await auditService.record({
                action: 'MARCA_DELETE',
                table: 'marcas',
                description: `Marca eliminada: ${marca.codi_marca} — ${marca.nombre ?? ''}`,
                previousData: marca as unknown as Record<string, unknown>,
                currentData: null,
                userId: ctx.userId,
                userAgent: ctx.userAgent ?? null,
                endpoint: ctx.endpoint ?? null,
                status: 'SUCCESS',
                adminAudit: true,
            });
        }
    }

    async exists(id: number): Promise<boolean> {
        const count = await prisma.marca.count({
            where: { id_marca: id }
        });
        return count > 0;
    }

    /** Devuelve el siguiente código disponible (último id + 1, formateado a 3 dígitos). */
    async getSiguienteCodigo(): Promise<string> {
        const ultima = await prisma.marca.findFirst({
            orderBy: { id_marca: 'desc' },
            select: { codi_marca: true }
        });
        const num = ultima ? (parseInt(ultima.codi_marca, 10) || 0) + 1 : 1;
        return num.toString().padStart(3, '0');
    }
}
