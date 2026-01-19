import redisClient, { isRedisEnabled } from '../config/redis.config';

class CacheService {
    // Verificar si Redis está disponible y conectado
    private async isRedisAvailable(): Promise<boolean> {
        if (!isRedisEnabled() || !redisClient) {
            return false;
        }
        try {
            const status = redisClient.status;
            return status === 'ready' || status === 'connect';
        } catch (error) {
            return false;
        }
    }
    
    // Obtener dato del caché
    async get<T>(key: string): Promise<T | null> {
        if (!(await this.isRedisAvailable()) || !redisClient) {
            return null;
        }
        try {
            const data = await redisClient.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            // Silenciosamente devolver null si hay error (Redis no disponible)
            return null;
        }
    }

    // Guardar en caché con TTL (tiempo de expiración en segundos)
    async set(key: string, value: any, ttl: number = 3600): Promise<void> {
        if (!(await this.isRedisAvailable()) || !redisClient) {
            return; // No hacer nada si Redis no está disponible
        }
        try {
            await redisClient.setex(key, ttl, JSON.stringify(value));
        } catch (error) {
            // Silenciosamente ignorar errores si Redis no está disponible
        }
    }

    // Eliminar una key específica
    async delete(key: string): Promise<void> {
        if (!(await this.isRedisAvailable()) || !redisClient) {
            return; // No hacer nada si Redis no está disponible
        }
        try {
            await redisClient.del(key);
        } catch (error) {
            // Silenciosamente ignorar errores si Redis no está disponible
        }
    }

    // Eliminar múltiples keys por patrón (ej: "productos:*")
    async deletePattern(pattern: string): Promise<void> {
        if (!(await this.isRedisAvailable()) || !redisClient) {
            return; // No hacer nada si Redis no está disponible
        }
        try {
            const keys = await redisClient.keys(pattern);
            if (keys.length > 0) {
                await redisClient.del(...keys);
            }
        } catch (error) {
            // Silenciosamente ignorar errores si Redis no está disponible
        }
    }

    // Verificar si existe una key
    async exists(key: string): Promise<boolean> {
        if (!(await this.isRedisAvailable()) || !redisClient) {
            return false;
        }
        try {
            const result = await redisClient.exists(key);
            return result === 1;
        } catch (error) {
            return false;
        }
    }

    // Incrementar contador (útil para rate limiting)
    async increment(key: string, ttl?: number): Promise<number> {
        if (!(await this.isRedisAvailable()) || !redisClient) {
            return 0;
        }
        try {
            const value = await redisClient.incr(key);
            if (ttl && value === 1) {
                await redisClient.expire(key, ttl);
            }
            return value;
        } catch (error) {
            return 0;
        }
    }
}

export default new CacheService();
