import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { IIva, IListaPrecio, IPaginatedResponse, IMarca, ISituacionFiscal } from '../types';
import { IGrupo } from './grupos.service';
import { ICategoria, ISubcategoria } from '../types/categoria.type';
import { ICrearProductoContenido, ICreateProductoDTO, IProductoFilters, IProductos, IUpdateProductoDTO, IBulkPublicadoResult, IListaActivaInfo } from '../types/product.type';
import fs from 'fs';
import path from 'path';
import cacheService from './cache.service';

export class ProductosService {

    private TTL_PRODUCTO = 3600;      // 1 hora
    private TTL_CATALOGO = 1800;      // 30 minutos
    private TTL_DESTACADOS = 900;     // 15 minutos
    private TTL_CONTENIDO_CREAR = 7200; // 2 horas (marcas, categorías, etc)

    /**
     * Obtiene el precio de la lista activa (sin IVA) según lista_precio_activa.
     */
    private getPrecioListaActiva(producto: any): number | null {
        const lista = (producto.lista_precio_activa || 'V').toUpperCase();
        const pv = producto.precio_venta != null ? Number(producto.precio_venta) : null;
        const pe = producto.precio_especial != null ? Number(producto.precio_especial) : null;
        const pp = producto.precio_pvp != null ? Number(producto.precio_pvp) : null;
        const pc = producto.precio_campanya != null ? Number(producto.precio_campanya) : null;
        if (lista === 'V') return pv;
        if (lista === 'O') return pe;
        if (lista === 'P') return pp;
        if (lista === 'Q') return pc;
        return pv ?? pe ?? pp ?? pc;
    }

    /**
     * Calcula precio final con IVA para enviar al front.
     * Precios en BD son sin IVA; se aplica porcentaje de tabla iva.
     */
    private calcularPrecioConIva(producto: any): number | null {
        const precioSinIva = this.getPrecioListaActiva(producto);
        if (precioSinIva === null || precioSinIva < 0) return null;
        const iva = producto.iva;
        const porcentaje = iva?.porcentaje != null ? Number(iva.porcentaje) : 0;
        return precioSinIva * (1 + porcentaje / 100);
    }

    /** Map codi_lista -> lista para enriquecer producto con lista_activa (sin N+1) */
    private async getListasMap(): Promise<Map<string, IListaPrecio>> {
        const listas = await prisma.lista_precio.findMany({
            where: { activo: true },
            orderBy: { codi_lista: 'asc' }
        });
        const map = new Map<string, IListaPrecio>();
        for (const l of listas) {
            const codi = (l.codi_lista || '').toUpperCase();
            if (codi) map.set(codi, l as IListaPrecio);
        }
        return map;
    }

    /** Solo flags para UI (oferta/campaña). No exponer nombre ni datos internos de lista. */
    private buildListaActivaInfo(lista: IListaPrecio | undefined): IListaActivaInfo | null {
        if (!lista) return null;
        const codi = (lista.codi_lista || '').toUpperCase();
        const tipo = (lista.tipo_lista || '').toUpperCase();
        return {
            codi_lista: codi,
            tipo_lista: lista.tipo_lista ?? null,
            es_oferta: codi === 'O' || tipo === 'O',
            es_campanya: codi === 'Q' || tipo === 'Q'
        };
    }

    // Función auxiliar para convertir nombre a mayúsculas, precio con IVA y lista_activa
    private normalizeProducto(producto: any, listasMap?: Map<string, IListaPrecio>): IProductos {
        const codiLista = (producto.lista_precio_activa || 'V').toUpperCase();
        const lista = listasMap?.get(codiLista);
        const lista_activa = listasMap ? this.buildListaActivaInfo(lista) : null;

        const normalized: any = {
            ...producto,
            nombre: producto.nombre ? producto.nombre.toUpperCase() : producto.nombre,
            precio: this.calcularPrecioConIva(producto),
            lista_activa: lista_activa ?? undefined
        };

        if (normalized.categoria && normalized.categoria.nombre) {
            normalized.categoria = {
                ...normalized.categoria,
                nombre: normalized.categoria.nombre.toUpperCase()
            };
        }
        if (normalized.marca && normalized.marca.nombre) {
            normalized.marca = {
                ...normalized.marca,
                nombre: normalized.marca.nombre.toUpperCase()
            };
        }
        if (normalized.grupo && normalized.grupo.nombre) {
            normalized.grupo = {
                ...normalized.grupo,
                nombre: normalized.grupo.nombre.toUpperCase()
            };
        }

        return normalized as IProductos;
    }

