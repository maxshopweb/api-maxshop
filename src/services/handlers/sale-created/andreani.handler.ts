/**
 * Handler de Andreani para SALE_CREATED
 * 
 * Responsabilidades:
 * - Crear pre-envío en Andreani cuando se confirma una venta
 * - Guardar respuesta completa de Andreani en el contexto
 * - Registrar código de envío generado
 * - Manejar errores sin interrumpir otros handlers
 */

import { IEventHandler, EventContext } from '../handler.interface';
import { SaleCreatedPayload } from '../../../domain/events/sale.events';
import { andreaniPreEnvioService } from '../../andreani/andreani.preenvio.service';
import { IOrdenEnvioResponse } from '../../andreani/andreani.types';
import { getAndreaniModoManual } from '../../../config/andreani.config';

export class AndreaniHandler implements IEventHandler<SaleCreatedPayload, EventContext> {
    name = 'andreani-handler';
    eventType = 'SALE_CREATED';
    description = 'Crea pre-envío en Andreani cuando se confirma una venta';
    priority = 20; // Ejecutar después del test handler
    enabled = true;

    async handle(payload: SaleCreatedPayload, context: EventContext): Promise<void> {
        const { id_venta, venta } = payload;

        if (getAndreaniModoManual()) {
            context.handlerData[this.name] = {
                skipped: true,
                reason: 'andreani_modo_manual',
                processedAt: new Date().toISOString(),
            };
            return;
        }

        if (!venta) {
            console.warn(`⚠️ [AndreaniHandler] Venta #${id_venta} sin datos completos - saltando`);
            return;
        }

        // Verificar si es retiro en tienda (no crear envío)
        const esRetiro = venta.observaciones?.toLowerCase().includes('retiro en tienda') || 
                        venta.observaciones?.toLowerCase().includes('tipo: retiro');
        
        if (esRetiro) {
            console.log(`ℹ️ [AndreaniHandler] Venta #${id_venta} es retiro en tienda - no se crea envío`);
            context.handlerData[this.name] = {
                skipped: true,
                reason: 'retiro_en_tienda',
                processedAt: new Date().toISOString(),
            };
            return;
        }

        try {
            console.log(`📦 [AndreaniHandler] Creando pre-envío en Andreani para venta #${id_venta}...`);

            // Crear pre-envío usando el servicio existente
            const respuestaAndreani: IOrdenEnvioResponse = await andreaniPreEnvioService.crearPreEnvio(id_venta);

            // Extraer información importante
            const numeroEnvio = respuestaAndreani.bultos?.[0]?.numeroDeEnvio || null;
            const agrupadorDeBultos = respuestaAndreani.agrupadorDeBultos || null;
            const estado = respuestaAndreani.estado || null;

            // Guardar respuesta completa en el contexto (para otros handlers)
            context.handlerData[this.name] = {
                success: true,
                processedAt: new Date().toISOString(),
                numeroEnvio,
                agrupadorDeBultos,
                estado,
                respuestaCompleta: respuestaAndreani, // Respuesta completa en JSON
            };

            // Log detallado de la respuesta
            console.log(`✅ [AndreaniHandler] Pre-envío creado exitosamente para venta #${id_venta}`);
            console.log(`📋 [AndreaniHandler] Código de envío: ${numeroEnvio || 'N/A'}`);
            console.log(`📋 [AndreaniHandler] Agrupador: ${agrupadorDeBultos || 'N/A'}`);
            console.log(`📋 [AndreaniHandler] Estado: ${estado || 'N/A'}`);
            
            // Mostrar respuesta completa en formato JSON (solo en desarrollo)
            if (process.env.NODE_ENV !== 'production') {
                console.log(`📦 [AndreaniHandler] Respuesta completa de Andreani:`, JSON.stringify(respuestaAndreani, null, 2));
            } else {
                // En producción, solo mostrar resumen
                console.log(`📦 [AndreaniHandler] Respuesta Andreani:`, {
                    numeroEnvio,
                    agrupadorDeBultos,
                    estado,
                    bultosCount: respuestaAndreani.bultos?.length || 0,
                });
            }

        } catch (error: any) {
            // Guardar error en el contexto (para otros handlers o logging)
            context.handlerData[this.name] = {
                success: false,
                error: error.message || String(error),
                errorStack: error.stack,
                processedAt: new Date().toISOString(),
            };

            console.error(`❌ [AndreaniHandler] Error al crear pre-envío para venta #${id_venta}:`, error.message);
            
            // En desarrollo, mostrar stack completo
            if (process.env.NODE_ENV !== 'production') {
                console.error(`❌ [AndreaniHandler] Stack trace:`, error.stack);
            }

            // NO lanzar el error - permitir que otros handlers se ejecuten
            // El error ya está registrado en el contexto y se guardará en event_logs
        }
    }
}
