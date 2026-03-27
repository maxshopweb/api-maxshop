import { prisma } from '../index';
import { ICliente, IClienteFilters, IPaginatedResponse, IClienteStats, IUpdateClienteDTO } from '../types';
import cacheService from './cache.service';

export class ClientesService {
    private TTL_CLIENTE = 3600; // 1 hora
    private TTL_LISTA = 60; // 1 minuto (listado se invalida al actualizar; TTL corto por si falla el deletePattern)

    async getAll(filters: IClienteFilters): Promise<IPaginatedResponse<ICliente>> {
        const cacheKey = `clientes:all:${JSON.stringify(filters)}`;
        
        const cached = await cacheService.get<IPaginatedResponse<ICliente>>(cacheKey);
        if (cached) {
            return cached;
        }


        const {
            page: pageRaw = 1,
            limit = 25,
            order_by = 'creado_en',
            order = 'desc',
            activo: activoFilter,
            busqueda,
            ciudad,
            provincia,
            creado_desde,
            creado_hasta,
            ultimo_login_desde,
            ultimo_login_hasta,
        } = filters;

        const whereClause: any = {};

        // Condiciones sobre la relación usuarios (admin + activo + búsqueda sin pisarse)
        const usuariosAnd: any[] = [
            { admin: null }, // solo clientes (no admins)
        ];
        if (activoFilter === true) {
            usuariosAnd.push({ OR: [{ activo: true }, { activo: null }] });
        } else if (activoFilter === false) {
            usuariosAnd.push({ activo: false });
        }

        // Búsqueda por nombre, email, teléfono y documento (DNI)
        if (busqueda) {
            const busquedaNormalizada = busqueda.trim();
            const busquedaSoloDigitos = busquedaNormalizada.replace(/\D/g, '');
            const esDniProbable =
                /^\d+$/.test(busquedaSoloDigitos) &&
                busquedaSoloDigitos.length >= 7 &&
                busquedaSoloDigitos.length <= 8;

            const orConditions: any[] = [
                { nombre: { contains: busquedaNormalizada, mode: 'insensitive' } },
                { apellido: { contains: busquedaNormalizada, mode: 'insensitive' } },
                { email: { contains: busquedaNormalizada, mode: 'insensitive' } },
                { telefono: { contains: busquedaNormalizada, mode: 'insensitive' } },
                { username: { contains: busquedaNormalizada, mode: 'insensitive' } },
                { numero_documento: { contains: busquedaNormalizada, mode: 'insensitive' } },
            ];

            if (esDniProbable && busquedaSoloDigitos !== busquedaNormalizada) {
                orConditions.push({
                    numero_documento: { contains: busquedaSoloDigitos, mode: 'insensitive' },
                });
            }

            usuariosAnd.push({ OR: orConditions });
        }

        whereClause.usuarios =
            usuariosAnd.length === 1 ? usuariosAnd[0] : { AND: usuariosAnd };

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
        } else if (order_by === 'numero_cliente') {
            orderByClause.numero_cliente = order;
        } else {
            orderByClause.usuarios = { creado_en: 'desc' };
        }

