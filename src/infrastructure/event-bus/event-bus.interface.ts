/**
 * Interfaz del Event Bus
 * Define el contrato para el sistema de eventos
 */

export interface IEventBus {
  /**
   * Emite un evento al bus
   * @param eventType - Tipo del evento
   * @param payload - Datos del evento
   */
  emit<T = any>(eventType: string, payload: T): Promise<void>;

  /**
   * Suscribe un listener a un tipo de evento
   * @param eventType - Tipo del evento
   * @param handler - Función que maneja el evento
   * @returns Función para desuscribirse
   */
  on<T = any>(eventType: string, handler: (payload: T) => void | Promise<void>): () => void;

  /**
   * Desuscribe un listener
   * @param eventType - Tipo del evento
   * @param handler - Función que se desuscribirá
   */
  off(eventType: string, handler: (payload: any) => void | Promise<void>): void;

  /**
   * Verifica si el Event Bus está disponible
   */
  isAvailable(): boolean;
}

