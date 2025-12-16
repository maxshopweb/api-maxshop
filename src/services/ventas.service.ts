import { prisma } from '../index';
import { IVenta, IVentaFilters, IPaginatedResponse, ICreateVentaDTO, IUpdateVentaDTO } from '../types';
import cacheService from './cache.service';

export class VentasService {
    private TTL_VENTA = 3600; // 1 hora
    private TTL_LISTA = 1800; // 30 minutos

    async getAll(filters: IVentaFilters): Promise<IPaginatedResponse<IVenta>> {
        const cacheKey = `ventas:all:${JSON.stringify(filters)}`;
        
        const cached = await cacheService.get<IPaginatedResponse<IVenta>>(cacheKey);
        if (cached) {
            console.log(`✅ Lista de ventas encontrada en cache`);
            return cached;
        }

        const {
            page = 1,
            limit = 25,
            order_by = 'fecha',
            order = 'desc',
            busqueda,
            id_cliente,
            id_usuario,
            fecha_desde,
            fecha_hasta,
            estado_pago,
            estado_envio,
            metodo_pago,
            tipo_venta,
            total_min,
            total_max,
        } = filters;

        const whereClause: any = {};

        // Búsqueda por ID de venta o cliente
        if (busqueda) {
            whereClause.OR = [
                { id_venta: { equals: parseInt(busqueda) || -1 } },
                {
                    cliente: {
                        usuarios: {
                            OR: [
                                { nombre: { contains: busqueda, mode: 'insensitive' } },
                                { apellido: { contains: busqueda, mode: 'insensitive' } },
                                { email: { contains: busqueda, mode: 'insensitive' } },
                            ],
                        },
                    },
                },
            ];
        }

        if (id_cliente) whereClause.id_cliente = id_cliente;
        if (id_usuario) whereClause.id_usuario = id_usuario;

        // Filtros por fecha
        if (fecha_desde || fecha_hasta) {
            whereClause.fecha = {};
            if (fecha_desde) {
                whereClause.fecha.gte = new Date(fecha_desde);
            }
            if (fecha_hasta) {
                whereClause.fecha.lte = new Date(fecha_hasta);
            }
        }

        if (estado_pago) whereClause.estado_pago = estado_pago;
        if (estado_envio) whereClause.estado_envio = estado_envio;
        if (metodo_pago) whereClause.metodo_pago = metodo_pago;
        if (tipo_venta) whereClause.tipo_venta = tipo_venta;

        // Filtros por rango de total
        if (total_min !== undefined || total_max !== undefined) {
            whereClause.total_neto = {};
            if (total_min !== undefined) {
                whereClause.total_neto.gte = total_min;
            }
            if (total_max !== undefined) {
                whereClause.total_neto.lte = total_max;
            }
        }

        // Ordenamiento
        const orderBy: any = {};
        if (order_by === 'fecha') orderBy.fecha = order;
        else if (order_by === 'total_neto') orderBy.total_neto = order;
        else if (order_by === 'creado_en') orderBy.creado_en = order;
        else if (order_by === 'estado_pago') orderBy.estado_pago = order;
        else orderBy.fecha = 'desc';

        // Contar total
        const total = await prisma.venta.count({ where: whereClause });

        // Obtener datos con relaciones
        const ventas = await prisma.venta.findMany({
            where: whereClause,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
                cliente: {
                    include: {
                        usuarios: true,
                    },
                },
                usuario: true,
                venta_detalle: {
                    include: {
                        productos: {
                            include: {
                                categoria: true,
                                marca: true,
                                grupo: true,
                                iva: true,
                            },
                        },
                    },
                },
                envios: true,
            },
        });

