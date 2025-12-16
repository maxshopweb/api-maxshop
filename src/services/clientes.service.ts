import { prisma } from '../index';
import { ICliente, IClienteFilters, IPaginatedResponse, IClienteStats } from '../types';
import cacheService from './cache.service';

export class ClientesService {
    private TTL_CLIENTE = 3600; // 1 hora
    private TTL_LISTA = 1800; // 30 minutos

    async getAll(filters: IClienteFilters): Promise<IPaginatedResponse<ICliente>> {
        const cacheKey = `clientes:all:${JSON.stringify(filters)}`;
        
        const cached = await cacheService.get<IPaginatedResponse<ICliente>>(cacheKey);
        if (cached) {
            console.log(`✅ Lista de clientes encontrada en cache`);
            return cached;
        }

        console.log(`❌ Lista de clientes no encontrada en cache`);

        const {
            page = 1,
            limit = 25,
            order_by = 'creado_en',
            order = 'desc',
            estado,
            busqueda,
            ciudad,
            provincia,
            creado_desde,
            creado_hasta,
            ultimo_login_desde,
            ultimo_login_hasta,
        } = filters;

        const whereClause: any = {
            usuarios: {
                // Solo clientes (no admins)
                admin: null,
            },
        };

        // Filtro por estado
        if (estado !== undefined) {
            whereClause.usuarios.estado = estado;
        }

        // Búsqueda por nombre, email, teléfono
        if (busqueda) {
            whereClause.usuarios.OR = [
                { nombre: { contains: busqueda, mode: 'insensitive' } },
                { apellido: { contains: busqueda, mode: 'insensitive' } },
                { email: { contains: busqueda, mode: 'insensitive' } },
                { telefono: { contains: busqueda, mode: 'insensitive' } },
                { username: { contains: busqueda, mode: 'insensitive' } },
            ];
        }

        // Filtro por ciudad
        if (ciudad) {
            whereClause.ciudad = { contains: ciudad, mode: 'insensitive' };
        }

        // Filtro por provincia
        if (provincia) {
            whereClause.provincia = { contains: provincia, mode: 'insensitive' };
        }

        // Filtros por fecha de creación
        if (creado_desde || creado_hasta) {
            whereClause.usuarios.creado_en = {};
            if (creado_desde) {
                whereClause.usuarios.creado_en.gte = new Date(creado_desde);
            }
            if (creado_hasta) {
                whereClause.usuarios.creado_en.lte = new Date(creado_hasta);
            }
        }

        // Filtros por último login
        if (ultimo_login_desde || ultimo_login_hasta) {
            whereClause.usuarios.ultimo_login = {};
            if (ultimo_login_desde) {
                whereClause.usuarios.ultimo_login.gte = new Date(ultimo_login_desde);
            }
            if (ultimo_login_hasta) {
                whereClause.usuarios.ultimo_login.lte = new Date(ultimo_login_hasta);
            }
        }

        // Ordenamiento
        const orderByClause: any = {};
        if (order_by === 'nombre') {
            orderByClause.usuarios = { nombre: order };
        } else if (order_by === 'email') {
            orderByClause.usuarios = { email: order };
        } else if (order_by === 'creado_en') {
            orderByClause.usuarios = { creado_en: order };
        } else if (order_by === 'ultimo_login') {
            orderByClause.usuarios = { ultimo_login: order };
        } else {
            orderByClause.usuarios = { creado_en: 'desc' };
        }

        // Contar total
        const total = await prisma.cliente.count({
            where: whereClause,
        });

        // Obtener clientes
        const clientes = await prisma.cliente.findMany({
            where: whereClause,
            include: {
                usuarios: true,
            },
            orderBy: orderByClause,
            skip: (page - 1) * limit,
            take: limit,
        });

        // Formatear respuesta
        const formattedClientes: ICliente[] = clientes.map((cliente) => ({
            id_cliente: cliente.id_cliente,
            id_usuario: cliente.id_usuario,
            direccion: cliente.direccion,
            cod_postal: cliente.cod_postal,
            ciudad: cliente.ciudad,
            provincia: cliente.provincia,
            usuario: cliente.usuarios ? {
                id_usuario: cliente.usuarios.id_usuario,
                nombre: cliente.usuarios.nombre,
                apellido: cliente.usuarios.apellido,
                email: cliente.usuarios.email,
                telefono: cliente.usuarios.telefono,
                username: cliente.usuarios.username,
                id_rol: cliente.usuarios.id_rol,
                estado: cliente.usuarios.estado as any,
                creado_en: cliente.usuarios.creado_en,
                actualizado_en: cliente.usuarios.actualizado_en,
                ultimo_login: cliente.usuarios.ultimo_login,
                login_ip: cliente.usuarios.login_ip,
                img: cliente.usuarios.img,
                nacimiento: cliente.usuarios.nacimiento,
            } : undefined,
        }));

        const totalPages = Math.ceil(total / limit);

        const response: IPaginatedResponse<ICliente> = {
            data: formattedClientes,
            total,
            page,
            limit,
            totalPages,
        };

        // Guardar en cache
        await cacheService.set(cacheKey, response, this.TTL_LISTA);

        return response;
    }

