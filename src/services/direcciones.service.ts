import { prisma } from '../index';
import cacheService from './cache.service';

export interface IDireccion {
    id_direccion: string;
    id_usuario: string;
    nombre?: string | null;
    direccion?: string | null;
    altura?: string | null;
    piso?: string | null;
    dpto?: string | null;
    cod_postal?: number | null;
    ciudad?: string | null;
    provincia?: string | null;
    es_principal: boolean;
    activo: boolean;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
}

export interface ICreateDireccionDTO {
    nombre?: string;
    direccion?: string;
    altura?: string;
    piso?: string;
    dpto?: string;
    cod_postal?: number | null;
    ciudad?: string;
    provincia?: string;
    es_principal?: boolean;
}

export interface IUpdateDireccionDTO extends ICreateDireccionDTO {
    activo?: boolean;
}

export class DireccionesService {
    private readonly MAX_DIRECCIONES = 3;
    private TTL_DIRECCIONES = 1800; // 30 minutos

    /**
     * Obtiene todas las direcciones activas de un usuario
     */
    async getByUsuario(idUsuario: string): Promise<IDireccion[]> {
        const cacheKey = `direcciones:usuario:${idUsuario}`;
        
        const cached = await cacheService.get<IDireccion[]>(cacheKey);
        if (cached) {
            console.log(`✅ Direcciones del usuario ${idUsuario} encontradas en cache`);
            return cached;
        }

        console.log(`❌ Direcciones del usuario ${idUsuario} no encontradas en cache`);

        const direcciones = await prisma.direcciones.findMany({
            where: {
                id_usuario: idUsuario,
                activo: true,
            },
            orderBy: [
                { es_principal: 'desc' },
                { creado_en: 'desc' },
            ],
        });

        const formatted: IDireccion[] = direcciones.map((d) => ({
            id_direccion: d.id_direccion,
            id_usuario: d.id_usuario,
            nombre: d.nombre,
            direccion: d.direccion,
            altura: d.altura,
            piso: d.piso,
            dpto: d.dpto,
            cod_postal: d.cod_postal,
            ciudad: d.ciudad,
            provincia: d.provincia,
            es_principal: d.es_principal || false,
            activo: d.activo || true,
            creado_en: d.creado_en,
            actualizado_en: d.actualizado_en,
        }));

        await cacheService.set(cacheKey, formatted, this.TTL_DIRECCIONES);
        return formatted;
    }

    /**
     * Obtiene una dirección por ID
     */
    async getById(idDireccion: string, idUsuario: string): Promise<IDireccion> {
        const direccion = await prisma.direcciones.findFirst({
            where: {
                id_direccion: idDireccion,
                id_usuario: idUsuario,
                activo: true,
            },
        });

        if (!direccion) {
            throw new Error('Dirección no encontrada');
        }

        return {
            id_direccion: direccion.id_direccion,
            id_usuario: direccion.id_usuario,
            nombre: direccion.nombre,
            direccion: direccion.direccion,
            altura: direccion.altura,
            piso: direccion.piso,
            dpto: direccion.dpto,
            cod_postal: direccion.cod_postal,
            ciudad: direccion.ciudad,
            provincia: direccion.provincia,
            es_principal: direccion.es_principal || false,
            activo: direccion.activo || true,
            creado_en: direccion.creado_en,
            actualizado_en: direccion.actualizado_en,
        };
    }

    /**
     * Crea una nueva dirección
     * Valida que no se exceda el máximo de 3 direcciones
     */
    async create(data: ICreateDireccionDTO, idUsuario: string): Promise<IDireccion> {
        // Validar límite de direcciones
        const count = await prisma.direcciones.count({
            where: {
                id_usuario: idUsuario,
                activo: true,
            },
        });

        if (count >= this.MAX_DIRECCIONES) {
            throw new Error(`No se pueden guardar más de ${this.MAX_DIRECCIONES} direcciones`);
        }

        // Si se marca como principal, desmarcar las demás
        if (data.es_principal) {
            await prisma.direcciones.updateMany({
                where: {
                    id_usuario: idUsuario,
                    activo: true,
                },
                data: {
                    es_principal: false,
                },
            });
        }

        const direccion = await prisma.direcciones.create({
            data: {
                id_usuario: idUsuario,
                nombre: data.nombre || null,
                direccion: data.direccion || null,
                altura: data.altura || null,
                piso: data.piso || null,
                dpto: data.dpto || null,
                cod_postal: data.cod_postal || null,
                ciudad: data.ciudad || null,
                provincia: data.provincia || null,
                es_principal: data.es_principal || false,
                activo: true,
            },
        });

        // Invalidar cache
        await cacheService.delete(`direcciones:usuario:${idUsuario}`);

        return this.getById(direccion.id_direccion, idUsuario);
    }

