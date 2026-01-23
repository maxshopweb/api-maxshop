/**
 * Registro centralizado de todos los handlers del Event Bus
 * 
 * Este archivo es el punto central donde se registran todos los handlers.
 * Para agregar un nuevo handler:
 * 1. Crear el handler en su carpeta correspondiente
 * 2. Importarlo aquí
 * 3. Agregarlo al array correspondiente
 */

import { IEventHandler } from './handler.interface';
import { SaleEventType } from '../../domain/events/sale.events';
import { saleCreatedHandlers } from './sale-created';

/**
 * Registro de handlers por tipo de evento
 * 
 * Estructura:
 * {
 *   'EVENT_TYPE': [handler1, handler2, ...]
 * }
 */
export const handlersRegistry: Record<string, IEventHandler[]> = {
    [SaleEventType.SALE_CREATED]: saleCreatedHandlers,
    // Preparado para futuros eventos:
    // [SaleEventType.SALE_UPDATED]: saleUpdatedHandlers,
    // [SaleEventType.SALE_CANCELLED]: saleCancelledHandlers,
};

/**
 * Obtiene todos los handlers registrados para un tipo de evento
 */
export function getHandlersForEvent(eventType: string): IEventHandler[] {
    return handlersRegistry[eventType] || [];
}

/**
 * Obtiene estadísticas de handlers registrados
 */
export function getHandlersStats(): {
    totalEvents: number;
    totalHandlers: number;
    handlersByEvent: Record<string, number>;
} {
    const handlersByEvent: Record<string, number> = {};
    let totalHandlers = 0;

    Object.keys(handlersRegistry).forEach(eventType => {
        const count = handlersRegistry[eventType].length;
        handlersByEvent[eventType] = count;
        totalHandlers += count;
    });

    return {
        totalEvents: Object.keys(handlersRegistry).length,
        totalHandlers,
        handlersByEvent,
    };
}
