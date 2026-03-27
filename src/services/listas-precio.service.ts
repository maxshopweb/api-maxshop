import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { IListaPrecio } from '../types';
import { AdminPaginationMeta, buildPaginationMeta } from '../utils/adminPaginationQuery';

export class ListasPrecioService {

    async getPaginated(
        activoOnly: boolean,
        page: number,
        limit: number,
        busqueda: string
    ): Promise<{ data: IListaPrecio[]; pagination: AdminPaginationMeta }> {
        const baseWhere: Prisma.lista_precioWhereInput = activoOnly ? { activo: true } : {};
        const where: Prisma.lista_precioWhereInput = busqueda
            ? {
                AND: [
                    baseWhere,
                    {
                        OR: [
                            { codi_lista: { contains: busqueda, mode: 'insensitive' } },
                            { nombre: { contains: busqueda, mode: 'insensitive' } },
                        ],
                    },
                ],
            }
            : baseWhere;

        const total = await prisma.lista_precio.count({ where });
        const pagination = buildPaginationMeta(total, page, limit);

        const listas = await prisma.lista_precio.findMany({
            where,
            orderBy: { codi_lista: 'asc' },
            skip: (pagination.page - 1) * limit,
            take: limit,
        });

        return {
            data: listas as IListaPrecio[],
            pagination,
        };
    }

    async getAll(activoOnly = true): Promise<IListaPrecio[]> {
        const where = activoOnly ? { activo: true } : {};
        const listas = await prisma.lista_precio.findMany({
            where,
            orderBy: { codi_lista: 'asc' }
        });
        return listas as IListaPrecio[];
    }

    async getById(id: number): Promise<IListaPrecio | null> {
        const lista = await prisma.lista_precio.findUnique({
            where: { id_lista: id }
        });
        return lista as IListaPrecio | null;
    }

    async getByCodigo(codi_lista: string): Promise<IListaPrecio | null> {
        const lista = await prisma.lista_precio.findUnique({
            where: { codi_lista: codi_lista.toUpperCase() }
        });
        return lista as IListaPrecio | null;
    }

    async updateActivo(id_lista: number, activo: boolean): Promise<IListaPrecio> {
        const lista = await prisma.lista_precio.update({
            where: { id_lista },
            data: { activo }
        });
        return lista as IListaPrecio;
    }
}