    async getById(id: string): Promise<ICliente> {
        const cacheKey = `cliente:${id}`;
        
        const cached = await cacheService.get<ICliente>(cacheKey);
        if (cached) {
            console.log(`✅ Cliente ${id} encontrado en cache`);
            return cached;
        }

        console.log(`❌ Cliente ${id} no encontrado en cache`);

        const cliente = await prisma.cliente.findUnique({
            where: { id_usuario: id },
            include: {
                usuarios: true,
                venta_cliente: {
                    include: {
                        venta_detalle: {
                            include: {
                                productos: true,
                            },
                        },
                    },
                    orderBy: {
                        fecha: 'desc',
                    },
                    take: 10, // Últimas 10 ventas
                },
            },
        });

        if (!cliente) {
            throw new Error('Cliente no encontrado');
        }

        const formattedCliente: ICliente = {
            id_cliente: cliente.id_cliente,
            id_usuario: cliente.id_usuario,
            direccion: cliente.direccion,
            cod_postal: cliente.cod_postal,
            ciudad: cliente.ciudad,
            provincia: cliente.provincia,
            usuario: cliente.usuarios ? {
                id_usuario: cliente.usuarios.id_usuario,
                nombre: cliente.usuarios.nombre,
                apellido: cliente.usuarios.apellido,
                email: cliente.usuarios.email,
                telefono: cliente.usuarios.telefono,
                username: cliente.usuarios.username,
                id_rol: cliente.usuarios.id_rol,
                estado: cliente.usuarios.estado as any,
                creado_en: cliente.usuarios.creado_en,
                actualizado_en: cliente.usuarios.actualizado_en,
                ultimo_login: cliente.usuarios.ultimo_login,
                login_ip: cliente.usuarios.login_ip,
                img: cliente.usuarios.img,
                nacimiento: cliente.usuarios.nacimiento,
            } : undefined,
            ventas: cliente.venta_cliente.map((venta) => ({
                id_venta: venta.id_venta,
                fecha: venta.fecha,
                total_neto: Number(venta.total_neto),
                estado_pago: venta.estado_pago as any,
                estado_envio: venta.estado_envio as any,
                metodo_pago: venta.metodo_pago as any,
            })) as any,
        };

        // Guardar en cache
        await cacheService.set(cacheKey, formattedCliente, this.TTL_CLIENTE);

        return formattedCliente;
    }

    async getStats(id: string): Promise<IClienteStats> {
        const cacheKey = `cliente:stats:${id}`;
        
        const cached = await cacheService.get<IClienteStats>(cacheKey);
        if (cached) {
            console.log(`✅ Estadísticas del cliente ${id} encontradas en cache`);
            return cached;
        }

        const ventas = await prisma.venta.findMany({
            where: { id_cliente: id },
            include: {
                venta_detalle: true,
            },
        });

        const totalVentas = ventas.length;
        const totalGastado = ventas.reduce((sum, v) => sum + Number(v.total_neto || 0), 0);
        const promedioVenta = totalVentas > 0 ? totalGastado / totalVentas : 0;
        const ultimaVenta = ventas.length > 0 ? ventas[0].fecha : null;

        // Contar productos únicos comprados
        const productosIds = new Set<number>();
        ventas.forEach((venta) => {
            venta.venta_detalle.forEach((detalle) => {
                if (detalle.id_prod) {
                    productosIds.add(detalle.id_prod);
                }
            });
        });

        const stats: IClienteStats = {
            totalVentas,
            totalGastado,
            promedioVenta,
            ultimaVenta: ultimaVenta || undefined,
            productosComprados: productosIds.size,
        };

        // Guardar en cache (TTL más corto para stats)
        await cacheService.set(cacheKey, stats, 600); // 10 minutos

        return stats;
    }

    async getVentas(id: string, filters: IClienteFilters = {}): Promise<IPaginatedResponse<any>> {
        const { page = 1, limit = 10 } = filters;

        const whereClause: any = {
            id_cliente: id,
        };

        const total = await prisma.venta.count({
            where: whereClause,
        });

        const ventas = await prisma.venta.findMany({
            where: whereClause,
            orderBy: {
                fecha: 'desc',
            },
            skip: (page - 1) * limit,
            take: limit,
        });

        const formattedVentas = ventas.map((venta) => ({
            id_venta: venta.id_venta,
            fecha: venta.fecha,
            total_neto: Number(venta.total_neto),
            estado_pago: venta.estado_pago,
            estado_envio: venta.estado_envio,
            metodo_pago: venta.metodo_pago,
        }));

        const totalPages = Math.ceil(total / limit);

        return {
            data: formattedVentas,
            total,
            page,
            limit,
            totalPages,
        };
    }
}

export const clientesService = new ClientesService();

