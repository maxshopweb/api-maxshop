import { IVenta } from '../types';
import { ProductosService } from './productos.service';
import mailService from '../mail';
import { prisma } from '../index';
import { Prisma } from '@prisma/client';
import cacheService from './cache.service';
import { SaleEventType, SaleEventFactory } from '../domain/events/sale.events';
import { handlerExecutorService } from './handlers/handler-executor.service';
import { assertClienteDireccionCompletaParaEnvio, isVentaRetiroEnTienda } from './venta-envio.validation';

/**
 * Servicio centralizado para procesar confirmaciones de pago
 * 
 * Esta función se llama desde:
 * - Webhook de Mercado Pago (manejado por tu socio)
 * - Endpoint manual para aprobar pagos de efectivo/transferencia
 * 
 * IMPORTANTE: Esta función debe ser idempotente (puede llamarse múltiples veces sin efectos secundarios)
 */
export class PaymentProcessingService {
    private productosService: ProductosService;

    constructor() {
        this.productosService = new ProductosService();
    }

    /**
     * Obtiene una instancia de VentasService usando lazy loading para evitar dependencia circular
     */
    private getVentasService() {
        // Lazy import para evitar dependencia circular
        const { VentasService } = require('./ventas.service');
        return new VentasService();
    }

    /**
     * Confirma el pago de una venta
     * 
     * @param idVenta - ID de la venta a confirmar
     * @param paymentData - Datos adicionales del pago (opcional)
     * @returns Venta confirmada con todos los datos actualizados
     */
    async confirmPayment(
        idVenta: number,
        paymentData?: {
            metodoPago?: string;
            transactionId?: string;
            paymentDate?: Date;
            notas?: string;
        }
    ): Promise<IVenta> {
        try {

            // 1. Obtener venta completa (fuera de tx, solo lectura + cache)
            const ventasService = this.getVentasService();
            const venta = await ventasService.getById(idVenta);

            if (!venta) {
                throw new Error(`Venta ${idVenta} no encontrada`);
            }

            // 2. Validar estado: acepta 'pendiente' o 'vencido' (aprobar desde vencida)
            if (venta.estado_pago === 'aprobado') {
                return venta;
            }

            if (venta.estado_pago === 'cancelado') {
                throw new Error(`No se puede confirmar una venta cancelada (Venta #${idVenta})`);
            }

            if (venta.estado_pago !== 'pendiente' && venta.estado_pago !== 'vencido') {
                throw new Error(`Solo se puede confirmar una venta en estado pendiente o vencido. Estado actual: ${venta.estado_pago}`);
            }

            assertClienteDireccionCompletaParaEnvio(
                venta,
                `No se puede confirmar el pago (venta #${idVenta})`
            );

            // 3-5. Ejecutar operaciones críticas en una transacción atómica
            // Con isolationLevel: 'Serializable' para evitar race conditions
            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                // 3. Validar stock con FOR UPDATE (pessimistic lock)
                await this.validateStockWithLock(venta, tx);

                // 4. Descontar stock de productos
                await this.decreaseStockTx(venta, tx);

                // 5. Actualizar estado de pago a 'aprobado'
                await tx.venta.update({
                    where: { id_venta: idVenta },
                    data: {
                        estado_pago: 'aprobado',
                        observaciones: paymentData?.notas
                            ? `${venta.observaciones || ''}\n[Pago confirmado] ${paymentData.notas}`.trim()
                            : venta.observaciones || null,
                        actualizado_en: new Date(),
                    },
                });
            }, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                timeout: 10000,
            });

            // Invalidar cache (fuera de tx)
            await cacheService.delete(`venta:${idVenta}`);
            await cacheService.deletePattern('ventas:*');

            // Obtener venta actualizada (aún sin envío Andreani)
            let ventaActualizada = await ventasService.getById(idVenta);

            // 6. Ejecutar handlers SALE_CREATED (Andreani, etiquetas, Excel, etc.) y LUEGO emitir al bus.
            // Se usa runHandlersAndEmit para esperar a que Andreani cree el pre-envío antes de enviar
            // el email, así el cliente recibe el número de seguimiento en el mismo correo.
            if (ventaActualizada.estado_pago === 'aprobado' && ventaActualizada.fecha) {
                const event = SaleEventFactory.createSaleCreated({
                    id_venta: ventaActualizada.id_venta,
                    estado_pago: 'aprobado',
                    fecha: ventaActualizada.fecha.toISOString(),
                    venta: ventaActualizada,
                    paymentData: paymentData ? {
                        metodoPago: paymentData.metodoPago,
                        transactionId: paymentData.transactionId,
                        paymentDate: paymentData.paymentDate?.toISOString(),
                        notas: paymentData.notas,
                    } : undefined,
                });
                await handlerExecutorService.runHandlersAndEmit(SaleEventType.SALE_CREATED, event.payload).catch((error) => {
                    console.error('❌ [PaymentProcessing] Error en runHandlersAndEmit SALE_CREATED:', error);
                });

                // 7. Re-obtener la venta para incluir envio.cod_seguimiento (creado por AndreaniHandler)
                ventaActualizada = await ventasService.getById(idVenta);
            }

            // 8. Enviar email de confirmación al cliente (siempre con nro de pedido; con tracking si hay envío)
            await this.sendConfirmationEmail(ventaActualizada).catch((error) => {
                console.error(`❌ [PaymentProcessing] Error al enviar email de confirmación:`, error);
            });

            return ventaActualizada;
        } catch (error: any) {
            console.error(`❌ [PaymentProcessing] Error al confirmar pago para venta #${idVenta}:`, error);
            throw error;
        }
    }

    /**
     * Valida stock con pessimistic lock (FOR UPDATE) dentro de una transacción.
     */
    private async validateStockWithLock(venta: IVenta, tx: Prisma.TransactionClient): Promise<void> {
        if (!venta.detalles || venta.detalles.length === 0) {
            throw new Error('La venta no tiene detalles');
        }

        const cantidadPorId = new Map<number, number>();
        for (const d of venta.detalles) {
            if (d.id_prod == null) {
                throw new Error(`Producto no encontrado en detalle ${d.id_detalle ?? 'sin id'}`);
            }
            const c = Number(d.cantidad);
            if (!Number.isFinite(c) || c <= 0) continue;
            cantidadPorId.set(d.id_prod, (cantidadPorId.get(d.id_prod) ?? 0) + c);
        }

        if (cantidadPorId.size === 0) return;

        const ids = [...cantidadPorId.keys()];

        // FOR UPDATE lock pesimista: evita race conditions
        const productos = await tx.$queryRawUnsafe<Array<{ id_prod: number; stock: number; nombre: string | null }>>(
            `SELECT id_prod, stock, nombre FROM productos WHERE id_prod = ANY($1) FOR UPDATE`,
            ids
        );

        const byId = new Map(productos.map((p) => [p.id_prod, p]));
        for (const [id_prod, cantidadRequerida] of cantidadPorId) {
            const producto = byId.get(id_prod);
            if (!producto) {
                throw new Error(`Producto ${id_prod} no encontrado`);
            }
            const stockActual = producto.stock != null ? Number(producto.stock) : 0;
            if (stockActual < cantidadRequerida) {
                const nombre = producto.nombre?.trim() || `Producto #${id_prod}`;
                throw new Error(
                    `Stock insuficiente para "${nombre}". Disponible: ${stockActual}, solicitado: ${cantidadRequerida}`
                );
            }
        }
    }

    /**
     * Descuenta el stock de todos los productos de la venta dentro de la transacción.
     */
    private async decreaseStockTx(venta: IVenta, tx: Prisma.TransactionClient): Promise<void> {
        if (!venta.detalles || venta.detalles.length === 0) return;

        for (const detalle of venta.detalles) {
            if (!detalle.id_prod) continue;

            const cantidad = detalle.cantidad || 0;
            if (cantidad <= 0) continue;

            const producto = await tx.productos.findUnique({
                where: { id_prod: detalle.id_prod },
                select: { id_prod: true, stock: true },
            });

            if (!producto) continue;

            const stockActual = producto.stock ? Number(producto.stock) : 0;
            const nuevoStock = stockActual - cantidad;

            if (nuevoStock < 0) {
                throw new Error(`Stock insuficiente. Producto #${detalle.id_prod}: stock actual ${stockActual}, intentando reducir ${cantidad}`);
            }

            await tx.productos.update({
                where: { id_prod: detalle.id_prod },
                data: { stock: nuevoStock },
            });
        }
    }

    /**
     * Envía email de PAGO CONFIRMADO con información de envío
     * Este email se envía cuando el admin confirma el pago manualmente
     * o cuando Mercado Pago confirma el pago automáticamente
     */
    private async sendConfirmationEmail(venta: IVenta): Promise<void> {
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
                console.warn(`⚠️ [PaymentProcessing] No se encontró email para la venta #${venta.id_venta}`);
                return;
            }

            // Formatear productos
            const productos = venta.detalles?.map((detalle) => ({
                nombre: detalle.producto?.nombre || 'Producto sin nombre',
                cantidad: detalle.cantidad || 0,
                precioUnitario: detalle.precio_unitario || 0,
                subtotal: detalle.sub_total || 0,
            })) || [];

            // Obtener etiqueta del método de pago
            const metodoPagoLabels: Record<string, string> = {
                efectivo: 'Efectivo',
                transferencia: 'Transferencia Bancaria',
                mercadopago: 'Mercado Pago',
                tarjeta_credito: 'Tarjeta de Crédito',
                tarjeta_debito: 'Tarjeta de Débito',
                otro: 'Otro',
            };

            // Obtener número de seguimiento de Andreani desde la venta actualizada
            // El número de seguimiento se guarda en venta.envio?.cod_seguimiento después de crear el pre-envío
            const trackingCode = venta.envio?.cod_seguimiento || 
                                venta.envio?.numeroSeguimiento || 
                                venta.envio?.codigoTracking || 
                                null;

            // Preparar datos para el email
            const emailData = {
                orderId: venta.id_venta,
                total: venta.total_neto || 0,
                totalFormatted: `$${(venta.total_neto || 0).toFixed(2)}`,
                fecha: venta.fecha || new Date(),
                metodoPago: metodoPagoLabels[venta.metodo_pago || ''] || venta.metodo_pago || 'No especificado',
                estadoPago: 'confirmado',
                productos,
                cliente: {
                    email: userEmail,
                    nombre: userName,
                    apellido: userApellido,
                },
                // Agregar información de envío si existe (número de seguimiento de Andreani)
                // Convertir null a undefined para cumplir con el tipo esperado
                trackingCode: trackingCode || undefined,
                carrier: trackingCode ? 'Andreani' : undefined,
                esRetiroEnTienda: isVentaRetiroEnTienda(venta.observaciones),
            };

            // Enviar email de PAGO CONFIRMADO (no pedido confirmado)
            // Este email indica que el pago fue confirmado y el pedido está en preparación
            // Incluye el tracking code si el pre-envío fue creado exitosamente
            await mailService.sendOrderConfirmation(emailData);

            // NO enviar email de "envío despachado" aquí porque el pre-envío aún está pendiente
            // El email de envío despachado se enviará cuando el pre-envío sea aceptado por Andreani (estado "Creada")
            // Esto se manejará mediante un webhook o consulta periódica del estado del pre-envío

        } catch (error) {
            console.error(`❌ [PaymentProcessing] Error al enviar emails:`, error);
            // No lanzar error para no interrumpir el flujo
        }
    }
}

// Exportar instancia singleton
export const paymentProcessingService = new PaymentProcessingService();

