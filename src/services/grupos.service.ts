import { prisma } from '../index';

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

    async create(data: ICreateGrupoDTO): Promise<IGrupo> {
        const nuevoGrupo = await prisma.grupo.create({
            data: {
                codi_grupo: data.codi_grupo,
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion,
                activo: true
            }
        });
        return nuevoGrupo as IGrupo;
    }

    async update(id: number, data: IUpdateGrupoDTO): Promise<IGrupo> {
        const grupoActualizado = await prisma.grupo.update({
            where: { id_grupo: id },
            data: {
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion,
                activo: data.activo,
                actualizado_en: new Date()
            }
        });
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

    async delete(id: number): Promise<void> {
        // Verificar si hay productos usando este grupo
        const productosCount = await prisma.productos.count({
            where: { codi_grupo: { not: null } }
        });

        // Obtener el grupo para verificar
        const grupo = await this.getById(id);
        if (grupo) {
            const productosConGrupo = await prisma.productos.count({
                where: { codi_grupo: grupo.codi_grupo }
            });

            if (productosConGrupo > 0) {
                throw new Error(`No se puede eliminar el grupo porque tiene ${productosConGrupo} producto(s) asociado(s)`);
            }
        }

        await prisma.grupo.delete({
            where: { id_grupo: id }
        });
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

