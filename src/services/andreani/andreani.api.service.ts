/**
 * Servicio API centralizado de Andreani
 * 
 * Este servicio maneja todas las requests HTTP a la API de Andreani:
 * - Agrega automáticamente el header x-authorization-token
 * - Captura errores 401/403 y renueva el token
 * - Reintenta automáticamente la request original
 * - Maneja timeouts y errores de red
 */

import { andreaniConfig } from '../../config/andreani.config';
import { andreaniAuthService } from './andreani.auth.service';
import { IApiRequestOptions, IApiResult } from './andreani.types';

export class AndreaniApiService {
    /**
     * Realiza una request a la API de Andreani con manejo automático de autenticación
     * 
     * @param endpoint - Endpoint relativo (ej: '/v2/ordenes-de-envio')
     * @param options - Opciones de la request
     * @returns Resultado de la operación
     */
    async request<T = any>(
        endpoint: string,
        options: IApiRequestOptions = {}
    ): Promise<IApiResult<T>> {
        const {
            method = 'GET',
            body,
            headers = {},
            retryOnAuthError = true,
        } = options;

        try {
            // Obtener token
            let token = await andreaniAuthService.getToken();

            // Construir URL completa
            const url = `${andreaniConfig.baseUrl}${endpoint}`;

            // Preparar headers
            const requestHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-authorization-token': token,
                ...headers,
            };

            // Preparar opciones de fetch
            const fetchOptions: RequestInit = {
                method,
                headers: requestHeaders,
            };

            // Agregar body si existe
            if (body) {
                fetchOptions.body = JSON.stringify(body);
            }

            // Hacer request con timeout
            const response = await this.fetchWithTimeout(url, fetchOptions);

            // Si es 401 o 403, renovar token y reintentar (si está habilitado)
            if ((response.status === 401 || response.status === 403) && retryOnAuthError) {
                
                // Renovar token
                token = await andreaniAuthService.renewToken();

                // Reintentar request con nuevo token
                requestHeaders['x-authorization-token'] = token;
                const retryResponse = await this.fetchWithTimeout(url, {
                    ...fetchOptions,
                    headers: requestHeaders,
                });

                return this.handleResponse<T>(retryResponse);
            }

            return this.handleResponse<T>(response);
        } catch (error: any) {
            console.error(`❌ [Andreani] Error en request a ${endpoint}:`, error.message);
            return {
                success: false,
                error: error.message || 'Error desconocido',
                statusCode: 500,
            };
        }
    }

    /**
     * Maneja la respuesta de fetch y la convierte a IApiResult
     */
    private async handleResponse<T>(response: Response): Promise<IApiResult<T>> {
        const statusCode = response.status;
        const contentType = response.headers.get('content-type');

        try {
            let data: T;

            // Determinar cómo parsear la respuesta según el content-type
            if (contentType?.includes('application/json')) {
                data = (await response.json()) as T;
            } else if (contentType?.includes('application/pdf')) {
                // Para etiquetas PDF, devolver como buffer/base64
                const buffer = await response.arrayBuffer();
                data = Buffer.from(buffer).toString('base64') as T;
            } else {
                const text = await response.text();
                data = text as T;
            }

            if (!response.ok) {
                return {
                    success: false,
                    error: `Error ${statusCode}: ${response.statusText}`,
                    statusCode,
                    data,
                };
            }

            return {
                success: true,
                data,
                statusCode,
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Error al parsear respuesta: ${error.message}`,
                statusCode,
            };
        }
    }

    /**
     * Realiza un fetch con timeout
     */
    private async fetchWithTimeout(
        url: string,
        options: RequestInit
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), andreaniConfig.timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            return response;
        } catch (error: any) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error(`Timeout después de ${andreaniConfig.timeout}ms`);
            }
            
            throw error;
        }
    }

    /**
     * GET request simplificado
     */
    async get<T = any>(endpoint: string, headers?: Record<string, string>): Promise<IApiResult<T>> {
        return this.request<T>(endpoint, { method: 'GET', headers });
    }

    /**
     * POST request simplificado
     */
    async post<T = any>(
        endpoint: string,
        body?: any,
        headers?: Record<string, string>
    ): Promise<IApiResult<T>> {
        return this.request<T>(endpoint, { method: 'POST', body, headers });
    }

    /**
     * PUT request simplificado
     */
    async put<T = any>(
        endpoint: string,
        body?: any,
        headers?: Record<string, string>
    ): Promise<IApiResult<T>> {
        return this.request<T>(endpoint, { method: 'PUT', body, headers });
    }
}

// Exportar instancia singleton
export const andreaniApiService = new AndreaniApiService();

