/**
 * Interfaz base para todos los handlers de eventos
 * 
 * Cada handler debe implementar esta interfaz para ser registrado
 * y ejecutado por el HandlerExecutorService
 */

export interface IEventHandler<T = any, C = any> {
    /**
     * Nombre único del handler (para logging e identificación)
     */
    name: string;

    /**
     * Tipo de evento que maneja (ej: 'SALE_CREATED')
     */
    eventType: string;

    /**
     * Descripción del handler (opcional, para documentación)
     */
    description?: string;

    /**
     * Prioridad de ejecución (menor = primero)
     * Default: 100
     */
    priority?: number;

    /**
     * Si el handler está habilitado
     * Default: true
     */
    enabled?: boolean;

    /**
     * Método principal que ejecuta la lógica del handler
     * 
     * @param payload - Datos del evento
     * @param context - Contexto compartido entre handlers (puede ser modificado)
     * @returns Promise que se resuelve cuando el handler termina
     */
    handle(payload: T, context: C): Promise<void>;
}

/**
 * Contexto compartido entre handlers
 * Permite que handlers agreguen datos que otros handlers pueden usar
 */
export interface EventContext {
    /**
     * Datos adicionales agregados por handlers
     * Cada handler puede agregar datos aquí usando su nombre como clave
     */
    handlerData: Record<string, any>;

    /**
     * Metadatos del evento
     */
    metadata: {
        eventType: string;
        timestamp: string;
        source?: string;
        triggeredBy?: string;
    };
}
