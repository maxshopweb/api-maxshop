/**
 * Handler de prueba para SALE_CREATED
 * 
 * Este handler es solo para validar que el Event Bus funciona correctamente.
 * Se puede deshabilitar o eliminar una vez que se agreguen handlers reales.
 */

import { IEventHandler, EventContext } from '../handler.interface';
import { SaleCreatedPayload } from '../../../domain/events/sale.events';

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
            console.log(`📊 [TestHandler] Venta completa disponible:`, {
                total_neto: payload.venta.total_neto,
                metodo_pago: payload.venta.metodo_pago,
                detalles_count: payload.venta.detalles?.length || 0,
            });
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
