/**
 * Configuración de la API de Andreani
 * 
 * Esta configuración centraliza todas las URLs y constantes
 * relacionadas con la integración de Andreani.
 * 
 * Soporta QA y PROD mediante variables de entorno:
 * - ANDREANI_ENV: 'qa' | 'prod' (opcional, si no existe usa NODE_ENV)
 * - ANDREANI_BASE_URL_QA: URL base para QA (default: https://apisqa.andreani.com)
 * - ANDREANI_BASE_URL_PROD: URL base para PROD (default: https://apis.andreani.com)
 */

/**
 * Determina el entorno actual (QA o PROD)
 */
function getAndreaniEnvironment(): 'qa' | 'prod' {
    const env = (process.env.ANDREANI_ENV || process.env.NODE_ENV || 'qa').toLowerCase();
    return env === 'production' || env === 'prod' ? 'prod' : 'qa';
}

/**
 * Obtiene la URL base según el entorno
 */
function getBaseUrl(): string {
    const environment = getAndreaniEnvironment();
    
    if (environment === 'prod') {
        return process.env.ANDREANI_BASE_URL_PROD || 'https://apis.andreani.com';
    }
    
    // QA por defecto
    return process.env.ANDREANI_BASE_URL_QA || process.env.ANDREANI_BASE_URL || 'https://apisqa.andreani.com';
}

export const andreaniConfig = {
    // URL base de la API (resuelve automáticamente QA/PROD)
    baseUrl: getBaseUrl(),
    
    // Entorno actual
    environment: getAndreaniEnvironment(),
    
    // Endpoints
    endpoints: {
        login: '/login',
        ordenes: '/v2/ordenes-de-envio',
        etiquetas: '/v2/etiquetas',
        tarifas: '/v1/tarifas', // Endpoint de cotización
    },
    
    // Credenciales (Basic Auth)
    credentials: {
        username: process.env.ANDREANI_USERNAME || '',
        password: process.env.ANDREANI_PASSWORD || '',
        clientCode: process.env.ANDREANI_CLIENT_CODE || '',
    },
    
    // Configuración de reintentos
    retry: {
        maxAttempts: 3,
        delayMs: 1000, // 1 segundo entre reintentos
    },
    
    // Timeout para requests (en ms)
    timeout: 30000, // 30 segundos
} as const;

/**
 * Valida que las credenciales estén configuradas
 */
export function validateAndreaniConfig(): void {
    if (!andreaniConfig.credentials.username || !andreaniConfig.credentials.password) {
        throw new Error(
            '❌ [Andreani] Credenciales no configuradas. ' +
            'Asegúrate de definir ANDREANI_USERNAME y ANDREANI_PASSWORD en .env'
        );
    }
}

/**
 * Obtiene el entorno actual como string legible
 */
export function getAndreaniEnvironmentString(): 'QA' | 'PROD' {
    return andreaniConfig.environment === 'prod' ? 'PROD' : 'QA';
}

