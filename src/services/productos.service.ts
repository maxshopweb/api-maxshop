import { prisma } from '../index';
import { IIva, IPaginatedResponse, IMarca } from '../types';
import { ICategoria, ISubcategoria } from '../types/categoria.type';
import { ICrearProductoContenido, ICreateProductoDTO, IProductoFilters, IProductos, IUpdateProductoDTO } from '../types/product.type';
import fs from 'fs';
import path from 'path';
import cacheService from './cache.service';

export class ProductosService {

    private TTL_PRODUCTO = 3600;      // 1 hora
    private TTL_CATALOGO = 1800;      // 30 minutos
    private TTL_DESTACADOS = 900;     // 15 minutos
    private TTL_CONTENIDO_CREAR = 7200; // 2 horas (marcas, categorías, etc)

    async getAll(filters: IProductoFilters): Promise<IPaginatedResponse<IProductos>> {
        // Generar clave de cache basada en los filtros
        const cacheKey = `productos:all:${JSON.stringify(filters)}`;
        
        const cached = await cacheService.get<IPaginatedResponse<IProductos>>(cacheKey);
        if (cached) {
            console.log(`✅ Lista de productos encontrada en cache`);
            return cached;
        }

        console.log(`❌ Lista de productos no encontrada en cache`);

        const {
            page = 1,
            limit = 100,
            order_by = 'creado_en',
            order = 'desc',
            estado,
            busqueda,
            id_subcat,
            id_cat,
            id_marca,
            precio_min,
            precio_max,
            destacado,
            financiacion,
            stock_bajo
        } = filters;

        // Construir el where dinámicamente
        const whereClause: any = {};

        // ⭐ IMPORTANTE: Solo productos activos (excluir eliminados)
        // Si se proporciona estado explícitamente, usarlo; sino, solo activos
        if (estado !== undefined) {
            whereClause.estado = estado;
        } else {
            whereClause.estado = 1; // Por defecto, solo activos
        }

        // ⚠️ VALIDACIÓN TEMPORAL: Solo productos con imagen principal (no null y no vacío)
        // Esta validación se aplica SIEMPRE, con o sin otros filtros
        if (!whereClause.AND) {
            whereClause.AND = [];
        }
        // whereClause.AND.push(
        //     { img_principal: { not: null } },
        //     { img_principal: { not: { equals: '' } } }
        // );

        if (destacado !== undefined) whereClause.destacado = destacado;
        if (financiacion !== undefined) whereClause.financiacion = financiacion;

        // Filtros usando códigos del CSV
        // Si id_marca es un número, buscar el código primero
        if (id_marca) {
            if (typeof id_marca === 'number') {
                const marca = await prisma.marca.findFirst({ where: { id_marca } });
                if (marca) {
                    whereClause.codi_marca = marca.codi_marca;
                }
            } else if (typeof id_marca === 'string') {
                whereClause.codi_marca = id_marca;
            }
        }

        // Si id_cat es un número, buscar el código primero
        if (id_cat) {
            if (typeof id_cat === 'number') {
                const categoria = await prisma.categoria.findFirst({ where: { id_cat } });
                if (categoria) {
                    whereClause.codi_categoria = categoria.codi_categoria;
                }
            } else if (typeof id_cat === 'string') {
                whereClause.codi_categoria = id_cat;
            }
        }

        // Filtro por grupo usando código
        if (filters.codi_grupo) {
            whereClause.codi_grupo = filters.codi_grupo;
        }

        // Filtro por IVA usando código
        if (filters.codi_impuesto) {
            if (typeof filters.codi_impuesto === 'number') {
                const iva = await prisma.iva.findFirst({ where: { id_iva: filters.codi_impuesto } });
                if (iva) {
                    whereClause.codi_impuesto = iva.codi_impuesto;
                }
            } else if (typeof filters.codi_impuesto === 'string') {
                whereClause.codi_impuesto = filters.codi_impuesto;
            }
        }

        // Filtro por rango de precio
        if (precio_min !== undefined || precio_max !== undefined) {
            whereClause.precio = {};
            if (precio_min !== undefined) whereClause.precio.gte = precio_min;
            if (precio_max !== undefined) whereClause.precio.lte = precio_max;
        }

        // Filtro por stock bajo - se aplicará después de obtener los resultados
        // porque necesitamos comparar Decimal (stock) con Int (stock_min)
        const aplicarFiltroStockBajo = stock_bajo === true;

        // Si se requiere filtro de stock bajo, agregamos condiciones básicas
        if (aplicarFiltroStockBajo) {
            whereClause.AND = [
                ...(whereClause.AND || []),
                { stock: { not: null } },
                { stock_min: { not: null } }
            ];
        }

        // Búsqueda por nombre, descripción, código de artículo, código de barras o SKU
        if (busqueda) {
            // Si ya existe un OR (por ejemplo, por el filtro de categoría), combinarlo
            const searchConditions = [
                { nombre: { contains: busqueda, mode: 'insensitive' } },
                { descripcion: { contains: busqueda, mode: 'insensitive' } },
                { codi_arti: { contains: busqueda, mode: 'insensitive' } },
                { codi_barras: { contains: busqueda, mode: 'insensitive' } },
                { cod_sku: { contains: busqueda, mode: 'insensitive' } },
            ];

            if (whereClause.OR) {
                // Combinar búsqueda con OR existente usando AND
                whereClause.AND = [
                    ...(whereClause.AND || []),
                    {
                        OR: whereClause.OR
                    },
                    {
                        OR: searchConditions
                    }
                ];
                delete whereClause.OR;
            } else {
                whereClause.OR = searchConditions;
            }
        }

        // Ejecutar queries en paralelo
        const [productos, total] = await Promise.all([
            prisma.productos.findMany({
                where: whereClause,
                include: {
                    categoria: true,  // Relación por codi_categoria
                    marca: true,      // Relación por codi_marca
                    grupo: true,      // Relación por codi_grupo
                    iva: true        // Relación por codi_impuesto
                },
                orderBy: {
                    [order_by]: order
                },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.productos.count({ where: whereClause })
        ]);

        // Aplicar filtro de stock bajo en memoria si es necesario
        let productosFiltrados = productos as unknown as IProductos[];
        if (aplicarFiltroStockBajo) {
            productosFiltrados = productos.filter((producto: any) => {
                if (!producto.stock || !producto.stock_min) return false;
                return Number(producto.stock) <= Number(producto.stock_min);
            }) as unknown as IProductos[];
        }

        const result = {
            data: productosFiltrados,
            total: aplicarFiltroStockBajo ? productosFiltrados.length : total,
            page,
            limit,
            totalPages: aplicarFiltroStockBajo
                ? Math.ceil(productosFiltrados.length / limit)
                : Math.ceil(total / limit),
        };

        // Guardar en cache
        await cacheService.set(cacheKey, result, this.TTL_CATALOGO);

        return result;
    }

    async getById(id: number): Promise<IProductos | null> {
        const cachekey = `producto:${id}`;
        
        const cached = await cacheService.get<IProductos>(cachekey);

        if (cached) {
            console.log(`✅ Producto ${id} encontrado en cache`);
            return cached;
        }

        console.log(`❌ Producto ${id} no encontrado en cache`);

        const producto = await prisma.productos.findFirst({
            where: {
                id_prod: id,
                estado: 1 // Solo productos activos
            },
            include: {
                categoria: true,  // Relación por codi_categoria
                marca: true,      // Relación por codi_marca
                grupo: true,      // Relación por codi_grupo
                iva: true        // Relación por codi_impuesto
            },
        });

        const result = producto as unknown as IProductos | null;

        // Guardar en cache si existe
        if (result) {
            await cacheService.set(cachekey, result, this.TTL_PRODUCTO);
        }

        return result;
    }

    async getByCodigo(codi_arti: string): Promise<IProductos | null> {
        const cacheKey = `producto:codigo:${codi_arti}`;
        
        const cached = await cacheService.get<IProductos>(cacheKey);
        if (cached) {
            console.log(`✅ Producto ${codi_arti} encontrado en cache`);
            return cached;
        }

        console.log(`❌ Producto ${codi_arti} no encontrado en cache`);

        const producto = await prisma.productos.findUnique({
            where: {
                codi_arti
            },
            include: {
                categoria: true,
                marca: true,
                grupo: true,
                iva: true
            },
        });

        if (!producto || producto.estado !== 1) {
            return null;
        }

        const result = producto as unknown as IProductos | null;

        // Guardar en cache
        if (result) {
            await cacheService.set(cacheKey, result, this.TTL_PRODUCTO);
        }

        return result;
    }

    async create(data: ICreateProductoDTO): Promise<IProductos> {
        const { id_cat, id_subcat, id_marca, id_iva, codi_categoria, codi_marca, codi_grupo, codi_impuesto, ...cleanData } = data;

        const nuevoProducto = await prisma.productos.create({
            data: {
                ...cleanData,
                codi_categoria: codi_categoria || null,
                codi_marca: codi_marca || null,
                codi_grupo: codi_grupo || null,
                codi_impuesto: codi_impuesto || null,
                estado: 1,
                creado_en: new Date(),
                actualizado_en: new Date()
            },
            include: {
                categoria: true,
                marca: true,
                grupo: true,
                iva: true
            }
        });

        const result = nuevoProducto as unknown as IProductos;

        // Invalidar cache relacionado
        await cacheService.deletePattern('productos:*');
        await cacheService.delete(`producto:${result.id_prod}`);
        await cacheService.delete(`producto:codigo:${result.codi_arti}`);
        await cacheService.deletePattern('productos:destacados:*');
        await cacheService.delete('productos:stock-bajo');
        await cacheService.delete('productos:con-imagenes:*');

        return result;
    }

    async update(id: number, data: IUpdateProductoDTO): Promise<IProductos> {
        const { id_cat, id_subcat, id_marca, id_iva, codi_categoria, codi_marca, codi_grupo, codi_impuesto, estado, ...cleanData } = data;
        
        // Obtener producto antes de actualizar para invalidar cache por código
        const productoAnterior = await prisma.productos.findUnique({
            where: { id_prod: id },
            select: { codi_arti: true }
        });

        const productoActualizado = await prisma.productos.update({
            where: { id_prod: id },
            data: {
                ...cleanData,
                codi_categoria: codi_categoria !== undefined ? codi_categoria : undefined,
                codi_marca: codi_marca !== undefined ? codi_marca : undefined,
                codi_grupo: codi_grupo !== undefined ? codi_grupo : undefined,
                codi_impuesto: codi_impuesto !== undefined ? codi_impuesto : undefined,
                estado: estado ? Number(estado) : undefined,
                actualizado_en: new Date()
            },
            include: {
                categoria: true,
                marca: true,
                grupo: true,
                iva: true
            }
        });

        const result = productoActualizado as unknown as IProductos;

        // Invalidar cache relacionado
        await cacheService.deletePattern('productos:*');
        await cacheService.delete(`producto:${id}`);
        if (productoAnterior) {
            await cacheService.delete(`producto:codigo:${productoAnterior.codi_arti}`);
        }
        if (result.codi_arti) {
            await cacheService.delete(`producto:codigo:${result.codi_arti}`);
        }
        await cacheService.deletePattern('productos:destacados:*');
        await cacheService.delete('productos:stock-bajo');
        await cacheService.delete('productos:con-imagenes:*');

        return result;
    }

    async delete(id: number): Promise<void> {
        // Obtener producto antes de eliminar para invalidar cache por código
        const producto = await prisma.productos.findUnique({
            where: { id_prod: id },
            select: { codi_arti: true }
        });

        // Soft delete: cambiar estado a 0
        await prisma.productos.update({
            where: { id_prod: id },
            data: {
                estado: 0,
                actualizado_en: new Date()
            }
        });

        // Invalidar cache relacionado
        await cacheService.deletePattern('productos:*');
        await cacheService.delete(`producto:${id}`);
        if (producto) {
            await cacheService.delete(`producto:codigo:${producto.codi_arti}`);
        }
        await cacheService.deletePattern('productos:destacados:*');
        await cacheService.delete('productos:stock-bajo');
        await cacheService.delete('productos:con-imagenes:*');
    }

    async exists(id: number): Promise<boolean> {
        const count = await prisma.productos.count({
            where: {
                id_prod: id,
                estado: 1 // ⭐ Solo contar productos activos
            }
        });
        return count > 0;
    }

    async updateStock(id: number, cantidad: number): Promise<IProductos> {
        const producto = await prisma.productos.findFirst({
            where: {
                id_prod: id,
                estado: 1 // ⭐ Solo productos activos
            }
        });

        if (!producto) {
            throw new Error('Producto no encontrado o inactivo');
        }

        // Convertir Decimal a número para la operación
        const stockActual = producto.stock ? Number(producto.stock) : 0;
        const nuevoStock = stockActual + cantidad;

        if (nuevoStock < 0) {
            throw new Error(`Stock insuficiente. Stock actual: ${stockActual}, intentando reducir: ${Math.abs(cantidad)}`);
        }

        // update() ya invalida el cache, pero también invalidamos stock-bajo específicamente
        const result = await this.update(id, { stock: nuevoStock });
        await cacheService.delete('productos:stock-bajo');

        return result;
    }

    async getDestacados(limit: number = 10): Promise<IProductos[]> {
        const cacheKey = `productos:destacados:${limit}`;
        
        const cached = await cacheService.get<IProductos[]>(cacheKey);
        if (cached) {
            console.log(`✅ Productos destacados encontrados en cache`);
            return cached;
        }

        console.log(`❌ Productos destacados no encontrados en cache`);

        const productos = await prisma.productos.findMany({
            where: {
                destacado: true,
                estado: 1,
                // ⚠️ VALIDACIÓN TEMPORAL: Solo productos con imagen principal
                // AND: [
                //     { img_principal: { not: null } },
                //     { img_principal: { not: { equals: '' } } }
                // ]
            },
            include: {
                categoria: true,
                marca: true,
                grupo: true,
                iva: true
            },
            take: limit,
            orderBy: {
                creado_en: 'desc'
            }
        });

        const result = productos as unknown as IProductos[];

        // Guardar en cache
        await cacheService.set(cacheKey, result, this.TTL_DESTACADOS);

        return result;
    }

    async getStockBajo(): Promise<IProductos[]> {
        const cacheKey = 'productos:stock-bajo';
        
        const cached = await cacheService.get<IProductos[]>(cacheKey);
        if (cached) {
            console.log(`✅ Productos con stock bajo encontrados en cache`);
            return cached;
        }

        console.log(`❌ Productos con stock bajo no encontrados en cache`);

        // Obtener todos los productos activos con stock y stock_min
        const productos = await prisma.productos.findMany({
            where: {
                estado: 1, // ⭐ Solo productos activos
                stock: { not: null },
                stock_min: { not: null }
            },
            include: {
                categoria: true,
                marca: true,
                grupo: true,
                iva: true
            },
            orderBy: {
                stock: 'asc'
            }
        });

        // Filtrar en memoria los que tienen stock <= stock_min
        const productosStockBajo = productos.filter((producto: any) => {
            if (!producto.stock || !producto.stock_min) return false;
            return Number(producto.stock) <= Number(producto.stock_min);
        });

        const result = productosStockBajo as unknown as IProductos[];

        // Guardar en cache
        await cacheService.set(cacheKey, result, this.TTL_CATALOGO);

        return result;
    }

    async getContenidoCrearProducto(): Promise<ICrearProductoContenido> {
        const cacheKey = 'productos:contenido-crear';
        
        const cached = await cacheService.get<ICrearProductoContenido>(cacheKey);
        if (cached) {
            console.log(`✅ Contenido para crear producto encontrado en cache`);
            return cached;
        }

        console.log(`❌ Contenido para crear producto no encontrado en cache`);

        const [marcas, categorias, grupos, ivas] = await Promise.all([
            prisma.marca.findMany({
                orderBy: { nombre: 'asc' }
            }),
            prisma.categoria.findMany({
                orderBy: { nombre: 'asc' }
            }),
            prisma.grupo.findMany({
                orderBy: { nombre: 'asc' }
            }),
            prisma.iva.findMany({
                orderBy: { id_iva: 'asc' }
            })
        ]);

        const result = {
            marcas: marcas as IMarca[],
            categorias: categorias as ICategoria[],
            grupos: grupos as any[], // Agregar tipo IGrupo si es necesario
            ivas: ivas as IIva[]
        };

        // Guardar en cache
        await cacheService.set(cacheKey, result, this.TTL_CONTENIDO_CREAR);

        return result;
    }

    // Método removido - ya no hay subcategorías en el nuevo schema

    async toggleDestacado(id: number): Promise<IProductos> {
        const producto = await prisma.productos.findFirst({
            where: {
                id_prod: id,
                estado: 1 // Solo productos activos pueden ser destacados
            }
        });

        if (!producto) {
            throw new Error('Producto no encontrado o inactivo');
        }

        const nuevoEstadoDestacado = !producto.destacado;

        const productoActualizado = await prisma.productos.update({
            where: { id_prod: id },
            data: {
                destacado: nuevoEstadoDestacado,
                actualizado_en: new Date()
            },
            include: {
                categoria: true,
                marca: true,
                grupo: true,
                iva: true
            }
        });

        const result = productoActualizado as unknown as IProductos;

        // Invalidar cache relacionado
        await cacheService.delete(`producto:${id}`);
        await cacheService.deletePattern('productos:destacados:*');
        await cacheService.deletePattern('productos:*');

        return result;
    }

    /**
     * Obtiene productos que tienen imágenes en la carpeta resources/IMAGENES/img-art
     * Verifica si existe alguna imagen cuyo nombre comience con el codi_arti del producto
     */
    async getProductosConImagenes(filters?: IProductoFilters): Promise<IPaginatedResponse<IProductos>> {
        // Generar clave de cache basada en los filtros
        const cacheKey = `productos:con-imagenes:${JSON.stringify(filters || {})}`;
        
        const cached = await cacheService.get<IPaginatedResponse<IProductos>>(cacheKey);
        if (cached) {
            console.log(`✅ Productos con imágenes encontrados en cache`);
            return cached;
        }

        console.log(`❌ Productos con imágenes no encontrados en cache`);

        // Obtener la ruta del directorio de imágenes (relativa a src/)
        const imagenesDir = path.join(process.cwd(), 'src/resources/IMAGENES/img-art');

        // Leer todos los archivos en el directorio de imágenes
        let archivosImagenes: string[] = [];
        try {
            archivosImagenes = fs.readdirSync(imagenesDir);
        } catch (error) {
            console.error('Error al leer directorio de imágenes:', error);
            // Si no existe el directorio, devolver lista vacía
            return {
                data: [],
                total: 0,
                page: filters?.page || 1,
                limit: filters?.limit || 100,
                totalPages: 0
            };
        }

        // Extraer códigos únicos de productos (sin sufijos como -01, -02, etc.)
        const codigosConImagen = new Set<string>();
        archivosImagenes.forEach(archivo => {
            // Extraer el código del producto del nombre del archivo
            // Ejemplos: "620004-01.jpg" -> "620004", "617320.png" -> "617320"
            const match = archivo.match(/^(\d+)/);
            if (match) {
                codigosConImagen.add(match[1]);
            }
        });

        // Si no hay imágenes, devolver lista vacía
        if (codigosConImagen.size === 0) {
            return {
                data: [],
                total: 0,
                page: filters?.page || 1,
                limit: filters?.limit || 100,
                totalPages: 0
            };
        }

        // Construir filtros base
        const baseFilters: IProductoFilters = {
            ...filters,
            estado: filters?.estado !== undefined ? filters.estado : 1, // Solo activos por defecto
        };

        // Obtener todos los productos con los filtros aplicados
        const allProducts = await this.getAll({
            ...baseFilters,
            limit: 10000, // Obtener todos para filtrar por código
            page: 1
        });

        // Filtrar productos que tienen imágenes
        const productosConImagen = allProducts.data.filter((producto: any) =>
            codigosConImagen.has(producto.codi_arti)
        );

        // Aplicar paginación manual
        const page = filters?.page || 1;
        const limit = filters?.limit || 100;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const productosPaginados = productosConImagen.slice(startIndex, endIndex);

        const result = {
            data: productosPaginados,
            total: productosConImagen.length,
            page,
            limit,
            totalPages: Math.ceil(productosConImagen.length / limit)
        };

        // Guardar en cache
        await cacheService.set(cacheKey, result, this.TTL_CATALOGO);

        return result;
    }
}