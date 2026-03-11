import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { IVenta, IVentaFilters, IPaginatedResponse, ICreateVentaDTO, IUpdateVentaDTO } from '../types';
import cacheService from './cache.service';
import mailService from '../mail';
import { paymentProcessingService } from './payment-processing.service';
import { eventBus } from '../infrastructure/event-bus/event-bus';
import { SaleEventType, SaleEventFactory } from '../domain/events/sale.events';
import { direccionesService } from './direcciones.service';
import { mercadoPagoService } from './mercado-pago.service';
import { ConfigTiendaService } from './config-tienda.service';
import { ProductosService } from './productos.service';

const configTiendaService = new ConfigTiendaService();
const productosService = new ProductosService();

export class VentasService {
    private TTL_VENTA = 3600; // 1 hora
    private TTL_LISTA = 1800; // 30 minutos

    async getAll(filters: IVentaFilters): Promise<IPaginatedResponse<IVenta>> {
        const cacheKey = `ventas:all:${JSON.stringify(filters)}`;
        
        const cached = await cacheService.get<IPaginatedResponse<IVenta>>(cacheKey);
        if (cached) {
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
            incluir_canceladas = false,
        } = filters;

        const whereClause: any = {};

        // Búsqueda por ID de venta, cliente (nombre, email) o DNI/CUIT (numero_documento)
        if (busqueda) {
            const term = busqueda.trim();
            const onlyDigits = term.replace(/\D/g, '');
            const docConditions: any[] = [];
            if (term.length > 0) docConditions.push({ numero_documento: { contains: term, mode: 'insensitive' as const } });
            if (onlyDigits.length > 0 && onlyDigits !== term) docConditions.push({ numero_documento: { contains: onlyDigits, mode: 'insensitive' as const } });
            whereClause.OR = [
                { id_venta: { equals: parseInt(term) || -1 } },
                {
                    cliente: {
                        usuarios: {
                            OR: [
                                { nombre: { contains: term, mode: 'insensitive' } },
                                { apellido: { contains: term, mode: 'insensitive' } },
                                { email: { contains: term, mode: 'insensitive' } },
                                ...docConditions,
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
        if (!incluir_canceladas) {
            whereClause.estado_pago = estado_pago && estado_pago !== 'cancelado'
                ? estado_pago
                : { not: 'cancelado' };
        }

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
                usuarios: true,
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
            usuario: venta.usuarios ? {
                ...venta.usuarios,
                estado: venta.usuarios.estado as any,
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
                bonificacion_porcentaje: detalle.bonificacion_porcentaje ? Number(detalle.bonificacion_porcentaje) : null,
                tipo_descuento: detalle.tipo_descuento as any,
                producto: detalle.productos ? {
                    ...detalle.productos,
                } : null,
            })),
            envio: venta.envios && venta.envios.length > 0 ? {
                ...venta.envios[0],
                costo_envio: venta.envios[0].costo_envio ? Number(venta.envios[0].costo_envio) : null,
                estado_envio: venta.envios[0].estado_envio as any,
                // Número de seguimiento (número de pre-envío)
                codigoTracking: venta.envios[0].cod_seguimiento,
                numeroSeguimiento: venta.envios[0].cod_seguimiento, // Alias para claridad
                // URLs para consultar
                // Pre-envío (siempre funciona)
                preEnvioUrl: venta.envios[0].cod_seguimiento 
                    ? `/api/andreani/pre-envios/${venta.envios[0].cod_seguimiento}`
                    : null,
                // Envío real (solo funciona cuando fue aceptado)
                envioUrl: venta.envios[0].cod_seguimiento
                    ? `/api/andreani/envios/${venta.envios[0].cod_seguimiento}/estado`
                    : null,
                // Trazas del envío (solo funciona cuando fue aceptado)
                trazasUrl: venta.envios[0].cod_seguimiento
                    ? `/api/andreani/envios/${venta.envios[0].cod_seguimiento}/trazas`
                    : null,
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
                usuarios: true,
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
                direcciones: true,
                mercado_pago_payments: true,
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
            usuario: venta.usuarios ? {
                ...venta.usuarios,
                estado: venta.usuarios.estado as any,
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
                bonificacion_porcentaje: detalle.bonificacion_porcentaje ? Number(detalle.bonificacion_porcentaje) : null,
                tipo_descuento: detalle.tipo_descuento as any,
                producto: detalle.productos ? {
                    ...detalle.productos,
                } : null,
            })),
            envio: (venta as any).envios && (venta as any).envios.length > 0 ? {
                ...(venta as any).envios[0],
                costo_envio: (venta as any).envios[0].costo_envio ? Number((venta as any).envios[0].costo_envio) : null,
                estado_envio: (venta as any).envios[0].estado_envio as any,
                // Número de seguimiento (número de pre-envío)
                codigoTracking: (venta as any).envios[0].cod_seguimiento,
                numeroSeguimiento: (venta as any).envios[0].cod_seguimiento, // Alias para claridad
                // URLs para consultar
                // Pre-envío (siempre funciona)
                preEnvioUrl: (venta as any).envios[0].cod_seguimiento 
                    ? `/api/andreani/pre-envios/${(venta as any).envios[0].cod_seguimiento}`
                    : null,
                // Envío real (solo funciona cuando fue aceptado)
                envioUrl: (venta as any).envios[0].cod_seguimiento
                    ? `/api/andreani/envios/${(venta as any).envios[0].cod_seguimiento}/estado`
                    : null,
                // Trazas del envío (solo funciona cuando fue aceptado)
                trazasUrl: (venta as any).envios[0].cod_seguimiento
                    ? `/api/andreani/envios/${(venta as any).envios[0].cod_seguimiento}/trazas`
                    : null,
            } : null,
            direcciones: (venta as any).direcciones || [],
            mercado_pago_payments: (venta as any).mercado_pago_payments || undefined,
        };

        // Guardar en cache
        await cacheService.set(cacheKey, formattedVenta, this.TTL_VENTA);

        return formattedVenta;
    }

    /**
     * Obtiene ventas por IDs (para export). Excluye canceladas.
     */
    async getByIds(ids: number[]): Promise<IVenta[]> {
        if (!ids.length) return [];
        const uniqueIds = [...new Set(ids)];
        const ventas = await prisma.venta.findMany({
            where: {
                id_venta: { in: uniqueIds },
                estado_pago: { not: 'cancelado' },
            },
            orderBy: { fecha: 'desc' },
            include: {
                cliente: { include: { usuarios: true } },
                usuarios: true,
                venta_detalle: {
                    include: {
                        productos: { include: { categoria: true, marca: true } },
                    },
                },
            },
        });
        return ventas.map((venta: any) => ({
            ...venta,
            total_sin_iva: venta.total_sin_iva ? Number(venta.total_sin_iva) : null,
            total_con_iva: venta.total_con_iva ? Number(venta.total_con_iva) : null,
            descuento_total: venta.descuento_total ? Number(venta.descuento_total) : null,
            total_neto: venta.total_neto ? Number(venta.total_neto) : null,
            metodo_pago: venta.metodo_pago as any,
            estado_pago: venta.estado_pago as any,
            estado_envio: venta.estado_envio as any,
            tipo_venta: venta.tipo_venta as any,
            usuario: venta.usuarios ? { ...venta.usuarios, estado: venta.usuarios.estado as any } : null,
            cliente: venta.cliente
                ? {
                    ...venta.cliente,
                    usuario: venta.cliente.usuarios
                        ? { ...venta.cliente.usuarios, estado: venta.cliente.usuarios.estado as any }
                        : undefined,
                }
                : null,
            detalles: (venta.venta_detalle || []).map((d: any) => ({
                ...d,
                precio_unitario: d.precio_unitario ? Number(d.precio_unitario) : null,
                sub_total: d.sub_total ? Number(d.sub_total) : null,
                bonificacion_porcentaje: d.bonificacion_porcentaje ? Number(d.bonificacion_porcentaje) : null,
                producto: d.productos || null,
            })),
            envio: null,
        }));
    }

    /**
     * Exporta ventas seleccionadas a CSV (solo no canceladas).
     */
    async exportVentasCsv(ids: number[]): Promise<Buffer> {
        const ventas = await this.getByIds(ids);
        const sep = ';';
        const enc = (v: string | number | null | undefined): string => {
            const s = String(v ?? '').replace(/"/g, '""');
            return s.includes(sep) || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
        };
        const header = [
            'id_venta',
            'fecha',
            'cliente_nombre',
            'cliente_apellido',
            'cliente_email',
            'total_neto',
            'estado_pago',
            'estado_envio',
            'metodo_pago',
            'tipo_venta',
        ].join(sep);
        const rows = ventas.map((v) => {
            const nombre = v.cliente?.usuario?.nombre ?? '';
            const apellido = v.cliente?.usuario?.apellido ?? '';
            const email = v.cliente?.usuario?.email ?? '';
            const fecha = v.fecha ? new Date(v.fecha).toISOString() : '';
            return [
                enc(v.id_venta),
                enc(fecha),
                enc(nombre),
                enc(apellido),
                enc(email),
                enc(v.total_neto),
                enc(v.estado_pago),
                enc(v.estado_envio),
                enc(v.metodo_pago),
                enc(v.tipo_venta),
            ].join(sep);
        });
        const csv = [header, ...rows].join('\r\n');
        return Buffer.from(csv, 'utf-8');
    }

    async create(data: ICreateVentaDTO, idUsuario?: string): Promise<IVenta> {
        // Calcular totales y guardar bonificación porcentual por línea
        let totalSinIva = 0;
        let totalConIva = 0;
        let descuentoTotal = 0;
        const productosPorId = new Map<number, { bonificacion_porcentaje: number | null }>();

        for (const detalle of data.detalles) {
            const producto = await prisma.productos.findUnique({
                where: { id_prod: detalle.id_prod },
                select: { bonificacion_porcentaje: true },
            });

            if (!producto) {
                throw new Error(`Producto ${detalle.id_prod} no encontrado`);
            }

            const boniProducto = producto.bonificacion_porcentaje != null ? Number(producto.bonificacion_porcentaje) : null;
            productosPorId.set(detalle.id_prod, { bonificacion_porcentaje: boniProducto });

            const precioUnitario = detalle.precio_unitario;
            const cantidad = detalle.cantidad;
            const baseLinea = precioUnitario * cantidad;
            const bonificacionPctRaw = (detalle as any).bonificacion_porcentaje ?? boniProducto ?? null;
            const bonificacionPct = bonificacionPctRaw != null
                ? Math.max(0, Math.min(100, Number(bonificacionPctRaw)))
                : null;
            const descuentoBonificacion = bonificacionPct != null ? (baseLinea * bonificacionPct) / 100 : 0;
            const descuentoManual = detalle.descuento_aplicado || 0;
            const descuento = descuentoManual + descuentoBonificacion;
            const subtotal = precioUnitario * cantidad - descuento;

            totalSinIva += subtotal;
            descuentoTotal += descuento;
        }

        // Calcular IVA (simplificado, debería calcularse por producto)
        totalConIva = totalSinIva * 1.21; // Asumiendo 21% de IVA
        // Incluir costo de envío en el total neto (si se proporciona)
        const costoEnvio = data.costo_envio || 0;
        const totalNeto = totalConIva + costoEnvio;

        // Si se proporciona id_cliente, verificar que exista o crearlo
        let idClienteFinal = data.id_cliente;
        
        if (idClienteFinal) {
            // Verificar si el cliente existe
            const clienteExistente = await prisma.cliente.findUnique({
                where: { id_usuario: idClienteFinal },
            });

            if (!clienteExistente) {
                // Verificar que el usuario exista en la tabla usuarios
                const usuarioExistente = await prisma.usuarios.findUnique({
                    where: { id_usuario: idClienteFinal },
                });

                if (!usuarioExistente) {
                    throw new Error(`Usuario con id ${idClienteFinal} no encontrado. El usuario debe existir antes de crear un pedido.`);
                }

                // Crear el cliente automáticamente
                await prisma.cliente.create({
                    data: {
                        id_usuario: idClienteFinal,
                        // Los demás campos pueden ser null y se completarán después
                    },
                });
            }
        }

        // Si la venta es para un cliente (usuario), verificar que esté activo
        const idUsuarioVenta = idClienteFinal || idUsuario;
        if (idUsuarioVenta) {
            const usuarioVenta = await prisma.usuarios.findUnique({
                where: { id_usuario: idUsuarioVenta },
                select: { activo: true },
            });
            if (usuarioVenta?.activo === false) {
                throw new Error('No se pueden realizar compras con una cuenta inactiva. Contactá al administrador.');
            }
        }

        // Crear venta con cod_interno automático usando transacción
        const venta = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 1. Crear la venta (sin cod_interno aún)
            const ventaCreada = await tx.venta.create({
                data: {
                    id_usuario: idUsuario || idClienteFinal || null,
                    id_cliente: idClienteFinal || null,
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
                        create: data.detalles.map((detalle) => {
                            const producto = productosPorId.get(detalle.id_prod);
                            const baseLinea = detalle.precio_unitario * detalle.cantidad;
                            const bonificacionPctRaw = (detalle as any).bonificacion_porcentaje ?? producto?.bonificacion_porcentaje ?? null;
                            const bonificacionPct = bonificacionPctRaw != null
                                ? Math.max(0, Math.min(100, Number(bonificacionPctRaw)))
                                : null;
                            const descuentoBonificacion = bonificacionPct != null ? (baseLinea * bonificacionPct) / 100 : 0;
                            const descuentoManual = detalle.descuento_aplicado || 0;
                            const descuentoLinea = descuentoManual + descuentoBonificacion;
                            return {
                                id_prod: detalle.id_prod,
                                cantidad: detalle.cantidad,
                                precio_unitario: detalle.precio_unitario,
                                descuento_aplicado: descuentoLinea,
                                sub_total: detalle.precio_unitario * detalle.cantidad - descuentoLinea,
                                evento_aplicado: detalle.evento_aplicado || null,
                                bonificacion_porcentaje: bonificacionPct,
                            };
                        }),
                    },
                },
            });

            // 2. Generar cod_interno en formato "MAX-00000001"
            const codInterno = 'MAX-' + ventaCreada.id_venta.toString().padStart(8, '0');

            // 3. Actualizar la venta con cod_interno
            return await tx.venta.update({
                where: { id_venta: ventaCreada.id_venta },
                data: {
                    cod_interno: codInterno,
                },
                include: {
                    cliente: {
                        include: {
                            usuarios: true,
                        },
                    },
                    usuarios: true,
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
        });

        // Invalidar cache
        await cacheService.deletePattern('ventas:*');

        const ventaCompleta = await this.getById(venta.id_venta);

        // NOTA: Evento SALE_CREATED ahora se emite SOLO cuando estado_pago = 'aprobado'
        // Esto se hace desde PaymentProcessingService.confirmPayment()
        // Mantenemos esta emisión para ventas pendientes por compatibilidad (puede ser útil para WebSocket)
        // Pero los handlers del Event Bus solo se ejecutan cuando estado = 'aprobado'
        if (ventaCompleta.estado_pago === 'pendiente' && ventaCompleta.fecha) {
            const event = SaleEventFactory.createSaleCreated({
                id_venta: ventaCompleta.id_venta,
                estado_pago: ventaCompleta.estado_pago,
                fecha: ventaCompleta.fecha.toISOString(),
                venta: ventaCompleta, // Incluir datos completos
            });
            await eventBus.emit(SaleEventType.SALE_CREATED, event.payload).catch((error) => {
                console.error('❌ [VentasService] Error al emitir evento SALE_CREATED:', error);
            });
        }

        // NO enviar email aquí - los emails se envían desde:
        // - createFromCheckout(): envía email de pedido pendiente
        // - confirmPayment(): envía email de pago confirmado

        return ventaCompleta;
    }

        /**
         * Crea un pedido desde el checkout (frontend)
         * Normaliza el método de pago y crea la venta en estado pendiente
         * Si el cliente no existe, lo crea automáticamente
         */
        async createFromCheckout(data: {
            id_cliente?: string;
            metodo_pago: string;
            detalles: Array<{
                id_prod: number;
                cantidad: number;
                precio_unitario: number;
                descuento_aplicado?: number;
                bonificacion_porcentaje?: number;
            }>;
            observaciones?: string;
            costo_envio?: number; // Costo del envío calculado desde cotización
            id_direccion?: string; // ID de dirección guardada (opcional)
            // Datos de documento del cliente
            tipo_documento?: string; // DNI, CUIT, etc.
            numero_documento?: string; // Número de documento
            // Datos de dirección para actualizar el cliente (si no se usa id_direccion)
            direccion?: {
                direccion?: string;
                altura?: string;
                piso?: string;
                dpto?: string;
                ciudad?: string;
                provincia?: string;
                cod_postal?: number | null;
                telefono?: string;
            };
        }, idUsuario?: string): Promise<IVenta> {
            // Normalizar método de pago
            const metodoPagoNormalizado = this.normalizePaymentMethod(data.metodo_pago);

            // Si se proporciona id_cliente, verificar que exista o crearlo
            let idClienteFinal = data.id_cliente;
            
            if (idClienteFinal) {
                // Verificar si el cliente existe
                const clienteExistente = await prisma.cliente.findUnique({
                    where: { id_usuario: idClienteFinal },
                });

                if (!clienteExistente) {
                    // Verificar que el usuario exista en la tabla usuarios
                    const usuarioExistente = await prisma.usuarios.findUnique({
                        where: { id_usuario: idClienteFinal },
                    });

                    if (!usuarioExistente) {
                        throw new Error(`Usuario con id ${idClienteFinal} no encontrado. El usuario debe existir antes de crear un pedido.`);
                    }

                    // Crear el cliente automáticamente
                    await prisma.cliente.create({
                        data: {
                            id_usuario: idClienteFinal,
                            // Los demás campos pueden ser null y se completarán después
                        },
                    });
                }

                // Si se proporciona id_direccion, usar esa dirección guardada
                if (data.id_direccion && idUsuario) {
                    try {
                        const direccionGuardada = await direccionesService.getById(data.id_direccion, idUsuario);
                        
                        // Actualizar cliente con datos de la dirección guardada
                        const updateData: any = {
                            direccion: direccionGuardada.direccion || null,
                            altura: direccionGuardada.altura || null,
                            piso: direccionGuardada.piso || null,
                            dpto: direccionGuardada.dpto || null,
                            ciudad: direccionGuardada.ciudad || null,
                            provincia: direccionGuardada.provincia || null,
                            cod_postal: direccionGuardada.cod_postal || null,
                        };
                        
                        await prisma.cliente.update({
                            where: { id_usuario: idClienteFinal },
                            data: updateData,
                        });
                    } catch (error: any) {
                        console.warn(`⚠️ [VentasService] Error al obtener dirección guardada: ${error.message}. Usando datos de dirección proporcionados.`);
                        // Si falla, continuar con la lógica de dirección normal
                    }
                }
                
                // Actualizar datos de dirección del cliente si se proporcionan (y no se usó id_direccion)
                if (data.direccion && !data.id_direccion) {
                    const updateData: any = {};
                    
                    if (data.direccion.direccion) {
                        updateData.direccion = data.direccion.direccion;
                    }
                    if (data.direccion.altura) {
                        updateData.altura = data.direccion.altura;
                    }
                    if (data.direccion.piso) {
                        updateData.piso = data.direccion.piso;
                    }
                    if (data.direccion.dpto) {
                        updateData.dpto = data.direccion.dpto;
                    }
                    if (data.direccion.ciudad) {
                        updateData.ciudad = data.direccion.ciudad;
                    }
                    if (data.direccion.provincia) {
                        updateData.provincia = data.direccion.provincia;
                    }
                    // Mejorar validación del código postal
                    if (data.direccion.cod_postal !== undefined && 
                        data.direccion.cod_postal !== null && 
                        !isNaN(data.direccion.cod_postal) &&
                        data.direccion.cod_postal > 0) {
                        updateData.cod_postal = data.direccion.cod_postal;
                    } else if (data.direccion.cod_postal === null || data.direccion.cod_postal === undefined) {
                        console.warn(`⚠️ [VentasService] Código postal no válido o faltante para cliente ${idClienteFinal}. Valor recibido: ${data.direccion.cod_postal}`);
                    } else {
                        console.warn(`⚠️ [VentasService] Código postal inválido (NaN o <= 0) para cliente ${idClienteFinal}. Valor recibido: ${data.direccion.cod_postal}`);
                    }
                    
                    // Actualizar cliente si hay datos para actualizar
                    if (Object.keys(updateData).length > 0) {
                        await prisma.cliente.update({
                            where: { id_usuario: idClienteFinal },
                            data: updateData,
                        });
                    } else {
                        console.warn(`⚠️ [VentasService] No hay datos de dirección válidos para actualizar el cliente ${idClienteFinal}`);
                    }
                    
                    // Actualizar teléfono del usuario si se proporciona
                    if (data.direccion.telefono) {
                        await prisma.usuarios.update({
                            where: { id_usuario: idClienteFinal },
                            data: { telefono: data.direccion.telefono },
                        });
                    }
                }

                // Actualizar documento del usuario si se proporciona
                if (data.numero_documento || data.tipo_documento) {
                    const updateDocData: any = {};
                    if (data.numero_documento) {
                        updateDocData.numero_documento = data.numero_documento;
                    }
                    if (data.tipo_documento) {
                        updateDocData.tipo_documento = data.tipo_documento;
                    }
                    if (Object.keys(updateDocData).length > 0) {
                        await prisma.usuarios.update({
                            where: { id_usuario: idClienteFinal },
                            data: updateDocData,
                        });
                    }
                }
            }

            const createData: ICreateVentaDTO = {
                id_cliente: idClienteFinal,
                metodo_pago: metodoPagoNormalizado,
                tipo_venta: 'online', // Siempre online desde checkout
                observaciones: data.observaciones,
                costo_envio: data.costo_envio,
                detalles: data.detalles.map((detalle) => ({
                    id_prod: detalle.id_prod,
                    cantidad: detalle.cantidad,
                    precio_unitario: detalle.precio_unitario,
                    descuento_aplicado: detalle.descuento_aplicado || 0,
                    bonificacion_porcentaje: detalle.bonificacion_porcentaje,
                })),
            };

            // Crear la venta (estado pendiente, sin descontar stock)
            const venta = await this.create(createData, idUsuario);

            // Si se proporcionó costo de envío, guardarlo en la tabla envios
            if (data.costo_envio !== undefined && data.costo_envio !== null && data.costo_envio > 0) {
                
                // Buscar si ya existe un registro de envío para esta venta
                const envioExistente = await prisma.envios.findFirst({
                    where: { id_venta: venta.id_venta },
                });
                
                if (envioExistente) {
                    // Actualizar el envío existente con el costo
                    await prisma.envios.update({
                        where: { id_envio: envioExistente.id_envio },
                        data: {
                            costo_envio: data.costo_envio,
                        },
                    });
                } else {
                    // Crear un nuevo registro de envío con el costo
                    await prisma.envios.create({
                        data: {
                            id_venta: venta.id_venta,
                            empresa_envio: 'andreani',
                            costo_envio: data.costo_envio,
                            estado_envio: 'pendiente',
                            fecha_envio: new Date(),
                        },
                    });
                }
            }

            // NOTA: Evento SALE_CREATED ahora se emite SOLO cuando estado_pago = 'aprobado'
            // Esto se hace desde PaymentProcessingService.confirmPayment()
            // Mantenemos esta emisión para ventas pendientes por compatibilidad (puede ser útil para WebSocket)
            if (venta.estado_pago && venta.fecha) {
                const event = SaleEventFactory.createSaleCreated({
                    id_venta: venta.id_venta,
                    estado_pago: venta.estado_pago as 'pendiente' | 'aprobado' | 'cancelado',
                    fecha: venta.fecha.toISOString(),
                    venta: venta, // Incluir datos completos
                });
                await eventBus.emit(SaleEventType.SALE_CREATED, event.payload).catch((error) => {
                    console.error('❌ [VentasService] Error al emitir evento SALE_CREATED:', error);
                });
            }

            // Si el método de pago es Mercado Pago, crear preferencia de pago
            let mercadoPagoPreferenceUrl: string | null = null;
            
            if (metodoPagoNormalizado === 'mercadopago') {
                try {
                    // Verificar que el servicio esté configurado
                    if (!mercadoPagoService.isConfigured()) {
                        throw new Error('Mercado Pago no está configurado. Verifica las credenciales en .env');
                    }

                    // Cuotas sin interés: regla global (monto mínimo) + override por producto (cuotas_habilitadas).
                    // Si algún producto tiene cuotas_habilitadas=false → no ofrecer cuotas.
                    // Si total >= mínimo O algún producto tiene cuotas_habilitadas=true → ofrecer N cuotas (y limitar en MP con installments).
                    let defaultInstallments: number | undefined;
                    let maxInstallments: number | undefined;
                    try {
                        const installmentsConfig = await configTiendaService.getPaymentInstallmentsConfig();
                        const totalNetoVenta = Number(venta.total_neto || 0);
                        const cuotas = installmentsConfig.cuotasSinInteres;
                        const minimo = installmentsConfig.cuotasSinInteresMinimo;
                        const detalles = (venta as any).detalles || [];
                        const algunProductoSinCuotas = detalles.some((d: any) => d?.producto?.cuotas_habilitadas === false);
                        const algunProductoConCuotasForzadas = detalles.some((d: any) => d?.producto?.cuotas_habilitadas === true);
                        const cumpleMinimo = cuotas && minimo && totalNetoVenta >= minimo;

                        if (algunProductoSinCuotas) {
                            defaultInstallments = undefined;
                            maxInstallments = 1;
                            console.log(`💳 [VentasService] Venta #${venta.id_venta}: sin cuotas (producto con cuotas deshabilitadas en carrito)`);
                        } else if (cumpleMinimo || algunProductoConCuotasForzadas) {
                            const cuotasEnteras = Math.trunc(cuotas || 3);
                            if (cuotasEnteras > 1) {
                                defaultInstallments = cuotasEnteras;
                                maxInstallments = cuotasEnteras;
                                console.log(
                                    `💳 [VentasService] Cuotas para venta #${venta.id_venta}: ${defaultInstallments} (monto ${totalNetoVenta} ${cumpleMinimo ? '>= mínimo ' + minimo : ''} ${algunProductoConCuotasForzadas ? '| producto con cuotas habilitadas' : ''})`
                                );
                            }
                        }
                    } catch (configError: any) {
                        console.warn(`⚠️ [VentasService] No se pudo evaluar regla de cuotas sin interés: ${configError.message}`);
                    }

                    // Obtener URLs de retorno desde variables de entorno o usar defaults
                    // SIMPLIFICADO: En sandbox, usar URLs simples sin auto_return para evitar problemas
                    const baseUrl = process.env.DEFAULT_SUCCESS_URL 
                        ? process.env.DEFAULT_SUCCESS_URL.replace(/\/checkout\/resultado.*$/, '')
                        : process.env.FRONTEND_URL || 'http://localhost:3000';
                    
                    let successUrl = process.env.DEFAULT_SUCCESS_URL 
                        || process.env.MERCADOPAGO_SUCCESS_URL
                        || `${baseUrl}/checkout/resultado?status=approved`;
                    
                    let failureUrl = process.env.DEFAULT_FAILURE_URL 
                        || process.env.MERCADOPAGO_FAILURE_URL
                        || `${baseUrl}/checkout/resultado?status=rejected`;
                    
                    let pendingUrl = process.env.DEFAULT_PENDING_URL 
                        || process.env.MERCADOPAGO_PENDING_URL
                        || `${baseUrl}/checkout/resultado?status=pending`;
                    
                    // Determinar si usar auto_return
                    // En producción: usar auto_return si es HTTPS
                    // En desarrollo/sandbox: NO usar auto_return para evitar problemas
                    const isProduction = process.env.NODE_ENV === 'production' && process.env.MERCADOPAGO_ENV === 'production';
                    const isLocalhost = successUrl.includes('localhost') || successUrl.includes('127.0.0.1');
                    const isHttp = successUrl.startsWith('http://');
                    const shouldUseAutoReturn = isProduction && !isLocalhost && !isHttp;
                    
                    // Validar que las URLs sean válidas
                    if (!successUrl || !successUrl.startsWith('http')) {
                        throw new Error(`URL de éxito inválida: ${successUrl}. Debe ser una URL HTTP/HTTPS válida.`);
                    }

                    const backUrls = {
                        success: successUrl,
                        failure: failureUrl,
                        pending: pendingUrl,
                    };

                    // Crear preferencia de pago (maxInstallments limita en MP las opciones de cuotas)
                    const preference = await mercadoPagoService.createPreferenceFromVenta({
                        venta,
                        backUrls,
                        useAutoReturn: shouldUseAutoReturn,
                        defaultInstallments,
                        maxInstallments,
                    });

                    // Usar sandbox_init_point en modo test, init_point en producción
                    mercadoPagoPreferenceUrl = mercadoPagoService.getMode() === 'sandbox'
                        ? preference.sandbox_init_point
                        : preference.init_point;

                    console.log(`✅ [VentasService] Preferencia de MP creada para venta #${venta.id_venta}: ${preference.id}`);
                    console.log(`🔗 [VentasService] URL de pago: ${mercadoPagoPreferenceUrl}`);
                } catch (error: any) {
                    console.error(`❌ [VentasService] Error al crear preferencia de Mercado Pago:`, error);
                    // No lanzar error, pero loguear. La venta ya está creada.
                    // El frontend puede manejar la ausencia de URL mostrando un error.
                }
            }

            // Enviar emails según el método de pago
            const isExternalPayment = metodoPagoNormalizado === 'efectivo' || metodoPagoNormalizado === 'transferencia';
            
            if (isExternalPayment) {
                // Para pagos externos: enviar mail con datos bancarios + mail pendiente
                this.sendPaymentInstructionsEmail(venta).catch((error) => {
                    console.error('❌ Error al enviar email con datos bancarios:', error);
                });
                
                this.sendPendingOrderEmail(venta).catch((error) => {
                    console.error('❌ Error al enviar email de pedido pendiente:', error);
                });
            } else {
                // Para Mercado Pago: solo enviar mail pendiente (el webhook confirmará después)
                this.sendPendingOrderEmail(venta).catch((error) => {
                    console.error('❌ Error al enviar email de pedido pendiente:', error);
                });
            }

            // Agregar URL de Mercado Pago a la venta (si existe)
            if (mercadoPagoPreferenceUrl) {
                (venta as any).mercadoPagoPreferenceUrl = mercadoPagoPreferenceUrl;
            }

            return venta;
        }

    /**
     * Normaliza el método de pago para mantener consistencia
     * efectivo y transferencia se mantienen como están (son pagos externos)
     */
    private normalizePaymentMethod(metodo: string): 'efectivo' | 'transferencia' | 'mercadopago' | 'tarjeta_credito' | 'tarjeta_debito' | 'otro' {
        const metodoLower = metodo.toLowerCase().trim();
        
        if (metodoLower === 'efectivo') return 'efectivo';
        if (metodoLower === 'transferencia') return 'transferencia';
        if (metodoLower === 'mercadopago' || metodoLower === 'mercado_pago' || metodoLower === 'mp') return 'mercadopago';
        if (metodoLower === 'credito' || metodoLower === 'tarjeta_credito') return 'tarjeta_credito';
        if (metodoLower === 'debito' || metodoLower === 'tarjeta_debito') return 'tarjeta_debito';
        
        return 'otro';
    }

    /**
     * Envía email con instrucciones de pago (datos bancarios)
     */
    private async sendPaymentInstructionsEmail(venta: IVenta): Promise<void> {
        try {
            // Obtener email del usuario/cliente
            let userEmail: string | null = null;
            let userName: string = 'Cliente';
            let userApellido: string = '';

            if (venta.cliente?.usuario?.email) {
                userEmail = venta.cliente.usuario.email;
                userName = venta.cliente.usuario.nombre || 'Cliente';
                userApellido = venta.cliente.usuario.apellido || '';
            } else if (venta.usuario?.email) {
                userEmail = venta.usuario.email;
                userName = venta.usuario.nombre || 'Cliente';
                userApellido = venta.usuario.apellido || '';
            }

            if (!userEmail) {
                console.warn(`⚠️ [VentasService] No se encontró email para enviar instrucciones de pago (Venta #${venta.id_venta})`);
                return;
            }

            const datosBancarios = await configTiendaService.getDatosBancarios();

            await mailService.sendPaymentInstructions({
                orderId: venta.id_venta,
                total: venta.total_neto || 0,
                totalFormatted: `$${(venta.total_neto || 0).toFixed(2)}`,
                metodoPago: venta.metodo_pago || 'transferencia',
                cliente: {
                    email: userEmail,
                    nombre: userName,
                    apellido: userApellido,
                },
                datosBancarios: datosBancarios ?? null,
            });
        } catch (error) {
            console.error(`❌ [VentasService] Error al enviar email con instrucciones de pago:`, error);
        }
    }

    /**
     * Envía email de pedido pendiente
     */
    private async sendPendingOrderEmail(venta: IVenta): Promise<void> {
        try {
            // Obtener email del usuario/cliente
            let userEmail: string | null = null;
            let userName: string = 'Cliente';
            let userApellido: string = '';

            if (venta.cliente?.usuario?.email) {
                userEmail = venta.cliente.usuario.email;
                userName = venta.cliente.usuario.nombre || 'Cliente';
                userApellido = venta.cliente.usuario.apellido || '';
            } else if (venta.usuario?.email) {
                userEmail = venta.usuario.email;
                userName = venta.usuario.nombre || 'Cliente';
                userApellido = venta.usuario.apellido || '';
            }

            if (!userEmail) {
                console.warn(`⚠️ [VentasService] No se encontró email para enviar email pendiente (Venta #${venta.id_venta})`);
                return;
            }

            const productos = venta.detalles?.map((detalle) => ({
                nombre: detalle.producto?.nombre || 'Producto sin nombre',
                cantidad: detalle.cantidad || 0,
                precioUnitario: detalle.precio_unitario || 0,
                subtotal: detalle.sub_total || 0,
            })) || [];

            await mailService.sendOrderPending({
                orderId: venta.id_venta,
                total: venta.total_neto || 0,
                totalFormatted: `$${(venta.total_neto || 0).toFixed(2)}`,
                fecha: venta.fecha || new Date(),
                cliente: {
                    email: userEmail,
                    nombre: userName,
                    apellido: userApellido,
                },
            });
        } catch (error) {
            console.error(`❌ [VentasService] Error al enviar email de pedido pendiente:`, error);
        }
    }

    /**
     * Envía email de cancelación de pedido
     */
    private async sendCancellationEmail(venta: IVenta): Promise<void> {
        try {
            // Obtener email del usuario/cliente
            let userEmail: string | null = null;
            let userName: string = 'Cliente';
            let userApellido: string = '';

            if (venta.cliente?.usuario?.email) {
                userEmail = venta.cliente.usuario.email;
                userName = venta.cliente.usuario.nombre || 'Cliente';
                userApellido = venta.cliente.usuario.apellido || '';
            } else if (venta.usuario?.email) {
                userEmail = venta.usuario.email;
                userName = venta.usuario.nombre || 'Cliente';
                userApellido = venta.usuario.apellido || '';
            }

            if (!userEmail) {
                console.warn(`⚠️ [VentasService] No se encontró email para enviar email de cancelación (Venta #${venta.id_venta})`);
                return;
            }

            await mailService.sendOrderCancelled({
                orderId: venta.id_venta,
                orderNumber: `#${venta.id_venta}`,
                cliente: {
                    email: userEmail,
                    nombre: userName,
                    apellido: userApellido,
                },
            });
        } catch (error) {
            console.error(`❌ [VentasService] Error al enviar email de cancelación:`, error);
        }
    }

    /**
     * @deprecated Este método ya no se usa.
     * Los emails se envían desde:
     * - createFromCheckout(): envía email de pedido pendiente
     * - confirmPayment() (payment-processing.service.ts): envía email de pago confirmado
     * 
     * Envía email de confirmación de pedido (no bloqueante)
     */
    private async sendOrderConfirmationEmail(venta: IVenta): Promise<void> {
        try {
            // Obtener email del usuario/cliente
            let userEmail: string | null = null;
            let userName: string = 'Cliente';
            let userApellido: string = '';

            if (venta.cliente?.usuario?.email) {
                userEmail = venta.cliente.usuario.email;
                userName = venta.cliente.usuario.nombre || 'Cliente';
                userApellido = venta.cliente.usuario.apellido || '';
            } else if (venta.usuario?.email) {
                userEmail = venta.usuario.email;
                userName = venta.usuario.nombre || 'Cliente';
                userApellido = venta.usuario.apellido || '';
            }

            if (!userEmail) {
                console.warn(`⚠️ [VentasService] No se encontró email para la venta #${venta.id_venta}`);
                return;
            }

            // Determinar si es pago externo (efectivo/transferencia)
            const isExternalPayment = venta.metodo_pago === 'efectivo' || venta.metodo_pago === 'transferencia';

            // Formatear productos para el template
            const productos = venta.detalles?.map((detalle) => ({
                nombre: detalle.producto?.nombre || 'Producto sin nombre',
                cantidad: detalle.cantidad || 0,
                precioUnitario: detalle.precio_unitario || 0,
                subtotal: detalle.sub_total || 0,
            })) || [];

            // Obtener etiqueta del método de pago
            const metodoPagoLabels: Record<string, string> = {
                efectivo: 'Efectivo (Pago en punto físico)',
                transferencia: 'Transferencia Bancaria',
                mercadopago: 'Mercado Pago',
                tarjeta_credito: 'Tarjeta de Crédito',
                tarjeta_debito: 'Tarjeta de Débito',
                otro: 'Otro',
            };

            await mailService.sendOrderConfirmation({
                orderId: venta.id_venta,
                total: venta.total_neto || 0,
                totalFormatted: `$${(venta.total_neto || 0).toFixed(2)}`,
                fecha: venta.fecha || new Date(),
                metodoPago: metodoPagoLabels[venta.metodo_pago || ''] || venta.metodo_pago || 'No especificado',
                estadoPago: isExternalPayment ? 'reservado' : 'confirmado',
                productos,
                cliente: {
                    email: userEmail,
                    nombre: userName,
                    apellido: userApellido,
                },
            });
        } catch (error) {
            console.error(`❌ [VentasService] Error al enviar email para venta #${venta.id_venta}:`, error);
            // No lanzar error para no interrumpir el flujo
        }
    }

    async update(id: number, data: IUpdateVentaDTO): Promise<IVenta> {
        // 1. Obtener venta actual para comparar estados
        const ventaActual = await this.getById(id);
        const estadoPagoAnterior = ventaActual.estado_pago;
        const estadoPagoNuevo = data.estado_pago;

        // 2. Si el estado de pago cambió a 'aprobado' (y antes era 'pendiente'), ejecutar confirmación primero
        if (
            estadoPagoNuevo === 'aprobado' && 
            estadoPagoAnterior !== 'aprobado' &&
            estadoPagoAnterior === 'pendiente'
        ) {
            
            try {
                // Ejecutar confirmación de pago (bloqueante - si falla, lanzará error)
                // confirmPayment ya actualiza el estado_pago a 'aprobado', descuenta stock, crea Andreani y envía mails
                const ventaConfirmada = await paymentProcessingService.confirmPayment(id, {
                    notas: 'Pago aprobado desde edición manual',
                });


                // Si hay otros campos para actualizar además del estado_pago (que ya se actualizó)
                const camposAdicionales: any = {};
                
                // ⚠️ IMPORTANTE: NO sobrescribir estado_envio si Andreani ya lo estableció
                // El estado_envio lo maneja Andreani automáticamente cuando hay un envío creado
                // Solo actualizar si NO hay un envío creado (id_envio es null)
                if (data.estado_envio && !ventaConfirmada.id_envio) {
                    // Solo si no hay envío de Andreani, permitir actualización manual
                    camposAdicionales.estado_envio = data.estado_envio;
                }
                
                if (data.metodo_pago && data.metodo_pago !== ventaConfirmada.metodo_pago) {
                    camposAdicionales.metodo_pago = data.metodo_pago;
                }
                if (data.observaciones !== undefined && data.observaciones !== ventaConfirmada.observaciones) {
                    camposAdicionales.observaciones = data.observaciones;
                }
                if (data.id_envio !== undefined && data.id_envio !== ventaConfirmada.id_envio) {
                    camposAdicionales.id_envio = data.id_envio;
                }
                if (data.referencia_pago_manual !== undefined) camposAdicionales.referencia_pago_manual = data.referencia_pago_manual;
                if (data.referencia_facturacion !== undefined) camposAdicionales.referencia_facturacion = data.referencia_facturacion;

                // Si hay campos adicionales, actualizarlos
                if (Object.keys(camposAdicionales).length > 0) {
                    camposAdicionales.actualizado_en = new Date();
                    await prisma.venta.update({
                        where: { id_venta: id },
                        data: camposAdicionales,
                    });

                    // Invalidar cache
                    await cacheService.delete(`venta:${id}`);
                    await cacheService.deletePattern('ventas:*');
                }

                // Retornar venta actualizada
                return await this.getById(id);
            } catch (error: any) {
                console.error(`❌ [VentasService] Error al confirmar pago para venta #${id}:`, error);
                // Lanzar error para que no se actualice la venta (rollback)
                throw new Error(
                    `Error al confirmar pago: ${error.message}. ` +
                    `La venta no fue actualizada. Verifica el stock y los datos antes de intentar nuevamente.`
                );
            }
        }

        // 3. Si no es cambio a 'aprobado', actualizar normalmente
        // ⚠️ IMPORTANTE: Solo actualizar estado_envio si no hay envío de Andreani
        // El estado_envio lo maneja Andreani automáticamente cuando hay un envío creado
        const updateData: any = {
            estado_pago: data.estado_pago,
            metodo_pago: data.metodo_pago,
            observaciones: data.observaciones,
            id_envio: data.id_envio,
            actualizado_en: new Date(),
        };
        if (data.referencia_pago_manual !== undefined) updateData.referencia_pago_manual = data.referencia_pago_manual;
        if (data.referencia_facturacion !== undefined) updateData.referencia_facturacion = data.referencia_facturacion;
        
        // Solo actualizar estado_envio si no hay envío de Andreani
        if (data.estado_envio && !ventaActual.id_envio) {
            updateData.estado_envio = data.estado_envio;
        } else if (!ventaActual.id_envio) {
            // Si no hay envío y no se envía estado_envio, mantener el actual
            updateData.estado_envio = ventaActual.estado_envio;
        }
        // Si hay id_envio, no tocamos estado_envio (lo maneja Andreani)
        
        const venta = await prisma.venta.update({
            where: { id_venta: id },
            data: updateData,
        });

        // Invalidar cache
        await cacheService.delete(`venta:${id}`);
        await cacheService.deletePattern('ventas:*');

        return this.getById(id);
    }

    async delete(id: number): Promise<void> {
        // Obtener venta antes de cancelar (para email y, si estaba aprobada, devolver stock)
        const venta = await this.getById(id);

        if (venta?.estado_pago === 'cancelado') {
            throw new Error('La venta ya está dada de baja');
        }

        // Al eliminar (soft delete = cancelar): si la venta estaba aprobada, devolver el stock al inventario
        if (venta?.estado_pago === 'aprobado') {
            await this.devolverStockVenta(venta);
        }

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

        // Enviar email de cancelación (no bloqueante)
        if (venta) {
            this.sendCancellationEmail(venta).catch((error) => {
                console.error('❌ Error al enviar email de cancelación:', error);
            });
        }
    }

    async updateEstadoPago(id: number, estado: string): Promise<IVenta> {
        const ventaAnterior = await this.getById(id);

        // Al pasar a 'cancelado' desde 'aprobado': devolver el stock que se había descontado (idempotente: solo si antes estaba aprobado)
        if (estado === 'cancelado' && ventaAnterior?.estado_pago === 'aprobado') {
            await this.devolverStockVenta(ventaAnterior);
        }

        const ventaActualizada = await this.update(id, { estado_pago: estado as any });

        // Si el estado cambió a 'cancelado', enviar email de cancelación
        if (estado === 'cancelado' && ventaAnterior?.estado_pago !== 'cancelado') {
            this.sendCancellationEmail(ventaActualizada).catch((error) => {
                console.error('❌ Error al enviar email de cancelación:', error);
            });
        }

        return ventaActualizada;
    }

    /**
     * Devuelve al inventario el stock de los productos de una venta (cuando se cancela una venta aprobada).
     * Solo debe llamarse cuando la venta estaba en estado_pago === 'aprobado'.
     */
    private async devolverStockVenta(venta: IVenta): Promise<void> {
        if (!venta.detalles || venta.detalles.length === 0) {
            return;
        }

        for (const detalle of venta.detalles) {
            const idProd = detalle.id_prod;
            const cantidad = detalle.cantidad ?? 0;
            if (idProd == null || cantidad <= 0) {
                continue;
            }

            try {
                await productosService.updateStock(idProd, cantidad);
            } catch (error) {
                console.error(
                    `❌ [VentasService] Error al devolver stock del producto #${idProd} (venta #${venta.id_venta}):`,
                    error
                );
                throw error;
            }
        }
    }

    async updateEstadoEnvio(id: number, estado: string): Promise<IVenta> {
        return this.update(id, { estado_envio: estado as any });
    }

    /**
     * Actualiza los datos de envío de una venta (número de seguimiento y/o empresa de transporte).
     * Si la venta ya tiene un registro en envios, lo actualiza; si no, crea uno nuevo.
     * Referencia: cod_seguimiento = número de seguimiento del correo; empresa_envio = nombre del transporte.
     */
    async updateEnvio(
        idVenta: number,
        data: { cod_seguimiento?: string | null; empresa_envio?: string | null }
    ): Promise<IVenta> {
        const venta = await this.getById(idVenta);
        if (!venta) throw new Error('Venta no encontrada');

        const payload: { cod_seguimiento?: string | null; empresa_envio?: string | null } = {};
        if (data.cod_seguimiento !== undefined) payload.cod_seguimiento = data.cod_seguimiento || null;
        if (data.empresa_envio !== undefined) payload.empresa_envio = data.empresa_envio || null;
        if (Object.keys(payload).length === 0) return venta;

        const envioExistente = venta.envio;
        if (envioExistente?.id_envio) {
            await prisma.envios.update({
                where: { id_envio: envioExistente.id_envio },
                data: payload,
            });
        } else {
            const created = await prisma.envios.create({
                data: {
                    id_venta: idVenta,
                    empresa_envio: payload.empresa_envio ?? null,
                    cod_seguimiento: payload.cod_seguimiento ?? null,
                    estado_envio: venta.estado_envio ?? 'pendiente',
                    fecha_envio: new Date(),
                },
            });
            await prisma.venta.update({
                where: { id_venta: idVenta },
                data: { id_envio: created.id_envio, actualizado_en: new Date() },
            });
        }

        await cacheService.delete(`venta:${idVenta}`);
        await cacheService.deletePattern('ventas:*');
        return this.getById(idVenta);
    }

    /**
     * Obtiene los pedidos del usuario autenticado
     * Busca tanto en id_usuario como en id_cliente (ya que un cliente es un usuario que hizo una compra)
     * OPTIMIZADO: Solo trae los campos necesarios para el frontend
     */
    async getMyPedidos(idUsuario: string, filters: IVentaFilters = {}): Promise<IPaginatedResponse<IVenta>> {
        const cacheKey = `ventas:my:${idUsuario}:${JSON.stringify(filters)}`;
        
        const cached = await cacheService.get<IPaginatedResponse<IVenta>>(cacheKey);
        if (cached) {
            return cached;
        }

        const {
            page = 1,
            limit = 25,
            order_by = 'fecha',
            order = 'desc',
            estado_pago,
            estado_envio,
        } = filters;

        // Buscar ventas donde el usuario es el cliente (id_cliente = id_usuario)
        // o donde el usuario es el vendedor (id_usuario = id_usuario)
        const whereClause: any = {
            OR: [
                { id_cliente: idUsuario },
                { id_usuario: idUsuario },
            ],
        };

        // Aplicar filtros adicionales
        if (estado_pago) whereClause.estado_pago = estado_pago;
        if (estado_envio) whereClause.estado_envio = estado_envio;

        // Ordenamiento
        const orderBy: any = {};
        if (order_by === 'fecha') orderBy.fecha = order;
        else if (order_by === 'total_neto') orderBy.total_neto = order;
        else if (order_by === 'creado_en') orderBy.creado_en = order;
        else if (order_by === 'estado_pago') orderBy.estado_pago = order;
        else orderBy.fecha = 'desc';

        // Contar total
        const total = await prisma.venta.count({ where: whereClause });

        // Obtener solo los campos necesarios para optimizar la consulta
        const ventas = await prisma.venta.findMany({
            where: whereClause,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id_venta: true,
                fecha: true,
                total_sin_iva: true,
                total_con_iva: true,
                descuento_total: true,
                total_neto: true,
                metodo_pago: true,
                estado_pago: true,
                estado_envio: true,
                venta_detalle: {
                    select: {
                        id_detalle: true,
                        cantidad: true,
                        sub_total: true,
                        productos: {
                            select: {
                                nombre: true,
                            },
                        },
                    },
                },
                envios: {
                    select: {
                        id_envio: true,
                        empresa_envio: true,
                        estado_envio: true,
                        cod_seguimiento: true,
                        costo_envio: true,
                    },
                    take: 1, // Solo el primer envío
                },
            },
        });

        // Formatear respuesta con solo los campos necesarios
        const formattedVentas: IVenta[] = ventas.map((venta: any) => ({
            id_venta: venta.id_venta,
            fecha: venta.fecha,
            total_sin_iva: venta.total_sin_iva ? Number(venta.total_sin_iva) : null,
            total_con_iva: venta.total_con_iva ? Number(venta.total_con_iva) : null,
            descuento_total: venta.descuento_total ? Number(venta.descuento_total) : null,
            total_neto: venta.total_neto ? Number(venta.total_neto) : null,
            metodo_pago: venta.metodo_pago as any,
            estado_pago: venta.estado_pago as any,
            estado_envio: venta.estado_envio as any,
            detalles: venta.venta_detalle.map((detalle: any) => ({
                id_detalle: detalle.id_detalle,
                cantidad: detalle.cantidad,
                sub_total: detalle.sub_total ? Number(detalle.sub_total) : 0,
                producto: detalle.productos ? {
                    nombre: detalle.productos.nombre,
                } as any : null,
            })),
            envio: venta.envios && venta.envios.length > 0 ? {
                id_envio: venta.envios[0].id_envio,
                id_venta: venta.id_venta,
                empresa_envio: venta.envios[0].empresa_envio,
                estado_envio: venta.envios[0].estado_envio as any,
                cod_seguimiento: venta.envios[0].cod_seguimiento,
                costo_envio: venta.envios[0].costo_envio ? Number(venta.envios[0].costo_envio) : null,
                // Número de seguimiento (número de pre-envío)
                codigoTracking: venta.envios[0].cod_seguimiento,
                numeroSeguimiento: venta.envios[0].cod_seguimiento, // Alias para claridad
                // URLs para consultar
                // Pre-envío (siempre funciona)
                preEnvioUrl: venta.envios[0].cod_seguimiento 
                    ? `/api/andreani/pre-envios/${venta.envios[0].cod_seguimiento}`
                    : null,
                // Envío real (solo funciona cuando fue aceptado)
                envioUrl: venta.envios[0].cod_seguimiento
                    ? `/api/andreani/envios/${venta.envios[0].cod_seguimiento}/estado`
                    : null,
                // Trazas del envío (solo funciona cuando fue aceptado)
                trazasUrl: venta.envios[0].cod_seguimiento
                    ? `/api/andreani/envios/${venta.envios[0].cod_seguimiento}/trazas`
                    : null,
                // URLs legacy por compatibilidad
                consultaUrl: venta.envios[0].cod_seguimiento 
                    ? `/api/andreani/pre-envios/${venta.envios[0].cod_seguimiento}`
                    : null,
                trackingUrl: venta.envios[0].cod_seguimiento
                    ? `/api/andreani/envios/${venta.envios[0].cod_seguimiento}/estado`
                    : null,
            } as any : null,
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

    /**
     * Obtiene estadísticas de ventas usando agregaciones SQL (sin traer todos los registros)
     * Usa los mismos filtros que getAll pero solo calcula agregaciones
     */
    async getStats(filters: IVentaFilters = {}): Promise<{
        totalVentas: number;
        totalVendido: number;
        promedioVenta: number;
        ventasAprobadas: number;
    }> {
        const cacheKey = `ventas:stats:${JSON.stringify(filters)}`;
        
        const cached = await cacheService.get<{
            totalVentas: number;
            totalVendido: number;
            promedioVenta: number;
            ventasAprobadas: number;
        }>(cacheKey);
        if (cached) {
            return cached;
        }

        const {
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

        // Búsqueda por ID de venta, cliente (nombre, email) o DNI/CUIT (numero_documento)
        if (busqueda) {
            const term = busqueda.trim();
            const onlyDigits = term.replace(/\D/g, '');
            const docConditions: any[] = [];
            if (term.length > 0) docConditions.push({ numero_documento: { contains: term, mode: 'insensitive' as const } });
            if (onlyDigits.length > 0 && onlyDigits !== term) docConditions.push({ numero_documento: { contains: onlyDigits, mode: 'insensitive' as const } });
            whereClause.OR = [
                { id_venta: { equals: parseInt(term) || -1 } },
                {
                    cliente: {
                        usuarios: {
                            OR: [
                                { nombre: { contains: term, mode: 'insensitive' } },
                                { apellido: { contains: term, mode: 'insensitive' } },
                                { email: { contains: term, mode: 'insensitive' } },
                                ...docConditions,
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

        // Calcular estadísticas usando agregaciones
        // 1. Total de ventas (count)
        const totalVentas = await prisma.venta.count({ where: whereClause });

        // 2. Total vendido y promedio (agregaciones)
        const aggregation = await prisma.venta.aggregate({
            where: whereClause,
            _sum: {
                total_neto: true,
            },
            _avg: {
                total_neto: true,
            },
        });

        // 3. Ventas aprobadas (count con filtro adicional)
        const ventasAprobadas = await prisma.venta.count({
            where: {
                ...whereClause,
                estado_pago: 'aprobado',
            },
        });

        const totalVendido = aggregation._sum.total_neto ? Number(aggregation._sum.total_neto) : 0;
        const promedioVenta = aggregation._avg.total_neto ? Number(aggregation._avg.total_neto) : 0;

        const stats = {
            totalVentas,
            totalVendido,
            promedioVenta,
            ventasAprobadas,
        };

        // Guardar en cache (30 minutos)
        await cacheService.set(cacheKey, stats, this.TTL_LISTA);

        return stats;
    }
}

