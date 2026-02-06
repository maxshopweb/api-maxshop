import { prisma } from '../index';
import { IListaPrecio } from '../types';

export class ListasPrecioService {

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
}