        // Formatear respuesta
        const formattedVentas: IVenta[] = ventas.map((venta: any) => ({
            ...venta,
            total_sin_iva: venta.total_sin_iva ? Number(venta.total_sin_iva) : null,
            total_con_iva: venta.total_con_iva ? Number(venta.total_con_iva) : null,
            descuento_total: venta.descuento_total ? Number(venta.descuento_total) : null,
            total_neto: venta.total_neto ? Number(venta.total_neto) : null,
            metodo_pago: venta.metodo_pago as any,
            estado_pago: venta.estado_pago as any,
            estado_envio: venta.estado_envio as any,
            tipo_venta: venta.tipo_venta as any,
            usuario: venta.usuario ? {
                ...venta.usuario,
                estado: venta.usuario.estado as any,
            } : null,
            cliente: venta.cliente ? {
                ...venta.cliente,
                usuario: venta.cliente.usuarios ? {
                    ...venta.cliente.usuarios,
                    estado: venta.cliente.usuarios.estado as any,
                } : undefined,
            } : null,
            detalles: venta.venta_detalle.map((detalle: any) => ({
                ...detalle,
                precio_unitario: detalle.precio_unitario ? Number(detalle.precio_unitario) : null,
                descuento_aplicado: detalle.descuento_aplicado ? Number(detalle.descuento_aplicado) : null,
                sub_total: detalle.sub_total ? Number(detalle.sub_total) : null,
                tipo_descuento: detalle.tipo_descuento as any,
                producto: detalle.productos ? {
                    ...detalle.productos,
                } : null,
            })),
            envio: venta.envios && venta.envios.length > 0 ? {
                ...venta.envios[0],
                costo_envio: venta.envios[0].costo_envio ? Number(venta.envios[0].costo_envio) : null,
                estado_envio: venta.envios[0].estado_envio as any,
            } : null,
        }));

        const result: IPaginatedResponse<IVenta> = {
            data: formattedVentas,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };

        // Guardar en cache
        await cacheService.set(cacheKey, result, this.TTL_LISTA);

