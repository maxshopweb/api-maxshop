/**
 * Event Bus - Sistema de eventos escalable
 * 
 * Soporta:
 * - Redis Pub/Sub para múltiples instancias (si Redis está disponible)
 * - EventEmitter en memoria como fallback
 * 
 * Arquitectura desacoplada: los servicios emiten eventos,
 * el WebSocket escucha y los propaga a los clientes
 */

import { EventEmitter } from 'events';
import { IEventBus } from './event-bus.interface';
import redisClient, { isRedisEnabled } from '../../config/redis.config';
import type Redis from 'ioredis';

/**
 * Event Bus con soporte Redis Pub/Sub y fallback a EventEmitter
 */
class EventBus implements IEventBus {
  private emitter: EventEmitter;
  private redisEnabled: boolean;
  private redisSubscriber: Redis | null = null;
  private redisPublisher: Redis | null = null;
  private readonly REDIS_CHANNEL_PREFIX = 'event:';

  constructor() {
    this.emitter = new EventEmitter();
    this.redisEnabled = isRedisEnabled() && redisClient !== null;
    // Inicializar Redis de forma asíncrona (no bloqueante)
    void this.initializeRedis();
  }

  /**
   * Inicializa Redis Pub/Sub si está disponible
   */
  private async initializeRedis(): Promise<void> {
    if (!this.redisEnabled || !redisClient) {
      return;
    }

    try {
      // Crear suscriptor y publicador separados (requerido por Redis)
      // En ioredis, necesitamos crear instancias separadas para pub/sub
      const Redis = require('ioredis');
      
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
        retryStrategy: (times: number) => {
          if (times > 10) return null;
          return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableOfflineQueue: false,
      };

      this.redisSubscriber = new Redis(redisConfig);
      this.redisPublisher = new Redis(redisConfig);

      // Conectar
      if (this.redisSubscriber && this.redisPublisher) {
        await this.redisSubscriber.connect();
        await this.redisPublisher.connect();

        // Escuchar mensajes de Redis (pmessage para psubscribe)
        this.redisSubscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
          try {
            const { eventType, payload } = JSON.parse(message);
            // Emitir localmente para que los listeners locales lo reciban
            this.emitter.emit(eventType, payload);
          } catch (error) {
            console.error('❌ [EventBus] Error al procesar mensaje de Redis:', error);
          }
        });

        // Suscribirse a todos los canales de eventos usando pattern matching
        await this.redisSubscriber.psubscribe(`${this.REDIS_CHANNEL_PREFIX}*`);
      }

    } catch (error) {
      console.warn('⚠️ [EventBus] Error al inicializar Redis Pub/Sub, usando EventEmitter:', error);
      this.redisEnabled = false;
      this.redisSubscriber = null;
      this.redisPublisher = null;
    }
  }

  /**
   * Emite un evento al bus
   */
  async emit<T = any>(eventType: string, payload: T): Promise<void> {
    // Emitir localmente (siempre)
    this.emitter.emit(eventType, payload);

    // Si Redis está disponible, publicar también en Redis
    if (this.redisEnabled && this.redisPublisher) {
      try {
        const channel = `${this.REDIS_CHANNEL_PREFIX}${eventType}`;
        const message = JSON.stringify({ eventType, payload });
        await this.redisPublisher.publish(channel, message);
      } catch (error) {
        console.error(`❌ [EventBus] Error al publicar en Redis para evento ${eventType}:`, error);
        // Continuar sin Redis, el evento ya se emitió localmente
      }
    }
  }

  /**
   * Suscribe un listener a un tipo de evento
   */
  on<T = any>(eventType: string, handler: (payload: T) => void | Promise<void>): () => void {
    // Wrapper para manejar promesas
    const wrappedHandler = (payload: T) => {
      const result = handler(payload);
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error(`❌ [EventBus] Error en handler para evento ${eventType}:`, error);
        });
      }
    };
    
    this.emitter.on(eventType, wrappedHandler);
    
    // Retornar función para desuscribirse
    return () => {
      this.off(eventType, handler);
    };
  }

  /**
   * Desuscribe un listener
   */
  off(eventType: string, handler: (payload: any) => void | Promise<void>): void {
    this.emitter.off(eventType, handler as any);
  }

  /**
   * Verifica si el Event Bus está disponible
   */
  isAvailable(): boolean {
    return true; // Siempre disponible (con o sin Redis)
  }

  /**
   * Cierra las conexiones de Redis
   */
  async close(): Promise<void> {
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit();
      this.redisSubscriber = null;
    }
    if (this.redisPublisher) {
      await this.redisPublisher.quit();
      this.redisPublisher = null;
    }
  }
}

// Exportar instancia singleton
export const eventBus = new EventBus();

