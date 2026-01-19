import Redis from 'ioredis';

// Verificar si Redis está habilitado
export const isRedisEnabled = () => {
    const enableRedis = process.env.ENABLE_REDIS;
    if (enableRedis !== undefined && enableRedis.toLowerCase() === 'false') {
        return false;
    }
    return true;
};

// Crear cliente Redis
let redisClient: Redis | null = null;

if (isRedisEnabled()) {
    // Configuración de conexión
    redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
        retryStrategy: (times) => {
            // Después de varios intentos, dejar de intentar
            if (times > 10) {
                return null; // No reintentar más
            }
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        maxRetriesPerRequest: 3,
        lazyConnect: true, // No conectar automáticamente
        enableOfflineQueue: false, // No encolar comandos si está offline
    });

    // Eventos de conexión
    redisClient.on('connect', () => {
    });

    redisClient.on('error', (err) => {
        // Solo mostrar warning, no error fatal
        console.warn('⚠️ Redis no disponible (continuando sin cache):', err.message);
    });

    redisClient.on('ready', () => {
    });

    // Intentar conectar (pero no fallar si no puede)
    redisClient.connect().catch(() => {
        // Silenciosamente ignorar error de conexión inicial
    });
} else {
}

export default redisClient;
