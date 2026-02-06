// src/services/marcas.service.ts
import { prisma } from '../index';
import { IMarca, ICreateMarcaDTO, IUpdateMarcaDTO } from '../types';

export class MarcasService {
    
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

    async create(data: ICreateMarcaDTO): Promise<IMarca> {
        const nuevaMarca = await prisma.marca.create({
            data: {
                codi_marca: data.codi_marca,
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion 
            }
        });
        return nuevaMarca as IMarca;
    }

    async update(id: number, data: IUpdateMarcaDTO): Promise<IMarca> {
        const marcaActualizada = await prisma.marca.update({
            where: { id_marca: id },
            data: {
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion  
            }
        });
        return marcaActualizada as IMarca;
    }

    async delete(id: number): Promise<void> {
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
