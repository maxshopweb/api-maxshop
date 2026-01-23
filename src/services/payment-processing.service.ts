import { IVenta } from '../types';
import { ProductosService } from './productos.service';
import { andreaniPreEnvioService } from './andreani/andreani.preenvio.service';
import mailService from '../mail';
import { prisma } from '../index';
import cacheService from './cache.service';
import { eventBus } from '../infrastructure/event-bus/event-bus';
import { SaleEventType, SaleEventFactory } from '../domain/events/sale.events';

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

            // 1. Obtener venta completa
            const ventasService = this.getVentasService();
            const venta = await ventasService.getById(idVenta);

            if (!venta) {
                throw new Error(`Venta ${idVenta} no encontrada`);
            }

            // 2. Validar que esté pendiente
            if (venta.estado_pago === 'aprobado') {
                return venta;
            }

            if (venta.estado_pago === 'cancelado') {
                throw new Error(`No se puede confirmar una venta cancelada (Venta #${idVenta})`);
            }

            // 3. Validar stock antes de descontar
            await this.validateStock(venta);

            // 4. Descontar stock de productos
            await this.decreaseStock(venta);

            // 5. Actualizar estado de pago a 'aprobado' directamente con Prisma
            // NO usar ventasService.update() para evitar bucle infinito
            await prisma.venta.update({
                where: { id_venta: idVenta },
                data: {
                    estado_pago: 'aprobado',
                    observaciones: paymentData?.notas 
                        ? `${venta.observaciones || ''}\n[Pago confirmado] ${paymentData.notas}`.trim()
                        : venta.observaciones || null,
                    actualizado_en: new Date(),
                },
            });

            // Invalidar cache
            await cacheService.delete(`venta:${idVenta}`);
            await cacheService.deletePattern('ventas:*');

            // Obtener venta actualizada
            let ventaActualizada = await ventasService.getById(idVenta);


            // Emitir evento SALE_CREATED SOLO cuando el pago está aprobado
            // Los handlers del Event Bus se ejecutarán automáticamente
            if (ventaActualizada.estado_pago === 'aprobado' && ventaActualizada.fecha) {
                const event = SaleEventFactory.createSaleCreated({
                    id_venta: ventaActualizada.id_venta,
                    estado_pago: 'aprobado',
                    fecha: ventaActualizada.fecha.toISOString(),
                    venta: ventaActualizada, // Incluir datos completos de la venta
                    paymentData: paymentData ? {
                        metodoPago: paymentData.metodoPago,
                        transactionId: paymentData.transactionId,
                        paymentDate: paymentData.paymentDate?.toISOString(),
                        notas: paymentData.notas,
                    } : undefined,
                });
                await eventBus.emit(SaleEventType.SALE_CREATED, event.payload).catch((error) => {
                    console.error('❌ [PaymentProcessing] Error al emitir evento SALE_CREATED:', error);
                });
            }

            // NOTA: La creación del pre-envío en Andreani ahora se hace a través del Event Bus
            // El handler AndreaniHandler se ejecutará automáticamente cuando se emita SALE_CREATED
            // Mantenemos este código comentado por si se necesita crear el envío de forma síncrona
            // (por ahora, el Event Bus lo maneja de forma asíncrona)
            
            // 6. Crear pre-envío en Andreani (ahora manejado por Event Bus)
            // El AndreaniHandler se ejecutará automáticamente desde el Event Bus
            // Si necesitas crear el envío de forma síncrona, descomenta el código siguiente:
            /*
            const esRetiro = ventaActualizada.observaciones?.toLowerCase().includes('retiro en tienda') || 
                            ventaActualizada.observaciones?.toLowerCase().includes('tipo: retiro');
            
            if (!esRetiro) {
                try {
                    await andreaniPreEnvioService.crearPreEnvio(idVenta);
                    ventaActualizada = await ventasService.getById(idVenta);
                } catch (error: any) {
                    console.error(`❌ [PaymentProcessing] Error al crear pre-envío para venta #${idVenta}:`, error);
                }
            }
            */

            // 7. Enviar email de confirmación con tracking (no bloqueante)
            // El número de seguimiento se obtiene de ventaActualizada.envio?.cod_seguimiento
            this.sendConfirmationEmail(ventaActualizada).catch((error) => {
                console.error(`❌ [PaymentProcessing] Error al enviar email de confirmación:`, error);
            });


            return ventaActualizada;
        } catch (error: any) {
            console.error(`❌ [PaymentProcessing] Error al confirmar pago para venta #${idVenta}:`, error);
            throw error;
        }
    }

    /**
     * Valida que haya stock suficiente para todos los productos
     */
    private async validateStock(venta: IVenta): Promise<void> {
        if (!venta.detalles || venta.detalles.length === 0) {
            throw new Error('La venta no tiene detalles');
        }

        for (const detalle of venta.detalles) {
            if (!detalle.producto) {
                throw new Error(`Producto no encontrado en detalle ${detalle.id_detalle}`);
            }
            const stockActual = detalle.producto.stock ? Number(detalle.producto.stock) : 0;
            const cantidadRequerida = detalle.cantidad || 0;

            if (stockActual < cantidadRequerida) {
                throw new Error(
                    `Stock insuficiente para producto "${detalle.producto.nombre}". ` +
                    `Stock disponible: ${stockActual}, Cantidad requerida: ${cantidadRequerida}`
                );
            }
        }
    }

    /**
     * Descuenta el stock de todos los productos de la venta
     */
    private async decreaseStock(venta: IVenta): Promise<void> {
        if (!venta.detalles || venta.detalles.length === 0) {
            return;
        }

        for (const detalle of venta.detalles) {
            if (!detalle.producto || !detalle.id_prod) {
                continue;
            }

            const cantidad = detalle.cantidad || 0;
            if (cantidad <= 0) {
                continue;
            }

            try {
                // updateStock recibe cantidad positiva para sumar, negativa para restar
                await this.productosService.updateStock(detalle.id_prod, -cantidad);
            } catch (error: any) {
                console.error(`❌ [PaymentProcessing] Error al descontar stock del producto #${detalle.id_prod}:`, error);
                throw new Error(`Error al descontar stock: ${error.message}`);
            }
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

