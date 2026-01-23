import axios from 'axios';
import cacheService from './cache.service';

/**
 * Resultado individual de OpenCage API
 */
interface OpenCageResult {
    formatted: string;
    components: {
        road?: string;
        house_number?: string;
        suburb?: string;
        neighbourhood?: string;
        quarter?: string;
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        state?: string;
        state_code?: string;
        postcode?: string;
        country?: string;
        country_code?: string;
    };
    geometry: {
        lat: number;
        lng: number;
    };
    confidence: number;
}

/**
 * Respuesta de OpenCage API
 */
interface OpenCageResponse {
    results: OpenCageResult[];
    status: {
        code: number;
        message: string;
    };
}

/**
 * DTO normalizado para respuesta de direcciones
 */
export interface IDireccionOpenCageDTO {
    direccion_formateada: string;
    calle?: string;
    numero?: string;
    ciudad?: string;
    provincia?: string;
    cod_postal?: string;
    pais?: string;
    latitud: number;
    longitud: number;
    confianza?: number;
}

/**
 * Servicio para geocodificación con OpenCage API
 * 
 * Características:
 * - Búsqueda de direcciones (geocodificación directa)
 * - Geocodificación inversa (coordenadas → dirección)
 * - Cache opcional con Redis (funciona sin Redis)
 * - Rate limiting básico
 * - Formato personalizado para Argentina
 */
class OpenCageService {
    private readonly API_KEY: string;
    private readonly BASE_URL = 'https://api.opencagedata.com/geocode/v1/json';
    private readonly TIMEOUT = 8000; // 8 segundos
    private readonly CACHE_TTL = 3600; // 1 hora
    private readonly RATE_LIMIT_PER_MINUTE = 50;

    constructor() {
        const apiKey = process.env.OPENCAGE_API_KEY;
        if (!apiKey) {
            console.warn('⚠️ OPENCAGE_API_KEY no está definida en las variables de entorno');
        }
        this.API_KEY = apiKey || '';
    }

    /**
     * Formatea la dirección en el estilo deseado:
     * "Calle Numero / CP XXXX - Ciudad, Provincia"
     * 
     * Ejemplos:
     * - "Fray Luis Beltrán 367 / CP 8300 - Neuquen, Neuquén"
     * - "Chapeaurouge 20 / CP 5620 - General Alvear, Mendoza"
     */
    private formatearDireccion(result: OpenCageResult): string {
        const components = result.components;
        
        // Extraer calle y número
        const calle = components.road || '';
        const numero = components.house_number || '';
        
        // Extraer código postal (limpiar letras si las tiene, ej: "Q8300" → "8300")
        const cpRaw = components.postcode || '';
        const codPostal = cpRaw.replace(/[A-Za-z]/g, '').trim();
        
        // Extraer ciudad (prioridad: city > town > village > municipality)
        const ciudad = components.city || components.town || components.village || components.municipality || '';
        
        // Extraer provincia
        const provincia = components.state || '';
        
        // Construir dirección formateada
        let partes: string[] = [];
        
        // Parte 1: Calle y número
        if (calle) {
            partes.push(numero ? `${calle} ${numero}` : calle);
        }
        
        // Parte 2: CP (si existe)
        if (codPostal) {
            partes.push(`CP ${codPostal}`);
        }
        
        // Parte 3: Ciudad y Provincia
        let ubicacion = '';
        if (ciudad && provincia) {
            ubicacion = `${ciudad}, ${provincia}`;
        } else if (ciudad) {
            ubicacion = ciudad;
        } else if (provincia) {
            ubicacion = provincia;
        }
        
        // Unir todo
        if (partes.length === 0 && ubicacion) {
            return ubicacion;
        }
        
        if (partes.length === 1 && ubicacion) {
            return `${partes[0]} - ${ubicacion}`;
        }
        
        if (partes.length === 2 && ubicacion) {
            return `${partes[0]} / ${partes[1]} - ${ubicacion}`;
        }
        
        // Fallback: usar el formato de OpenCage
        return result.formatted;
    }

    /**
     * Normaliza el resultado de OpenCage a nuestro DTO interno
     */
    private normalizeResult(result: OpenCageResult): IDireccionOpenCageDTO {
        const components = result.components;
        
        // Extraer calle
        const calle = components.road || undefined;
        
        // Extraer número
        const numero = components.house_number || undefined;
        
        // Extraer ciudad
        const ciudad = components.city || components.town || components.village || components.municipality || undefined;
        
        // Extraer provincia
        const provincia = components.state || undefined;
        
        // Extraer código postal (sin letras)
        const cpRaw = components.postcode || '';
        const cod_postal = cpRaw.replace(/[A-Za-z]/g, '').trim() || undefined;
        
        // País
        const pais = components.country || 'Argentina';
        
        // Coordenadas
        const latitud = result.geometry.lat;
        const longitud = result.geometry.lng;
        
        // Dirección formateada personalizada
        const direccion_formateada = this.formatearDireccion(result);

        return {
            direccion_formateada,
            calle,
            numero,
            ciudad,
            provincia,
            cod_postal,
            pais,
            latitud,
            longitud,
            confianza: result.confidence,
        };
    }