        return result;
    }

    async getById(id: number): Promise<IVenta> {
        const cacheKey = `venta:${id}`;
        
        const cached = await cacheService.get<IVenta>(cacheKey);
        if (cached) {
            console.log(`✅ Venta ${id} encontrada en cache`);
            return cached;
        }

        const venta = await prisma.venta.findUnique({
            where: { id_venta: id },
            include: {
                cliente: {
                    include: {
                        usuarios: true,
                    },
                },
                usuario: true,
                venta_detalle: {
                    include: {
                        productos: {
                            include: {
                                categoria: true,
                                marca: true,
                                grupo: true,
                                iva: true,
                            },
                        },
                    },
                },
                envios: true,
            },
        });

        if (!venta) {
            throw new Error('Venta no encontrada');
        }

        const formattedVenta: IVenta = {
            ...venta,
            total_sin_iva: venta.total_sin_iva ? Number(venta.total_sin_iva) : null,
            total_con_iva: venta.total_con_iva ? Number(venta.total_con_iva) : null,
            descuento_total: venta.descuento_total ? Number(venta.descuento_total) : null,
            total_neto: venta.total_neto ? Number(venta.total_neto) : null,
            metodo_pago: venta.metodo_pago as any,
            estado_pago: venta.estado_pago as any,
            estado_envio: venta.estado_envio as any,
            tipo_venta: venta.tipo_venta as any,
            usuario: venta.usuario ? {
                ...venta.usuario,
                estado: venta.usuario.estado as any,
            } : null,
            cliente: venta.cliente ? {
                ...venta.cliente,
                usuario: venta.cliente.usuarios ? {
                    ...venta.cliente.usuarios,
                    estado: venta.cliente.usuarios.estado as any,
                } : undefined,
            } : null,
            detalles: (venta as any).venta_detalle.map((detalle: any) => ({
                ...detalle,
                precio_unitario: detalle.precio_unitario ? Number(detalle.precio_unitario) : null,
                descuento_aplicado: detalle.descuento_aplicado ? Number(detalle.descuento_aplicado) : null,
                sub_total: detalle.sub_total ? Number(detalle.sub_total) : null,
                tipo_descuento: detalle.tipo_descuento as any,
                producto: detalle.productos ? {
                    ...detalle.productos,
                } : null,
            })),
            envio: (venta as any).envios && (venta as any).envios.length > 0 ? {
                ...(venta as any).envios[0],
                costo_envio: (venta as any).envios[0].costo_envio ? Number((venta as any).envios[0].costo_envio) : null,
                estado_envio: (venta as any).envios[0].estado_envio as any,
            } : null,
        };

        // Guardar en cache
        await cacheService.set(cacheKey, formattedVenta, this.TTL_VENTA);

        return formattedVenta;
    }

    async create(data: ICreateVentaDTO, idUsuario?: string): Promise<IVenta> {
        // Calcular totales
        let totalSinIva = 0;
        let totalConIva = 0;
        let descuentoTotal = 0;

        for (const detalle of data.detalles) {
            const producto = await prisma.productos.findUnique({
                where: { id_prod: detalle.id_prod },
            });

            if (!producto) {
                throw new Error(`Producto ${detalle.id_prod} no encontrado`);
            }

            const precioUnitario = detalle.precio_unitario;
            const cantidad = detalle.cantidad;
            const descuento = detalle.descuento_aplicado || 0;
            const subtotal = precioUnitario * cantidad - descuento;

            totalSinIva += subtotal;
            descuentoTotal += descuento;
        }

        // Calcular IVA (simplificado, debería calcularse por producto)
        totalConIva = totalSinIva * 1.21; // Asumiendo 21% de IVA
        const totalNeto = totalConIva;

        // Crear venta
        const venta = await prisma.venta.create({
            data: {
                id_usuario: idUsuario || null,
                id_cliente: data.id_cliente || null,
                fecha: new Date(),
                total_sin_iva: totalSinIva,
                total_con_iva: totalConIva,
                descuento_total: descuentoTotal,
                total_neto: totalNeto,
                metodo_pago: data.metodo_pago,
                estado_pago: 'pendiente',
                estado_envio: 'pendiente',
                tipo_venta: data.tipo_venta,
                observaciones: data.observaciones || null,
                venta_detalle: {
                    create: data.detalles.map((detalle) => ({
                        id_prod: detalle.id_prod,
                        cantidad: detalle.cantidad,
                        precio_unitario: detalle.precio_unitario,
                        descuento_aplicado: detalle.descuento_aplicado || 0,
                        sub_total: detalle.precio_unitario * detalle.cantidad - (detalle.descuento_aplicado || 0),
                        evento_aplicado: detalle.evento_aplicado || null,
                    })),
                },
            },
            include: {
                cliente: {
                    include: {
                        usuarios: true,
                    },
                },
                usuario: true,
                venta_detalle: {
                    include: {
                        productos: {
                            include: {
                                categoria: true,
                                marca: true,
                                grupo: true,
                                iva: true,
                            },
                        },
                    },
                },
            },
        });

        // Invalidar cache
        await cacheService.deletePattern('ventas:*');

        return this.getById(venta.id_venta);
    }

    async update(id: number, data: IUpdateVentaDTO): Promise<IVenta> {
        const venta = await prisma.venta.update({
            where: { id_venta: id },
            data: {
                estado_pago: data.estado_pago,
                estado_envio: data.estado_envio,
                metodo_pago: data.metodo_pago,
                observaciones: data.observaciones,
                id_envio: data.id_envio,
                actualizado_en: new Date(),
            },
        });

        // Invalidar cache
        await cacheService.delete(`venta:${id}`);
        await cacheService.deletePattern('ventas:*');

        return this.getById(id);
    }

    async delete(id: number): Promise<void> {
        // Soft delete: marcar como cancelada en lugar de eliminar
        await prisma.venta.update({
            where: { id_venta: id },
            data: {
                estado_pago: 'cancelado',
                estado_envio: 'cancelado',
                actualizado_en: new Date(),
            },
        });

        // Invalidar cache
        await cacheService.delete(`venta:${id}`);
        await cacheService.deletePattern('ventas:*');
    }

    async updateEstadoPago(id: number, estado: string): Promise<IVenta> {
        return this.update(id, { estado_pago: estado as any });
    }

    async updateEstadoEnvio(id: number, estado: string): Promise<IVenta> {
        return this.update(id, { estado_envio: estado as any });
    }
}

