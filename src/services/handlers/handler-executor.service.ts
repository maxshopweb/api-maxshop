/**
 * Servicio ejecutor de handlers del Event Bus
 * 
 * Responsabilidades:
 * - Registrar handlers en el Event Bus
 * - Ejecutar handlers cuando se emite un evento
 * - Manejar errores de forma independiente por handler
 * - Registrar ejecución en event_logs
 * - Proporcionar contexto compartido entre handlers
 */

import { eventBus } from '../../infrastructure/event-bus/event-bus';
import { prisma } from '../../index';
import { IEventHandler, EventContext } from './handler.interface';
import { handlersRegistry } from './index';

export interface HandlerExecutionResult {
    handler: string;
    success: boolean;
    error?: string;
    duration: number;
    dataAdded?: any; // Datos agregados al contexto por este handler
}

export interface EventExecutionStats {
    handlers_executed: number;
    handlers_succeeded: number;
    handlers_failed: number;
    total_duration_ms: number;
    handler_results: HandlerExecutionResult[];
}

export class HandlerExecutorService {
    private initialized = false;

    /**
     * Inicializa todos los handlers registrados
     * Se debe llamar en el startup del servidor
     */
    initialize(): void {
        if (this.initialized) {
            console.warn('⚠️ [HandlerExecutor] Ya está inicializado');
            return;
        }

        // Para cada tipo de evento registrado
        const eventTypes = Object.keys(handlersRegistry);
        
        eventTypes.forEach(eventType => {
            const handlers = handlersRegistry[eventType];
            const enabledHandlers = handlers.filter(h => h.enabled !== false);
            
            if (enabledHandlers.length === 0) {
                return;
            }

            // SALE_CREATED no se registra aquí: se dispara desde PaymentProcessingService
            // vía runHandlersAndEmit() para poder esperar a que Andreani cree el envío
            // antes de enviar el email de confirmación (con número de seguimiento).
            if (eventType === 'SALE_CREATED') {
                console.log(`✅ [HandlerExecutor] Evento '${eventType}' se ejecuta vía runHandlersAndEmit (no listener)`);
                return;
            }

            // Suscribirse al evento en el Event Bus
            eventBus.on(eventType, async (payload) => {
                await this.executeHandlers(eventType, payload);
            });

            console.log(`✅ [HandlerExecutor] Registrado evento '${eventType}' con ${enabledHandlers.length} handler(s)`);
        });

        this.initialized = true;
        console.log(`✅ [HandlerExecutor] Inicializado - ${eventTypes.length} tipo(s) de evento, ${Object.values(handlersRegistry).flat().length} handler(s) total`);
    }

    /**
     * Ejecuta los handlers de un evento y luego emite al Event Bus.
     * Usado por PaymentProcessingService para SALE_CREATED: así se espera a que
     * Andreani cree el pre-envío antes de enviar el email con número de seguimiento.
     *
     * @param eventType - Tipo de evento (ej: 'SALE_CREATED')
     * @param payload - Payload del evento
     */
    async runHandlersAndEmit(eventType: string, payload: any): Promise<void> {
        await this.executeHandlers(eventType, payload);
        await eventBus.emit(eventType, payload);
    }

    /**
     * Ejecuta todos los handlers para un evento
     */
    private async executeHandlers(eventType: string, payload: any): Promise<void> {
        // Para SALE_CREATED, solo ejecutar handlers si estado_pago = 'aprobado'
        if (eventType === 'SALE_CREATED' && payload.estado_pago !== 'aprobado') {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`ℹ️ [HandlerExecutor] Evento SALE_CREATED ignorado (estado: ${payload.estado_pago}, solo se ejecuta cuando es 'aprobado')`);
            }
            return;
        }

        const startTime = Date.now();
        const handlers = handlersRegistry[eventType] || [];
        const enabledHandlers = handlers.filter(h => h.enabled !== false);
        
        if (enabledHandlers.length === 0) {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`ℹ️ [HandlerExecutor] Evento '${eventType}' sin handlers habilitados`);
            }
            return;
        }

        // Ordenar por prioridad (menor = primero)
        enabledHandlers.sort((a, b) => (a.priority || 100) - (b.priority || 100));

        // Crear contexto compartido
        const context: EventContext = {
            handlerData: {},
            metadata: {
                eventType,
                timestamp: new Date().toISOString(),
                source: 'event-bus',
                triggeredBy: 'system',
            },
        };

        const results: HandlerExecutionResult[] = [];
        let succeeded = 0;
        let failed = 0;

        console.log(`🔄 [HandlerExecutor] Ejecutando ${enabledHandlers.length} handler(s) para evento '${eventType}'`);

        // Ejecutar cada handler secuencialmente
        for (const handler of enabledHandlers) {
            const handlerStart = Date.now();
            const contextBefore = JSON.parse(JSON.stringify(context.handlerData)); // Snapshot antes
            
            try {
                await handler.handle(payload, context);
                
                const duration = Date.now() - handlerStart;
                const dataAdded = this.getContextDiff(contextBefore, context.handlerData);
                
                results.push({ 
                    handler: handler.name, 
                    success: true, 
                    duration,
                    dataAdded: Object.keys(dataAdded).length > 0 ? dataAdded : undefined,
                });
                succeeded++;
                
                console.log(`✅ [HandlerExecutor] Handler '${handler.name}' ejecutado exitosamente (${duration}ms)`);
            } catch (error: any) {
                const duration = Date.now() - handlerStart;
                results.push({ 
                    handler: handler.name, 
                    success: false, 
                    error: error.message || String(error),
                    duration,
                });
                failed++;
                
                console.error(`❌ [HandlerExecutor] Handler '${handler.name}' falló: ${error.message || error}`);
            }
        }

        const totalDuration = Date.now() - startTime;

        // Registrar en event_logs
        await this.logEventExecution(eventType, payload, {
            handlers_executed: enabledHandlers.length,
            handlers_succeeded: succeeded,
            handlers_failed: failed,
            total_duration_ms: totalDuration,
            handler_results: results,
        }, context);

        console.log(`✅ [HandlerExecutor] Evento '${eventType}' procesado: ${succeeded} exitoso(s), ${failed} fallido(s) (${totalDuration}ms)`);
    }

    /**
     * Obtiene la diferencia entre dos objetos (datos agregados por el handler)
     */
    private getContextDiff(before: Record<string, any>, after: Record<string, any>): Record<string, any> {
        const diff: Record<string, any> = {};
        for (const key in after) {
            if (!(key in before) || JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
                diff[key] = after[key];
            }
        }
        return diff;
    }

    /**
     * Registra la ejecución en event_logs
     */
    private async logEventExecution(
        eventType: string, 
        payload: any, 
        stats: EventExecutionStats,
        context: EventContext
    ): Promise<void> {
        try {
            await prisma.event_logs.create({
                data: {
                    event_type: eventType,
                    payload: payload as any,
                    handlers_executed: stats.handlers_executed,
                    handlers_succeeded: stats.handlers_succeeded,
                    handlers_failed: stats.handlers_failed,
                    total_duration_ms: stats.total_duration_ms,
                    handler_results: {
                        results: stats.handler_results,
                        context: context.handlerData, // Incluir datos agregados por handlers
                    } as any,
                    source: context.metadata.source || 'event-bus',
                    triggered_by: context.metadata.triggeredBy || 'system',
                },
            });
        } catch (error: any) {
            console.error('❌ [HandlerExecutor] Error al registrar en event_logs:', error);
        }
    }

    /**
     * Verifica si el servicio está inicializado
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}

export const handlerExecutorService = new HandlerExecutorService();
