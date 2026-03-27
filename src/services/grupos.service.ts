import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import type { AdminAuditContext } from '../types/auth.type';
import { auditService } from './audit.service';
import { AdminPaginationMeta, buildPaginationMeta } from '../utils/adminPaginationQuery';

export interface IGrupo {
    id_grupo: number;
    codi_grupo: string;
    nombre?: string | null;
    descripcion?: string | null;
    activo?: boolean | null;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
}

export interface ICreateGrupoDTO {
    codi_grupo: string;
    nombre?: string;
    descripcion?: string;
}

export interface IUpdateGrupoDTO {
    nombre?: string;
    descripcion?: string;
    activo?: boolean;
}

export class GruposService {
    
    async getPaginated(
        page: number,
        limit: number,
        busqueda: string
    ): Promise<{ data: IGrupo[]; pagination: AdminPaginationMeta }> {
        const where: Prisma.grupoWhereInput = busqueda
            ? {
                OR: [
                    { codi_grupo: { contains: busqueda, mode: 'insensitive' } },
                    { nombre: { contains: busqueda, mode: 'insensitive' } },
                ],
            }
            : {};

        const total = await prisma.grupo.count({ where });
        const pagination = buildPaginationMeta(total, page, limit);

        const grupos = await prisma.grupo.findMany({
            where,
            orderBy: { nombre: 'asc' },
            skip: (pagination.page - 1) * limit,
            take: limit,
        });

        const data = grupos.map((grupo: IGrupo) => ({
            ...grupo,
            nombre: grupo.nombre ? grupo.nombre.toUpperCase() : grupo.nombre,
        })) as IGrupo[];

        return { data, pagination };
    }

    async getAll(): Promise<IGrupo[]> {
        const grupos = await prisma.grupo.findMany({
            orderBy: {
                nombre: 'asc'
            }
        });
        return grupos.map((grupo: IGrupo) => ({
            ...grupo,
            nombre: grupo.nombre ? grupo.nombre.toUpperCase() : grupo.nombre
        })) as IGrupo[];
    }

    async getById(id: number): Promise<IGrupo | null> {
        const grupo = await prisma.grupo.findFirst({
            where: { id_grupo: id }
        });
        if (!grupo) return null;
        return {
            ...grupo,
            nombre: grupo.nombre ? grupo.nombre.toUpperCase() : grupo.nombre
        } as IGrupo;
    }

    async getByCodigo(codi_grupo: string): Promise<IGrupo | null> {
        const grupo = await prisma.grupo.findUnique({
            where: { codi_grupo }
        });
        if (!grupo) return null;
        return {
            ...grupo,
            nombre: grupo.nombre ? grupo.nombre.toUpperCase() : grupo.nombre
        } as IGrupo;
    }

    async create(data: ICreateGrupoDTO, ctx?: AdminAuditContext): Promise<IGrupo> {
        const nuevoGrupo = await prisma.grupo.create({
            data: {
                codi_grupo: data.codi_grupo,
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion,
                activo: true
            }
        });
        if (ctx) {
            await auditService.record({
                action: 'GRUPO_CREATE',
                table: 'grupos',
                description: `Grupo creado: ${nuevoGrupo.codi_grupo} — ${nuevoGrupo.nombre ?? ''}`,
                previousData: null,
                currentData: nuevoGrupo as unknown as Record<string, unknown>,
                userId: ctx.userId,
                userAgent: ctx.userAgent ?? null,
                endpoint: ctx.endpoint ?? null,
                status: 'SUCCESS',
                adminAudit: true,
            });
        }
        return nuevoGrupo as IGrupo;
    }

    async update(id: number, data: IUpdateGrupoDTO, ctx?: AdminAuditContext): Promise<IGrupo> {
        const anterior = await prisma.grupo.findUnique({ where: { id_grupo: id } });
        const grupoActualizado = await prisma.grupo.update({
            where: { id_grupo: id },
            data: {
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion,
                activo: data.activo,
                actualizado_en: new Date()
            }
        });
        if (ctx) {
            await auditService.record({
                action: 'GRUPO_UPDATE',
                table: 'grupos',
                description: `Grupo actualizado: ${grupoActualizado.codi_grupo} — ${grupoActualizado.nombre ?? ''}`,
                previousData: anterior ? (anterior as unknown as Record<string, unknown>) : null,
                currentData: grupoActualizado as unknown as Record<string, unknown>,
                userId: ctx.userId,
                userAgent: ctx.userAgent ?? null,
                endpoint: ctx.endpoint ?? null,
                status: 'SUCCESS',
                adminAudit: true,
            });
        }
        return grupoActualizado as IGrupo;
    }

    async updateByCodigo(codi_grupo: string, data: IUpdateGrupoDTO): Promise<IGrupo> {
        const grupoActualizado = await prisma.grupo.update({
            where: { codi_grupo },
            data: {
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion,
                activo: data.activo,
                actualizado_en: new Date()
            }
        });
        return grupoActualizado as IGrupo;
    }

    async delete(id: number, ctx?: AdminAuditContext): Promise<void> {
        const grupo = await prisma.grupo.findUnique({ where: { id_grupo: id } });
        if (!grupo) {
            throw new Error('Grupo no encontrado');
        }

        const productosConGrupo = await prisma.productos.count({
            where: { codi_grupo: grupo.codi_grupo }
        });

        if (productosConGrupo > 0) {
            throw new Error(`No se puede eliminar el grupo porque tiene ${productosConGrupo} producto(s) asociado(s)`);
        }

        await prisma.grupo.delete({
            where: { id_grupo: id }
        });
        if (ctx) {
            await auditService.record({
                action: 'GRUPO_DELETE',
                table: 'grupos',
                description: `Grupo eliminado: ${grupo.codi_grupo} — ${grupo.nombre ?? ''}`,
                previousData: grupo as unknown as Record<string, unknown>,
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
        const count = await prisma.grupo.count({
            where: { id_grupo: id }
        });
        return count > 0;
    }

    async existsByCodigo(codi_grupo: string): Promise<boolean> {
        const count = await prisma.grupo.count({
            where: { codi_grupo }
        });
        return count > 0;
    }

    /** Devuelve el siguiente código disponible (último id + 1, formateado a 4 dígitos). */
    async getSiguienteCodigo(): Promise<string> {
        const ultimo = await prisma.grupo.findFirst({
            orderBy: { id_grupo: 'desc' },
            select: { codi_grupo: true }
        });
        const num = ultimo ? (parseInt(ultimo.codi_grupo, 10) || 0) + 1 : 1;
        return num.toString().padStart(4, '0');
    }
}

