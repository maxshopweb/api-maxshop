import { prisma } from '../index';
import cacheService from './cache.service';

export interface IDireccionLocal {
    id_direccion: string;
    id_usuario?: string | null;
    id_venta?: number | null;
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
    tipo?: string | null;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
    // Campos de geocodificaci?n
    latitud?: number | null;
    longitud?: number | null;
    direccion_formateada?: string | null;
    pais?: string | null;
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
    async getByUsuario(idUsuario: string): Promise<IDireccionLocal[]> {
        const cacheKey = `direcciones:usuario:${idUsuario}`;
        
        const cached = await cacheService.get<IDireccionLocal[]>(cacheKey);
        if (cached) {
            return cached;
        }

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

        const formatted: IDireccionLocal[] = direcciones.map((d) => ({
            id_direccion: d.id_direccion,
            id_usuario: d.id_usuario,
            id_venta: d.id_venta,
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
            tipo: d.tipo,
            creado_en: d.creado_en,
            actualizado_en: d.actualizado_en,
            latitud: d.latitud,
            longitud: d.longitud,
            direccion_formateada: d.direccion_formateada,
            pais: d.pais,
        }));

        await cacheService.set(cacheKey, formatted, this.TTL_DIRECCIONES);
        return formatted;
    }

    /**
     * Obtiene una direcci?n por ID
     */
    async getById(idDireccion: string, idUsuario: string): Promise<IDireccionLocal> {
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
            id_venta: direccion.id_venta,
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
            tipo: direccion.tipo,
            creado_en: direccion.creado_en,
            actualizado_en: direccion.actualizado_en,
            latitud: direccion.latitud,
            longitud: direccion.longitud,
            direccion_formateada: direccion.direccion_formateada,
            pais: direccion.pais,
        };
    }

    /**
     * Crea una nueva direcci?n
     * Valida que no se exceda el m?ximo de 3 direcciones
     */
    async create(data: ICreateDireccionDTO, idUsuario: string): Promise<IDireccionLocal> {
        // Validar l?mite de direcciones
        const count = await prisma.direcciones.count({
            where: {
                id_usuario: idUsuario,
                activo: true,
            },
        });

        if (count >= this.MAX_DIRECCIONES) {
            throw new Error(`No se pueden guardar m?s de ${this.MAX_DIRECCIONES} direcciones`);
        }

        // Si se marca como principal, desmarcar las dem?s
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
     * Actualiza una direcci?n
     */
    async update(
        idDireccion: string,
        data: IUpdateDireccionDTO,
        idUsuario: string
    ): Promise<IDireccionLocal> {
        // Verificar que la direcci?n pertenece al usuario
        const direccionExistente = await prisma.direcciones.findFirst({
            where: {
                id_direccion: idDireccion,
                id_usuario: idUsuario,
            },
        });

        if (!direccionExistente) {
            throw new Error('Direcci?n no encontrada');
        }

        // Si se marca como principal, desmarcar las dem?s
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
     * Elimina una direcci?n (soft delete)
     */
    async delete(idDireccion: string, idUsuario: string): Promise<void> {
        const direccion = await prisma.direcciones.findFirst({
            where: {
                id_direccion: idDireccion,
                id_usuario: idUsuario,
            },
        });

        if (!direccion) {
            throw new Error('Direcci?n no encontrada');
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
     * Marca una direcci?n como principal
     */
    async setPrincipal(idDireccion: string, idUsuario: string): Promise<IDireccionLocal> {
        // Desmarcar todas las dem?s
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

