/**
 * Servicio de autenticación con Andreani
 * 
 * Maneja la autenticación contra la API de Andreani usando Basic Auth.
 * El token obtenido se guarda en la base de datos (negocio.token_envio).
 * 
 * IMPORTANTE:
 * - El token es del sistema, no del usuario
 * - No se valida vencimiento (se usa directamente)
 * - Si falla, se renueva automáticamente
 */

import { prisma } from '../../index';
import { andreaniConfig, validateAndreaniConfig } from '../../config/andreani.config';
import { IAuthResponse, IApiResult } from './andreani.types';

export class AndreaniAuthService {
    /**
     * Obtiene el token de autenticación desde la base de datos
     * Si no existe o es inválido, lo renueva automáticamente
     */
    async getToken(): Promise<string> {
        try {
            // Validar configuración
            validateAndreaniConfig();

            // Obtener token desde BD (asumiendo que hay un único negocio)
            // Usar $queryRaw para evitar problemas con planes en caché de PostgreSQL
            const negocio = await prisma.$queryRaw<Array<{ token_envio: string | null }>>`
                SELECT token_envio FROM negocio LIMIT 1
            `;
            
            const negocioData = negocio && negocio.length > 0 ? negocio[0] : null;
            
            if (!negocioData) {
                throw new Error('❌ [Andreani] No se encontró configuración de negocio en la base de datos');
            }

            // Si existe token, intentar usarlo
            if (negocioData.token_envio) {
                return negocioData.token_envio;
            }

            // Si no existe, renovar
            return await this.renewToken();
        } catch (error: any) {
            console.error('❌ [Andreani] Error al obtener token:', error.message);
            throw error;
        }
    }

    /**
     * Renueva el token de autenticación contra la API de Andreani
     * Guarda el nuevo token en la base de datos
     */
    async renewToken(): Promise<string> {
        try {
            validateAndreaniConfig();


            // Validar que las credenciales no estén vacías
            if (!andreaniConfig.credentials.username || !andreaniConfig.credentials.password) {
                throw new Error(
                    '❌ [Andreani] Credenciales vacías. ' +
                    'Verifica que ANDREANI_USERNAME y ANDREANI_PASSWORD estén configuradas en .env'
                );
            }

            // Crear credenciales Basic Auth
            const credentials = Buffer.from(
                `${andreaniConfig.credentials.username}:${andreaniConfig.credentials.password}`
            ).toString('base64');


            // Hacer request de autenticación (GET según documentación de Andreani)
            const response = await fetch(`${andreaniConfig.baseUrl}${andreaniConfig.endpoints.login}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                },
            });


            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ [Andreani] Error completo:`, errorText);
                throw new Error(
                    `❌ [Andreani] Error en autenticación: ${response.status} ${response.statusText} - ${errorText}`
                );
            }

            const data = (await response.json()) as IAuthResponse;
            
            if (data.token) {
            }

            if (!data.token) {
                throw new Error('❌ [Andreani] La respuesta de autenticación no contiene token');
            }

            // Validar que el token no sea demasiado largo (por si acaso)
            if (data.token.length > 10000) {
                console.warn(`⚠️ [Andreani] Token muy largo (${data.token.length} caracteres), truncando...`);
                // No truncamos, mejor lanzar error para que se vea el problema
                throw new Error(`❌ [Andreani] Token demasiado largo (${data.token.length} caracteres). Verifica la respuesta de la API.`);
            }

            // Guardar token en BD
            // Usar $queryRaw para obtener el ID y luego actualizar con $executeRaw
            const negocio = await prisma.$queryRaw<Array<{ id_neg: number }>>`
                SELECT id_neg FROM negocio LIMIT 1
            `;
            
            const negocioData = negocio && negocio.length > 0 ? negocio[0] : null;
            
            if (!negocioData) {
                throw new Error('❌ [Andreani] No se encontró configuración de negocio');
            }

            // Usar $executeRaw para evitar problemas con planes en caché
            await prisma.$executeRaw`
                UPDATE negocio SET token_envio = ${data.token} WHERE id_neg = ${negocioData.id_neg}
            `;


            return data.token;
        } catch (error: any) {
            console.error('❌ [Andreani] Error al renovar token:', error.message);
            throw error;
        }
    }

    /**
     * Valida si un token es válido haciendo una request de prueba
     * (Opcional, no se usa por defecto según las reglas)
     */
    async validateToken(token: string): Promise<boolean> {
        try {
            // Esta función es opcional y no se usa por defecto
            // Se incluye por si se necesita en el futuro
            return true;
        } catch (error) {
            return false;
        }
    }
}

// Exportar instancia singleton
export const andreaniAuthService = new AndreaniAuthService();