    // Función auxiliar para normalizar array de productos
    private normalizeProductos(productos: any[], listasMap?: Map<string, IListaPrecio>): IProductos[] {
        return productos.map(p => this.normalizeProducto(p, listasMap));
    }

    async getAll(filters: IProductoFilters): Promise<IPaginatedResponse<IProductos>> {
        // Generar clave de cache basada en los filtros
        const cacheKey = `productos:all:${JSON.stringify(filters)}`;
        
        const cached = await cacheService.get<IPaginatedResponse<IProductos>>(cacheKey);
        if (cached) {
            return cached;
        }


        const {
            page = 1,
            limit = 100,
            order_by = 'creado_en',
            order = 'desc',
            estado,
            activo,
            busqueda,
            id_subcat,
            id_cat,
            id_marca,
            precio_min,
            precio_max,
            destacado,
            publicado,
            financiacion,
            stock_bajo
        } = filters;

        // Construir el where dinámicamente
        const whereClause: any = {};

        // ⭐ IMPORTANTE: Manejo de estado y activo
        // - estado: 0 = eliminado (soft delete) - NUNCA traer
        // - estado: 1 = activo normal
        // - estado: 2 = inactivo normal
        // - activo: "A" = publicado, "I" = despublicado
        // - Siempre excluir productos eliminados (estado: 0)
        
        // SIEMPRE excluir eliminados (estado: 0)
        // Inicializar AND si no existe
        if (!whereClause.AND) {
            whereClause.AND = [];
        }
        whereClause.AND.push({ estado: { not: 0 } });

        // Filtro por activo (activo/inactivo: "A" o "I")
        // Este es el filtro principal para admin
        if (activo !== undefined && activo !== null && activo !== '') {
            whereClause.activo = activo.toUpperCase(); // Asegurar mayúsculas para consistencia
        }

        // Filtro por estado (solo para admin ver activos/inactivos, nunca eliminados)
        // Si se pasa estado explícitamente, usarlo
        if (estado !== undefined && estado !== null) {
            // Admin puede filtrar por estado 1 o 2 (nunca 0)
            if (estado === 1 || estado === 2) {
                whereClause.estado = estado;
            }
        }
        // Si NO se pasa estado NI activo, traer todos los estados excepto eliminados (0)
        // Esto permite que admin vea todos los productos (activos e inactivos)
        // El filtro AND ya excluye estado=0, así que no necesitamos forzar estado=1

        // ⚠️ FILTRO TEMPORAL: Solo productos con imagen principal (comentado temporalmente)
        // Descomentar si se requiere solo productos con imagen en el admin
        /*
        // Solo productos con imagen principal (no null y no vacío)
        whereClause.AND.push(
            { img_principal: { not: null } },
            { img_principal: { not: { equals: '' } } }
        );
        */

        if (destacado !== undefined) whereClause.destacado = destacado;
        if (publicado !== undefined) whereClause.publicado = publicado;
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

        // Filtro por rango de precio (por columna de lista activa; aproximación)
        if (precio_min !== undefined || precio_max !== undefined) {
            const gte = precio_min !== undefined ? precio_min : undefined;
            const lte = precio_max !== undefined ? precio_max : undefined;
            const cond = (col: string) => {
                const c: any = {};
                if (gte !== undefined) c.gte = gte;
                if (lte !== undefined) c.lte = lte;
                return Object.keys(c).length ? { [col]: c } : {};
            };
            const priceOr = [
                { lista_precio_activa: 'V', ...cond('precio_venta') },
                { lista_precio_activa: 'O', ...cond('precio_especial') },
                { lista_precio_activa: 'P', ...cond('precio_pvp') },
                { lista_precio_activa: 'Q', ...cond('precio_campanya') },
                { lista_precio_activa: null, ...cond('precio_venta') }
            ].filter((o: any) => Object.keys(o).length > 1);
            if (priceOr.length > 0) {
                whereClause.AND = [...(whereClause.AND || []), { OR: priceOr }];
            }
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

        // Búsqueda por nombre, descripción, código de artículo, código de barras, SKU o ID
        if (busqueda) {
            const busquedaTrimmed = busqueda.trim();
            const searchConditions: any[] = [
                { nombre: { contains: busquedaTrimmed, mode: 'insensitive' } },
                { descripcion: { contains: busquedaTrimmed, mode: 'insensitive' } },
                { codi_arti: { contains: busquedaTrimmed, mode: 'insensitive' } },
                { codi_barras: { contains: busquedaTrimmed, mode: 'insensitive' } },
            ];

            // Si la búsqueda es un número, buscar también por ID exacto
            const busquedaAsNumber = parseInt(busquedaTrimmed);
            if (!isNaN(busquedaAsNumber) && busquedaAsNumber > 0) {
                searchConditions.push({ id_prod: busquedaAsNumber });
                // También buscar código de artículo exacto si es numérico
                searchConditions.push({ codi_arti: busquedaTrimmed });
            }

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

        // Ejecutar queries en paralelo (incluyendo agregación de precios)
        const [productos, total, priceStats] = await Promise.all([
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
            prisma.productos.count({ where: whereClause }),
            // Agregación para rango de precios (sin IVA; aproximación por columnas)
            prisma.productos.aggregate({
                where: whereClause,
                _min: { precio_venta: true, precio_especial: true, precio_pvp: true, precio_campanya: true },
                _max: { precio_venta: true, precio_especial: true, precio_pvp: true, precio_campanya: true }
            })
        ]);

        // Aplicar filtro de stock bajo en memoria si es necesario
        let productosFiltrados = productos as unknown as IProductos[];
        if (aplicarFiltroStockBajo) {
            productosFiltrados = productos.filter((producto: any) => {
                if (!producto.stock || !producto.stock_min) return false;
                return Number(producto.stock) <= Number(producto.stock_min);
            }) as unknown as IProductos[];
        }

        const listasMap = await this.getListasMap();
        const productosNormalizados = this.normalizeProductos(productosFiltrados, listasMap);

        const result = {
            data: productosNormalizados,
            total: aplicarFiltroStockBajo ? productosFiltrados.length : total,
            page,
            limit,
            totalPages: aplicarFiltroStockBajo
                ? Math.ceil(productosFiltrados.length / limit)
                : Math.ceil(total / limit),
            // Rango de precios (min/max entre las 4 listas; sin IVA, aproximado)
            priceRange: (() => {
                const mins = [priceStats._min.precio_venta, priceStats._min.precio_especial, priceStats._min.precio_pvp, priceStats._min.precio_campanya].filter(Boolean);
                const maxs = [priceStats._max.precio_venta, priceStats._max.precio_especial, priceStats._max.precio_pvp, priceStats._max.precio_campanya].filter(Boolean);
                if (mins.length === 0 || maxs.length === 0) return undefined;
                return { min: Math.min(...mins.map(Number)), max: Math.max(...maxs.map(Number)) };
            })()
        };

        // Guardar en cache
        await cacheService.set(cacheKey, result, this.TTL_CATALOGO);

        return result;
    }

    async getById(id: number): Promise<IProductos | null> {
        const cachekey = `producto:${id}`;
        
        const cached = await cacheService.get<IProductos>(cachekey);

        if (cached) {
            return cached;
        }


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

        const listasMap = await this.getListasMap();
        const result = producto ? this.normalizeProducto(producto, listasMap) : null;

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
            return cached;
        }


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

        const listasMap = await this.getListasMap();
        const result = this.normalizeProducto(producto, listasMap);

        // Guardar en cache
        if (result) {
            await cacheService.set(cacheKey, result, this.TTL_PRODUCTO);
        }

        return result;
    }

    /** Límites de longitud en BD (productos) para evitar P2000 */
    private static readonly PRODUCTO_MAX_LEN = {
        codi_arti: 10,
        nombre: 255,
        unidad_medida: 3,
        codi_barras: 22,
        img_principal: 120,
    } as const;

    private truncateStr(value: string | null | undefined, max: number): string | null {
        if (value == null || value === '') return null;
        const s = String(value).trim();
        return s.length > max ? s.slice(0, max) : s || null;
    }

    async create(data: ICreateProductoDTO): Promise<IProductos> {
        const { id_cat, id_subcat, id_marca, id_iva, codi_categoria, codi_marca, codi_grupo, codi_impuesto, cod_sku, id_interno, modelo, precio_mayorista, precio_minorista, precio_evento, stock_mayorista, ...rest } = data;
        const L = ProductosService.PRODUCTO_MAX_LEN;

        const listaActiva = rest.lista_precio_activa != null && rest.lista_precio_activa !== ''
            ? (rest.lista_precio_activa as string).toUpperCase().slice(0, 1)
            : null;
        const nuevoProducto = await prisma.productos.create({
            data: {
                codi_arti: this.truncateStr(rest.codi_arti, L.codi_arti) ?? '',
                nombre: this.truncateStr(rest.nombre, L.nombre) ?? null,
                descripcion: rest.descripcion != null && rest.descripcion !== '' ? String(rest.descripcion).trim() : null,
                precio_venta: rest.precio_venta ?? null,
                precio_especial: rest.precio_especial ?? null,
                precio_pvp: rest.precio_pvp ?? null,
                precio_campanya: rest.precio_campanya ?? null,
                lista_precio_activa: listaActiva,
                stock: rest.stock ?? null,
                stock_min: rest.stock_min ?? null,
                codi_barras: this.truncateStr(rest.codi_barras, L.codi_barras),
                unidad_medida: this.truncateStr(rest.unidad_medida, L.unidad_medida),
                unidades_por_producto: rest.unidades_por_producto ?? null,
                img_principal: this.truncateStr(rest.img_principal, L.img_principal),
                imagenes: rest.imagenes != null ? rest.imagenes : Prisma.JsonNull,
                destacado: rest.destacado ?? false,
                financiacion: rest.financiacion ?? false,
                codi_categoria: this.truncateStr(codi_categoria, 4) ?? null,
                codi_marca: this.truncateStr(codi_marca, 3) ?? null,
                codi_grupo: this.truncateStr(codi_grupo, 4) ?? null,
                codi_impuesto: this.truncateStr(codi_impuesto, 2) ?? null,
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

        const listasMap = await this.getListasMap();
        const result = this.normalizeProducto(nuevoProducto, listasMap);

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

        const listaActiva = cleanData.lista_precio_activa !== undefined
            ? (cleanData.lista_precio_activa != null && cleanData.lista_precio_activa !== ''
                ? (cleanData.lista_precio_activa as string).toUpperCase()
                : null)
            : undefined;
        const { cod_sku, id_interno, modelo, precio_mayorista, precio_minorista, precio_evento, stock_mayorista, ...updateData } = cleanData;
        const updatePayload = {
            ...updateData,
            nombre: updateData.nombre ? updateData.nombre.toUpperCase() : updateData.nombre,
            ...(codi_categoria !== undefined && { codi_categoria: codi_categoria || null }),
            ...(codi_marca !== undefined && { codi_marca: codi_marca || null }),
            ...(codi_grupo !== undefined && { codi_grupo: codi_grupo || null }),
            ...(codi_impuesto !== undefined && { codi_impuesto: codi_impuesto || null }),
            ...(listaActiva !== undefined && { lista_precio_activa: listaActiva }),
            ...(estado !== undefined && estado !== null && { estado: Number(estado) }),
            actualizado_en: new Date()
        };
        const productoActualizado = await prisma.productos.update({
            where: { id_prod: id },
            data: updatePayload as Prisma.productosUpdateInput,
            include: {
                categoria: true,
                marca: true,
                grupo: true,
                iva: true
            }
        });

        const listasMap = await this.getListasMap();
        const result = this.normalizeProducto(productoActualizado, listasMap);

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
        // Invalidar cache de ventas porque incluyen productos actualizados
        await cacheService.deletePattern('ventas:*');
        await cacheService.deletePattern('venta:*');

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
        // Invalidar cache de ventas porque incluyen productos actualizados
        await cacheService.deletePattern('ventas:*');
        await cacheService.deletePattern('venta:*');
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

    async existsAny(id: number): Promise<boolean> {
        // Verificar si existe el producto en cualquier estado (excepto eliminado/soft delete)
        const count = await prisma.productos.count({
            where: {
                id_prod: id,
                estado: { not: 0 } // Cualquier estado excepto 0 (eliminado)
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
            return cached;
        }


        const productos = await prisma.productos.findMany({
            where: {
                destacado: true,
                estado: 1,
                publicado: true, // Solo productos publicados en tienda
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

        const listasMap = await this.getListasMap();
        const result = this.normalizeProductos(productos, listasMap);

        // Guardar en cache
        await cacheService.set(cacheKey, result, this.TTL_DESTACADOS);

        return result;
    }

    async getStockBajo(): Promise<IProductos[]> {
        const cacheKey = 'productos:stock-bajo';
        
        const cached = await cacheService.get<IProductos[]>(cacheKey);
        if (cached) {
            return cached;
        }


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

        const listasMap = await this.getListasMap();
        const result = this.normalizeProductos(productosStockBajo, listasMap);

        // Guardar en cache
        await cacheService.set(cacheKey, result, this.TTL_CATALOGO);

        return result;
    }

    async getContenidoCrearProducto(): Promise<ICrearProductoContenido> {
        const cacheKey = 'productos:contenido-crear';
        
        const cached = await cacheService.get<ICrearProductoContenido>(cacheKey);
        if (cached) {
            return cached;
        }


        const [marcas, categorias, grupos, ivas, listasPrecio, situacionesFiscales] = await Promise.all([
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
            }),
            prisma.lista_precio.findMany({
                where: { activo: true },
                orderBy: { codi_lista: 'asc' }
            }),
            prisma.situacion_fiscal.findMany({
                where: { activo: true },
                orderBy: { codi_sifi: 'asc' }
            })
        ]);

        const result: ICrearProductoContenido = {
            marcas: marcas.map((m: IMarca) => ({
                ...m,
                nombre: m.nombre ? m.nombre.toUpperCase() : m.nombre
            })) as IMarca[],
            categorias: categorias.map((c: ICategoria) => ({
                ...c,
                nombre: c.nombre ? c.nombre.toUpperCase() : c.nombre
            })) as ICategoria[],
            grupos: grupos.map((g: IGrupo) => ({
                ...g,
                nombre: g.nombre ? g.nombre.toUpperCase() : g.nombre
            })) as IGrupo[],
            ivas: ivas as IIva[],
            listasPrecio: listasPrecio as IListaPrecio[],
            situacionesFiscales: situacionesFiscales.map((s) => ({
                id_sifi: s.id_sifi,
                codi_sifi: s.codi_sifi,
                nombre: s.nombre,
                codi_impuesto: s.codi_impuesto,
                activo: s.activo,
                creado_en: s.creado_en,
                actualizado_en: s.actualizado_en
            })) as ISituacionFiscal[]
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

        const listasMap = await this.getListasMap();
        const result = this.normalizeProducto(productoActualizado, listasMap);

        // Invalidar cache relacionado
        await cacheService.delete(`producto:${id}`);
        await cacheService.deletePattern('productos:destacados:*');
        await cacheService.deletePattern('productos:*');

        return result;
    }

    /** Cambia el estado publicado de un producto (solo productos no eliminados). */
    async togglePublicado(id: number): Promise<IProductos> {
        const producto = await prisma.productos.findFirst({
            where: {
                id_prod: id,
                estado: { not: 0 }
            }
        });

        if (!producto) {
            throw new Error('Producto no encontrado o eliminado');
        }

        const nuevoPublicado = !(producto.publicado ?? false);

        const productoActualizado = await prisma.productos.update({
            where: { id_prod: id },
            data: {
                publicado: nuevoPublicado,
                actualizado_en: new Date()
            },
            include: {
                categoria: true,
                marca: true,
                grupo: true,
                iva: true
            }
        });

        const listasMap = await this.getListasMap();
        const result = this.normalizeProducto(productoActualizado, listasMap);

        await cacheService.delete(`producto:${id}`);
        await cacheService.deletePattern('productos:destacados:*');
        await cacheService.deletePattern('productos:tienda:*');
        await cacheService.deletePattern('productos:*');

        return result;
    }

    /** Establece publicado a true/false para varios productos (solo no eliminados). */
    async bulkSetPublicado(ids: number[], publicado: boolean): Promise<IBulkPublicadoResult> {
        if (!ids?.length) {
            return { count: 0 };
        }

        const result = await prisma.productos.updateMany({
            where: {
                id_prod: { in: ids },
                estado: { not: 0 }
            },
            data: {
                publicado,
                actualizado_en: new Date()
            }
        });

        await cacheService.deletePattern('productos:destacados:*');
        await cacheService.deletePattern('productos:tienda:*');
        await cacheService.deletePattern('productos:*');

        return { count: result.count };
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
            return cached;
        }


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

        const listasMap = await this.getListasMap();
        const productosNormalizados = this.normalizeProductos(productosPaginados, listasMap);

        const result = {
            data: productosNormalizados,
            total: productosConImagen.length,
            page,
            limit,
            totalPages: Math.ceil(productosConImagen.length / limit),
            // Incluir priceRange del resultado de getAll
            priceRange: allProducts.priceRange
        };

        // Guardar en cache
        await cacheService.set(cacheKey, result, this.TTL_CATALOGO);

        return result;
    }

    // Tienda: solo productos activos + publicados; filtros opcionales (categoría, marca, grupo, etc.)
    async getProductosTienda(filters?: IProductoFilters): Promise<IPaginatedResponse<IProductos>> {
        const cacheKey = `productos:tienda:${JSON.stringify(filters || {})}`;
        const cached = await cacheService.get<IPaginatedResponse<IProductos>>(cacheKey);
        if (cached) {
            return cached;
        }

        const {
            page = 1,
            limit = 21,
            order_by = 'creado_en',
            order = 'desc',
            busqueda,
            id_cat,
            id_marca,
            precio_min,
            precio_max,
            destacado,
            financiacion
        } = filters || {};

        // Regla de oro tienda: solo productos ACTIVOS (estado=1) y PUBLICADOS
        const whereClause: any = {
            estado: 1,
            publicado: true
        };

        // Filtros opcionales
        if (busqueda) {
            whereClause.OR = [
                { nombre: { contains: busqueda, mode: 'insensitive' } },
                { codi_arti: { contains: busqueda, mode: 'insensitive' } },
                { descripcion: { contains: busqueda, mode: 'insensitive' } }
            ];
        }

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

        if (precio_min !== undefined || precio_max !== undefined) {
            const gte = precio_min !== undefined ? precio_min : undefined;
            const lte = precio_max !== undefined ? precio_max : undefined;
            const cond = (col: string) => {
                const c: any = {};
                if (gte !== undefined) c.gte = gte;
                if (lte !== undefined) c.lte = lte;
                return Object.keys(c).length ? { [col]: c } : {};
            };
            const priceOr = [
                { lista_precio_activa: 'V', ...cond('precio_venta') },
                { lista_precio_activa: 'O', ...cond('precio_especial') },
                { lista_precio_activa: 'P', ...cond('precio_pvp') },
                { lista_precio_activa: 'Q', ...cond('precio_campanya') },
                { lista_precio_activa: null, ...cond('precio_venta') }
            ].filter((o: any) => Object.keys(o).length > 1);
            if (priceOr.length > 0) {
                whereClause.AND = (whereClause.AND || []).concat({ OR: priceOr });
            }
        }
        if (destacado !== undefined) whereClause.destacado = destacado;
        if (financiacion !== undefined) whereClause.financiacion = financiacion;

        // Contar total
        const total = await prisma.productos.count({ where: whereClause });

        // Obtener productos con relaciones
        const productos = await prisma.productos.findMany({
            where: whereClause,
            include: {
                categoria: true,
                marca: true,
                grupo: true,
                iva: true
            },
            orderBy: {
                [order_by]: order
            },
            skip: (page - 1) * limit,
            take: limit
        });

        const listasMap = await this.getListasMap();
        const productosNormalizados = this.normalizeProductos(productos, listasMap);

        const precioStats = await prisma.productos.aggregate({
            where: whereClause,
            _min: { precio_venta: true, precio_especial: true, precio_pvp: true, precio_campanya: true },
            _max: { precio_venta: true, precio_especial: true, precio_pvp: true, precio_campanya: true }
        });

        const result: IPaginatedResponse<IProductos> = {
            data: productosNormalizados,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            priceRange: (() => {
                const mins = [precioStats._min.precio_venta, precioStats._min.precio_especial, precioStats._min.precio_pvp, precioStats._min.precio_campanya].filter(Boolean);
                const maxs = [precioStats._max.precio_venta, precioStats._max.precio_especial, precioStats._max.precio_pvp, precioStats._max.precio_campanya].filter(Boolean);
                if (mins.length === 0 || maxs.length === 0) return undefined;
                return { min: Math.min(...mins.map(Number)), max: Math.max(...maxs.map(Number)) };
            })()
        };

        // Guardar en cache
        await cacheService.set(cacheKey, result, this.TTL_CATALOGO);

        return result;
    }
}
