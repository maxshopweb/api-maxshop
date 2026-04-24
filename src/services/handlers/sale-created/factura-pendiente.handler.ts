/**
 * Handler de Factura Pendiente para SALE_CREATED
 * 
 * Responsabilidades:
 * - Verificar que el ExcelHandler fue exitoso
 * - Crear registro en ventas_pendientes_factura para trackear ventas pendientes de factura
 * - Guardar resultado en contexto
 */

import { IEventHandler, EventContext } from '../handler.interface';
import { SaleCreatedPayload } from '../../../domain/events/sale.events';
import { prisma } from '../../../index';

export class FacturaPendienteHandler implements IEventHandler<SaleCreatedPayload, EventContext> {
    name = 'factura-pendiente-handler';
    eventType = 'SALE_CREATED';
    description = 'Marca venta como pendiente de factura después de generar Excel';
    priority = 40; // Ejecutar después de ExcelHandler (30)
    enabled = true;
    runOnPending = true;

    async handle(payload: SaleCreatedPayload, context: EventContext): Promise<void> {
        const { id_venta } = payload;

        try {
            console.log(`📋 [FacturaPendienteHandler] Procesando venta #${id_venta}...`);

            // 1. Verificar que excel-handler fue exitoso
            const excelHandlerResult = context.handlerData['excel-handler'];
            if (!excelHandlerResult || !excelHandlerResult.success) {
                console.warn(`⚠️ [FacturaPendienteHandler] ExcelHandler no fue exitoso para venta #${id_venta}. Saltando.`);
                // No lanzar error, solo registrar en contexto
                context.handlerData[this.name] = {
                    success: false,
                    reason: 'excel-handler-no-exitoso',
                    processedAt: new Date().toISOString(),
                };
                return;
            }

            // 2. Verificar si ya existe un registro para esta venta
            const existing = await prisma.ventas_pendientes_factura.findUnique({
                where: { venta_id: id_venta },
            });

            if (existing) {
                console.log(`ℹ️ [FacturaPendienteHandler] Venta #${id_venta} ya está registrada como pendiente. Saltando.`);
                context.handlerData[this.name] = {
                    success: true,
                    alreadyExists: true,
                    processedAt: new Date().toISOString(),
                };
                return;
            }

            // 3. Crear registro en ventas_pendientes_factura
            const registro = await prisma.ventas_pendientes_factura.create({
                data: {
                    venta_id: id_venta,
                    estado: 'pendiente',
                    intentos: 0,
                    factura_encontrada: false,
                },
            });

            // 4. Guardar resultado en contexto
            context.handlerData[this.name] = {
                success: true,
                registroId: registro.id.toString(),
                ventaId: id_venta,
                processedAt: new Date().toISOString(),
            };

            console.log(`✅ [FacturaPendienteHandler] Venta #${id_venta} marcada como pendiente de factura (ID registro: ${registro.id})`);

        } catch (error: any) {
            // Guardar error en el contexto (para otros handlers o logging)
            context.handlerData[this.name] = {
                success: false,
                error: error.message || String(error),
                errorStack: error.stack,
                processedAt: new Date().toISOString(),
            };

            console.error(`❌ [FacturaPendienteHandler] Error al procesar venta #${id_venta}:`, error.message);
            
            // En desarrollo, mostrar stack completo
            if (process.env.NODE_ENV !== 'production') {
                console.error(`❌ [FacturaPendienteHandler] Stack trace:`, error.stack);
            }

            // NO lanzar el error - permitir que otros handlers se ejecuten
            // El error ya está registrado en el contexto y se guardará en event_logs
        }
    }
}