        // Contar total
        const total = await prisma.cliente.count({
            where: whereClause,
        });

        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
        let page =
            Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
        if (total > 0 && totalPages > 0) {
            page = Math.min(page, totalPages);
            page = Math.max(1, page);
        }

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
        const formattedClientes: ICliente[] = clientes.map((cliente: any) => ({
            id_cliente: cliente.id_cliente,
            id_usuario: cliente.id_usuario,
            numero_cliente: cliente.numero_cliente != null ? Number(cliente.numero_cliente) : null,
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
                activo: cliente.usuarios.activo,
                creado_en: cliente.usuarios.creado_en,
                actualizado_en: cliente.usuarios.actualizado_en,
                ultimo_login: cliente.usuarios.ultimo_login,
                login_ip: cliente.usuarios.login_ip,
                img: cliente.usuarios.img,
                nacimiento: cliente.usuarios.nacimiento,
                numero_documento: cliente.usuarios.numero_documento,
                tipo_documento: cliente.usuarios.tipo_documento,
            } : undefined,
            altura: (cliente as any).altura,
            piso: (cliente as any).piso,
            dpto: (cliente as any).dpto,
        }));

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

    /**
     * Obtiene todos los clientes sin paginación (para exportación Excel).
     * Orden por numero_cliente ascendente.
     */
    async getAllForExport(): Promise<ICliente[]> {
        const clientes = await prisma.cliente.findMany({
            where: {
                usuarios: {
                    admin: null,
                },
            },
            include: {
                usuarios: true,
            },
            orderBy: { numero_cliente: 'asc' },
        });

        return clientes.map((cliente: any) => ({
            id_cliente: cliente.id_cliente,
            id_usuario: cliente.id_usuario,
            numero_cliente: cliente.numero_cliente != null ? Number(cliente.numero_cliente) : null,
            direccion: cliente.direccion,
            cod_postal: cliente.cod_postal,
            ciudad: cliente.ciudad,
            provincia: cliente.provincia,
            altura: cliente.altura,
            piso: cliente.piso,
            dpto: cliente.dpto,
            usuario: cliente.usuarios
                ? {
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
                      numero_documento: cliente.usuarios.numero_documento,
                      tipo_documento: cliente.usuarios.tipo_documento,
                      activo: cliente.usuarios.activo,
                  }
                : undefined,
        }));
    }

    async getById(id: string): Promise<ICliente> {
        const cacheKey = `cliente:${id}`;
        
        const cached = await cacheService.get<ICliente>(cacheKey);
        if (cached) {
            return cached;
        }


        const cliente = await prisma.cliente.findUnique({
            where: { id_usuario: id },
            include: {
                usuarios: true,
                venta: {
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
            numero_cliente: cliente.numero_cliente != null ? Number(cliente.numero_cliente) : null,
            direccion: cliente.direccion,
            cod_postal: cliente.cod_postal,
            ciudad: cliente.ciudad,
            provincia: cliente.provincia,
            altura: (cliente as any).altura,
            piso: (cliente as any).piso,
            dpto: (cliente as any).dpto,
            usuario: cliente.usuarios ? {
                id_usuario: cliente.usuarios.id_usuario,
                nombre: cliente.usuarios.nombre,
                apellido: cliente.usuarios.apellido,
                email: cliente.usuarios.email,
                telefono: cliente.usuarios.telefono,
                username: cliente.usuarios.username,
                id_rol: cliente.usuarios.id_rol,
                estado: cliente.usuarios.estado as any,
                activo: cliente.usuarios.activo,
                creado_en: cliente.usuarios.creado_en,
                actualizado_en: cliente.usuarios.actualizado_en,
                ultimo_login: cliente.usuarios.ultimo_login,
                login_ip: cliente.usuarios.login_ip,
                img: cliente.usuarios.img,
                nacimiento: cliente.usuarios.nacimiento,
                numero_documento: cliente.usuarios.numero_documento,
                tipo_documento: cliente.usuarios.tipo_documento,
            } : undefined,
            ventas: cliente.venta.map((venta: any) => ({
                id_venta: venta.id_venta,
                cod_interno: venta.cod_interno ?? null,
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
            return cached;
        }

        const ventas = await prisma.venta.findMany({
            where: { id_cliente: id },
            include: {
                venta_detalle: true,
            },
        });

        const totalVentas = ventas.length;
        const totalGastado = ventas.reduce((sum: number, v: any) => sum + Number(v.total_neto || 0), 0);
        const promedioVenta = totalVentas > 0 ? totalGastado / totalVentas : 0;
        const ultimaVenta = ventas.length > 0 ? ventas[0].fecha : null;

        // Contar productos únicos comprados
        const productosIds = new Set<number>();
        ventas.forEach((venta: any) => {
            venta.venta_detalle.forEach((detalle: any) => {
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

        const formattedVentas = ventas.map((venta: any) => ({
            id_venta: venta.id_venta,
            cod_interno: venta.cod_interno ?? null,
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

    async update(id: string, data: IUpdateClienteDTO): Promise<ICliente> {
        const cliente = await prisma.cliente.findUnique({
            where: { id_usuario: id },
            include: { usuarios: true },
        });
        if (!cliente) {
            throw new Error('Cliente no encontrado');
        }

        const usuarioData: Record<string, unknown> = {};
        if (data.telefono !== undefined) usuarioData.telefono = data.telefono;
        if (data.numero_documento !== undefined) {
            const trimmed =
                data.numero_documento === null ||
                String(data.numero_documento).trim() === ''
                    ? null
                    : String(data.numero_documento).trim();
            if (trimmed) {
                const duplicado = await prisma.usuarios.findFirst({
                    where: {
                        id_usuario: { not: id },
                        numero_documento: {
                            equals: trimmed,
                            mode: 'insensitive',
                        },
                    },
                    select: { id_usuario: true },
                });
                if (duplicado) {
                    throw new Error(
                        'Ya existe otro usuario con ese número de documento.'
                    );
                }
            }
            usuarioData.numero_documento = trimmed;
        }
        if (data.tipo_documento !== undefined) usuarioData.tipo_documento = data.tipo_documento;
        if (data.activo !== undefined) usuarioData.activo = data.activo;

        if (Object.keys(usuarioData).length > 0) {
            usuarioData.actualizado_en = new Date();
            await prisma.usuarios.update({
                where: { id_usuario: id },
                data: usuarioData as any,
            });
        }

        const clienteData: Record<string, unknown> = {};
        if (data.direccion !== undefined) clienteData.direccion = data.direccion;
        if (data.altura !== undefined) clienteData.altura = data.altura;
        if (data.piso !== undefined) clienteData.piso = data.piso;
        if (data.dpto !== undefined) clienteData.dpto = data.dpto;
        if (data.ciudad !== undefined) clienteData.ciudad = data.ciudad;
        if (data.provincia !== undefined) clienteData.provincia = data.provincia;
        if (data.cod_postal !== undefined) clienteData.cod_postal = data.cod_postal;

        if (Object.keys(clienteData).length > 0) {
            await prisma.cliente.update({
                where: { id_usuario: id },
                data: clienteData as any,
            });
        }

        await cacheService.delete(`cliente:${id}`);
        await cacheService.deletePattern('clientes:*');
        // Respuestas GET cacheadas por cacheMiddleware (clave endpoint:...) — sin esto el refetch tras PUT devuelve JSON viejo
        await cacheService.deletePattern('endpoint:/clientes*');

        // Lectura fresca desde DB (sin cache) para devolver siempre datos actualizados (incl. activo)
        const fresh = await prisma.cliente.findUnique({
            where: { id_usuario: id },
            include: {
                usuarios: true,
                venta: {
                    orderBy: { fecha: 'desc' },
                    take: 10,
                    include: { venta_detalle: { include: { productos: true } } },
                },
            },
        });
        if (!fresh) throw new Error('Cliente no encontrado');
        const formatted: ICliente = {
            id_cliente: fresh.id_cliente,
            id_usuario: fresh.id_usuario,
            numero_cliente: fresh.numero_cliente != null ? Number(fresh.numero_cliente) : null,
            direccion: fresh.direccion,
            cod_postal: fresh.cod_postal,
            ciudad: fresh.ciudad,
            provincia: fresh.provincia,
            altura: (fresh as any).altura,
            piso: (fresh as any).piso,
            dpto: (fresh as any).dpto,
            usuario: fresh.usuarios ? {
                id_usuario: fresh.usuarios.id_usuario,
                nombre: fresh.usuarios.nombre,
                apellido: fresh.usuarios.apellido,
                email: fresh.usuarios.email,
                telefono: fresh.usuarios.telefono,
                username: fresh.usuarios.username,
                id_rol: fresh.usuarios.id_rol,
                estado: fresh.usuarios.estado as any,
                activo: fresh.usuarios.activo,
                creado_en: fresh.usuarios.creado_en,
                actualizado_en: fresh.usuarios.actualizado_en,
                ultimo_login: fresh.usuarios.ultimo_login,
                login_ip: fresh.usuarios.login_ip,
                img: fresh.usuarios.img,
                nacimiento: fresh.usuarios.nacimiento,
                numero_documento: fresh.usuarios.numero_documento,
                tipo_documento: fresh.usuarios.tipo_documento,
            } : undefined,
            ventas: fresh.venta.map((v: any) => ({
                id_venta: v.id_venta,
                cod_interno: v.cod_interno ?? null,
                fecha: v.fecha,
                total_neto: Number(v.total_neto),
                estado_pago: v.estado_pago as any,
                estado_envio: v.estado_envio as any,
                metodo_pago: v.metodo_pago as any,
            })) as any,
        };
        await cacheService.set(`cliente:${id}`, formatted, this.TTL_CLIENTE);
        return formatted;
    }
}

export const clientesService = new ClientesService();