    /**
     * Búsqueda de direcciones (geocodificación directa)
     * 
     * @param query - Texto de búsqueda (dirección, ciudad, etc.)
     * @param limit - Número máximo de resultados (default: 5)
     * @param country - Código de país (default: 'ar' para Argentina)
     */
    async search(query: string, limit: number = 5, country: string = 'ar'): Promise<IDireccionOpenCageDTO[]> {
        if (!this.API_KEY) {
            throw new Error('OpenCage API key no configurada');
        }

        if (!query || query.trim().length < 3) {
            throw new Error('La búsqueda debe tener al menos 3 caracteres');
        }

        // Rate limiting (si Redis está disponible)
        const rateLimitKey = `opencage:ratelimit:${Math.floor(Date.now() / 60000)}`;
        const currentRequests = await cacheService.increment(rateLimitKey, 60);
        if (currentRequests > this.RATE_LIMIT_PER_MINUTE) {
            throw new Error('Límite de solicitudes excedido. Por favor, intente más tarde.');
        }

        // Verificar cache
        const cacheKey = `opencage:search:${query.toLowerCase().trim()}:${limit}:${country}`;
        const cached = await cacheService.get<IDireccionOpenCageDTO[]>(cacheKey);
        if (cached) {
            console.log(`✅ [OpenCage] Cache hit para: "${query}"`);
            return cached;
        }

        try {
            const params = new URLSearchParams({
                q: query.trim(),
                key: this.API_KEY,
                limit: limit.toString(),
                countrycode: country,
                language: 'es',
                no_annotations: '1',
            });

            const response = await axios.get<OpenCageResponse>(
                `${this.BASE_URL}?${params}`,
                { timeout: this.TIMEOUT }
            );

            if (response.data.status.code !== 200) {
                throw new Error(`OpenCage API error: ${response.data.status.message}`);
            }

            if (!response.data.results || response.data.results.length === 0) {
                return [];
            }

            // Normalizar y filtrar resultados con baja confianza
            const normalizedResults = response.data.results
                .filter((result: OpenCageResult) => result.confidence >= 1)
                .map((result: OpenCageResult) => this.normalizeResult(result));

            // Guardar en cache
            await cacheService.set(cacheKey, normalizedResults, this.CACHE_TTL);

            console.log(`✅ [OpenCage] ${normalizedResults.length} resultados para: "${query}"`);
            return normalizedResults;

        } catch (error: any) {
            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNABORTED') {
                    throw new Error('Tiempo de espera agotado al buscar direcciones');
                }
                if (error.response?.status === 429) {
                    throw new Error('Demasiadas solicitudes. Por favor, intente más tarde.');
                }
                if (error.response?.status === 403) {
                    throw new Error('API key inválida o sin permisos');
                }
                throw new Error(`Error al buscar direcciones: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Geocodificación inversa (coordenadas → dirección)
     * 
     * @param lat - Latitud
     * @param lng - Longitud
     * @param country - Código de país (default: 'ar')
     */
    async reverse(lat: number, lng: number, country: string = 'ar'): Promise<IDireccionOpenCageDTO | null> {
        if (!this.API_KEY) {
            throw new Error('OpenCage API key no configurada');
        }

        // Validar coordenadas
        if (isNaN(lat) || isNaN(lng)) {
            throw new Error('Coordenadas inválidas');
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new Error('Coordenadas fuera de rango válido');
        }

        // Rate limiting
        const rateLimitKey = `opencage:ratelimit:${Math.floor(Date.now() / 60000)}`;
        const currentRequests = await cacheService.increment(rateLimitKey, 60);
        if (currentRequests > this.RATE_LIMIT_PER_MINUTE) {
            throw new Error('Límite de solicitudes excedido. Por favor, intente más tarde.');
        }

        // Cache (redondeado a 4 decimales para agrupar resultados cercanos)
        const latRounded = Number(lat.toFixed(4));
        const lngRounded = Number(lng.toFixed(4));
        const cacheKey = `opencage:reverse:${latRounded}:${lngRounded}`;
        const cached = await cacheService.get<IDireccionOpenCageDTO>(cacheKey);
        if (cached) {
            console.log(`✅ [OpenCage] Cache hit para reverse: ${lat}, ${lng}`);
            return cached;
        }

        try {
            const params = new URLSearchParams({
                q: `${lat},${lng}`,
                key: this.API_KEY,
                limit: '1',
                language: 'es',
                no_annotations: '1',
                countrycode: country,
            });

            const response = await axios.get<OpenCageResponse>(
                `${this.BASE_URL}?${params}`,
                { timeout: this.TIMEOUT }
            );

            if (response.data.status.code !== 200) {
                throw new Error(`OpenCage API error: ${response.data.status.message}`);
            }

            if (!response.data.results || response.data.results.length === 0) {
                return null;
            }

            // Normalizar resultado
            const normalizedResult = this.normalizeResult(response.data.results[0]);

            // Guardar en cache
            await cacheService.set(cacheKey, normalizedResult, this.CACHE_TTL);

            console.log(`✅ [OpenCage] Reverse exitoso para: ${lat}, ${lng}`);
            return normalizedResult;

        } catch (error: any) {
            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNABORTED') {
                    throw new Error('Tiempo de espera agotado al obtener dirección');
                }
                if (error.response?.status === 429) {
                    throw new Error('Demasiadas solicitudes. Por favor, intente más tarde.');
                }
                throw new Error(`Error en geocodificación inversa: ${error.message}`);
            }
            throw error;
        }
    }
}

export default new OpenCageService();
