import { prisma } from '../index';
import { 
    ICategoria, 
    ICreateCategoriaDTO, 
    IUpdateCategoriaDTO
} from '../types/categoria.type';

export class CategoriasService {
    
    // ========================================
    // MÉTODOS PARA CATEGORÍAS
    // ========================================
    
    async getAllCategorias(): Promise<ICategoria[]> {
        const categorias = await prisma.categoria.findMany({
            orderBy: {
                nombre: 'asc'
            }
        });
        return categorias.map(cat => ({
            ...cat,
            nombre: cat.nombre ? cat.nombre.toUpperCase() : cat.nombre
        })) as ICategoria[];
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

    async createCategoria(data: ICreateCategoriaDTO): Promise<ICategoria> {
        const nuevaCategoria = await prisma.categoria.create({
            data: {
                codi_categoria: data.codi_categoria,
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion
            }
        });
        return nuevaCategoria as ICategoria;
    }

    async updateCategoria(id: number, data: IUpdateCategoriaDTO): Promise<ICategoria> {
        const categoriaActualizada = await prisma.categoria.update({
            where: { id_cat: id },
            data: {
                nombre: data.nombre ? data.nombre.toUpperCase() : data.nombre,
                descripcion: data.descripcion
            }
        });
        return categoriaActualizada as ICategoria;
    }

    async deleteCategoria(id: number): Promise<void> {
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
    }

    async categoriaExists(id: number): Promise<boolean> {
        const count = await prisma.categoria.count({
            where: { id_cat: id }
        });
        return count > 0;
    }
}