    /**
     * Actualiza una dirección
     */
    async update(
        idDireccion: string,
        data: IUpdateDireccionDTO,
        idUsuario: string
    ): Promise<IDireccion> {
        // Verificar que la dirección pertenece al usuario
        const direccionExistente = await prisma.direcciones.findFirst({
            where: {
                id_direccion: idDireccion,
                id_usuario: idUsuario,
            },
        });

        if (!direccionExistente) {
            throw new Error('Dirección no encontrada');
        }

        // Si se marca como principal, desmarcar las demás
        if (data.es_principal) {
            await prisma.direcciones.updateMany({
                where: {
                    id_usuario: idUsuario,
                    activo: true,
                    id_direccion: { not: idDireccion },
                },
                data: {
                    es_principal: false,
                },
            });
        }

        const updateData: any = {
            actualizado_en: new Date(),
        };

        if (data.nombre !== undefined) updateData.nombre = data.nombre;
        if (data.direccion !== undefined) updateData.direccion = data.direccion;
        if (data.altura !== undefined) updateData.altura = data.altura;
        if (data.piso !== undefined) updateData.piso = data.piso;
        if (data.dpto !== undefined) updateData.dpto = data.dpto;
        if (data.cod_postal !== undefined) updateData.cod_postal = data.cod_postal;
        if (data.ciudad !== undefined) updateData.ciudad = data.ciudad;
        if (data.provincia !== undefined) updateData.provincia = data.provincia;
        if (data.es_principal !== undefined) updateData.es_principal = data.es_principal;
        if (data.activo !== undefined) updateData.activo = data.activo;

        await prisma.direcciones.update({
            where: { id_direccion: idDireccion },
            data: updateData,
        });

        // Invalidar cache
        await cacheService.delete(`direcciones:usuario:${idUsuario}`);

        return this.getById(idDireccion, idUsuario);
    }

    /**
     * Elimina una dirección (soft delete)
     */
    async delete(idDireccion: string, idUsuario: string): Promise<void> {
        const direccion = await prisma.direcciones.findFirst({
            where: {
                id_direccion: idDireccion,
                id_usuario: idUsuario,
            },
        });

        if (!direccion) {
            throw new Error('Dirección no encontrada');
        }

        // Si es la principal, marcar otra como principal (si existe)
        if (direccion.es_principal) {
            const otraDireccion = await prisma.direcciones.findFirst({
                where: {
                    id_usuario: idUsuario,
                    activo: true,
                    id_direccion: { not: idDireccion },
                },
                orderBy: { creado_en: 'desc' },
            });

            if (otraDireccion) {
                await prisma.direcciones.update({
                    where: { id_direccion: otraDireccion.id_direccion },
                    data: { es_principal: true },
                });
            }
        }

        // Soft delete
        await prisma.direcciones.update({
            where: { id_direccion: idDireccion },
            data: {
                activo: false,
                actualizado_en: new Date(),
            },
        });

        // Invalidar cache
        await cacheService.delete(`direcciones:usuario:${idUsuario}`);
    }

    /**
     * Marca una dirección como principal
     */
    async setPrincipal(idDireccion: string, idUsuario: string): Promise<IDireccion> {
        // Desmarcar todas las demás
        await prisma.direcciones.updateMany({
            where: {
                id_usuario: idUsuario,
                activo: true,
                id_direccion: { not: idDireccion },
            },
            data: {
                es_principal: false,
            },
        });

        // Marcar esta como principal
        await prisma.direcciones.update({
            where: { id_direccion: idDireccion },
            data: {
                es_principal: true,
                actualizado_en: new Date(),
            },
        });

        // Invalidar cache
        await cacheService.delete(`direcciones:usuario:${idUsuario}`);

        return this.getById(idDireccion, idUsuario);
    }
}

export const direccionesService = new DireccionesService();

