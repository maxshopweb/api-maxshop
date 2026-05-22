/**
 * Handler de prueba para SALE_CREATED
 * 
 * Este handler es solo para validar que el Event Bus funciona correctamente.
 * Se puede deshabilitar o eliminar una vez que se agreguen handlers reales.
 */

import { IEventHandler, EventContext } from '../handler.interface';
import { SaleCreatedPayload } from '../../../domain/events/sale.events';
import { amountsMatch, roundMoney } from '../../../utils/money.utils';

export class TestHandler implements IEventHandler<SaleCreatedPayload, EventContext> {
    name = 'test-handler';
    eventType = 'SALE_CREATED';
    description = 'Handler de prueba - valida que el Event Bus funciona';
    priority = 1; // Ejecutar primero
    enabled = true;

    async handle(payload: SaleCreatedPayload, context: EventContext): Promise<void> {
        console.log('🚀 [TestHandler] Event Bus en ejecución');
        console.log(`📦 [TestHandler] Procesando venta #${payload.id_venta}`);
        console.log(`💰 [TestHandler] Estado: ${payload.estado_pago}`);
        console.log(`📅 [TestHandler] Fecha: ${payload.fecha}`);
        
        // Mostrar datos de venta si están disponibles
        if (payload.venta) {
            const venta = payload.venta;
            const totalNeto = venta.total_neto != null ? Number(venta.total_neto) : null;
            const sumDetalles = roundMoney(
                (venta.detalles || []).reduce((sum, d) => sum + Number(d.sub_total ?? 0), 0)
            );
            const costoEnvio = venta.envio?.costo_envio != null ? Number(venta.envio.costo_envio) : 0;
            const expectedNeto = roundMoney(sumDetalles + costoEnvio);

            console.log(`📊 [TestHandler] Venta completa disponible:`, {
                total_neto: venta.total_neto,
                metodo_pago: venta.metodo_pago,
                detalles_count: venta.detalles?.length || 0,
                sum_detalles: sumDetalles,
                costo_envio: costoEnvio,
            });

            if (totalNeto != null && !amountsMatch(totalNeto, expectedNeto)) {
                console.warn(
                    `⚠️ [TestHandler] Integridad de montos: total_neto ($${totalNeto}) ≠ suma líneas + envío ($${expectedNeto}) en venta #${payload.id_venta}`
                );
            }
        }
        
        // Agregar datos al contexto (ejemplo de cómo otros handlers pueden usarlo)
        context.handlerData[this.name] = {
            processedAt: new Date().toISOString(),
            message: 'Event Bus funcionando correctamente',
            ventaId: payload.id_venta,
        };

        // Simular procesamiento mínimo
        await new Promise(resolve => setTimeout(resolve, 50));
        
        console.log('✅ [TestHandler] Handler ejecutado exitosamente');
    }
}
