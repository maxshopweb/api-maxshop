/**
 * Servicio de Envíos Reales de Andreani
 * 
 * Maneja las operaciones relacionadas con ENVÍOS REALES (cuando el pre-envío fue aceptado):
 * - GET estado: Consultar estado del envío real
 * - GET etiqueta: Obtener etiqueta del envío
 * 
 * IMPORTANTE:
 * - Estos endpoints solo funcionan cuando el pre-envío fue aceptado (estado "Creada")
 * - Si el pre-envío está en "Solicitada" o "Pendiente", estos endpoints retornarán 404
 */

import { prisma } from '../../index';
import { andreaniApiService } from './andreani.api.service';
import {
    IEstadoEnvioRealResponse,
    IEtiquetaResponse,
    ITrazasEnvioResponse,
} from './andreani.types';

export class AndreaniEnvioService {
    /**
     * Consulta el estado de un ENVÍO real
     * GET /v2/envios/{numeroAndreani}
     * 
     * IMPORTANTE: Solo funciona si el pre-envío fue aceptado (estado "Creada")
     * Si el pre-envío está en "Solicitada" o "Pendiente", retornará 404
     * 
     * @param numeroAndreani - Número de tracking del envío (es el mismo numeroDeEnvio del pre-envío)
     * @returns Estado del envío real
     */
    async consultarEstadoEnvio(numeroAndreani: string): Promise<IEstadoEnvioRealResponse> {
        try {
            if (!numeroAndreani) {
                throw new Error('Se debe proporcionar numeroAndreani');
            }

            const endpoint = `/v2/envios/${numeroAndreani}`;
            const result = await andreaniApiService.get<IEstadoEnvioRealResponse>(endpoint);

            if (!result.success || !result.data) {
                // Si es 404, el envío aún no existe (pre-envío no aceptado o aún procesándose)
                if (result.statusCode === 404) {
                    throw new Error(
                        `El envío ${numeroAndreani} aún no está disponible. ` +
                        `El pre-envío puede estar en estado "Solicitada" o aún procesándose. ` +
                        `Consulta el pre-envío en /v2/ordenes-de-envio/${numeroAndreani}`
                    );
                }
                throw new Error(
                    result.error || 'Error al consultar estado del envío'
                );
            }

            // Actualizar estado en BD
            const envio = await prisma.envios.findFirst({
                where: { cod_seguimiento: numeroAndreani },
            });

            if (envio && result.data.estado) {
                await prisma.envios.update({
                    where: { id_envio: envio.id_envio },
                    data: {
                        estado_envio: this.mapearEstadoEnvioReal(result.data.estado),
                    },
                });

                if (envio.id_venta) {
                    await prisma.venta.update({
                        where: { id_venta: envio.id_venta },
                        data: {
                            estado_envio: this.mapearEstadoEnvioReal(result.data.estado),
                        },
                    });
                }
            }

            return result.data;
        } catch (error: any) {
            console.error(`❌ [Andreani Envío] Error al consultar estado del envío:`, error.message);
            throw error;
        }
    }

    /**
     * Obtiene la etiqueta de un envío
     * GET /v2/ordenes-de-envio/{agrupadorDeBultos}/etiquetas
     * 
     * @param agrupadorDeBultos - Agrupador de bultos del pre-envío
     * @param bulto - Número de bulto (opcional)
     * @returns Etiqueta del envío
     */
    async obtenerEtiqueta(agrupadorDeBultos: string, bulto?: number): Promise<IEtiquetaResponse> {
        try {
            if (!agrupadorDeBultos) {
                throw new Error('Se debe proporcionar agrupadorDeBultos');
            }

            let endpoint = `/v2/ordenes-de-envio/${agrupadorDeBultos}/etiquetas`;
            if (bulto) {
                endpoint += `?bulto=${bulto}`;
            }

            const result = await andreaniApiService.get<IEtiquetaResponse>(endpoint);

            if (!result.success || !result.data) {
                throw new Error(
                    result.error || 'Error al obtener etiqueta'
                );
            }

            return result.data;
        } catch (error: any) {
            console.error(`❌ [Andreani Envío] Error al obtener etiqueta:`, error.message);
            throw error;
        }
    }

    /**
     * Consulta las trazas (historial completo) de un ENVÍO real
     * GET /v2/envios/{numeroAndreani}/trazas
     * 
     * IMPORTANTE: Solo funciona si el pre-envío fue aceptado (estado "Creada")
     * 
     * @param numeroAndreani - Número de tracking del envío
     * @returns Trazas del envío con todos los eventos
     */
    async consultarTrazasEnvio(numeroAndreani: string): Promise<ITrazasEnvioResponse> {
        try {
            if (!numeroAndreani) {
                throw new Error('Se debe proporcionar numeroAndreani');
            }

            const endpoint = `/v2/envios/${numeroAndreani}/trazas`;
            const result = await andreaniApiService.get<ITrazasEnvioResponse>(endpoint);

            if (!result.success || !result.data) {
                if (result.statusCode === 404) {
                    throw new Error(
                        `Las trazas del envío ${numeroAndreani} no están disponibles. ` +
                        `El envío puede estar aún en proceso o el pre-envío no fue aceptado.`
                    );
                }
                throw new Error(
                    result.error || 'Error al consultar trazas del envío'
                );
            }

            return result.data;
        } catch (error: any) {
            console.error(`❌ [Andreani Envío] Error al consultar trazas del envío:`, error.message);
            throw error;
        }
    }

    /**
     * Mapea el estado del envío real al estado interno
     */
    private mapearEstadoEnvioReal(estadoAndreani: string): string {
        const estados: Record<string, string> = {
            'pendiente': 'pendiente',
            'pendiente de ingreso': 'preparando',
            'ingreso al circuito operativo': 'preparando',
            'en distribución': 'en_transito',
            'visita': 'en_transito',
            'entregado': 'entregado',
            'rendido': 'entregado',
            'cancelado': 'cancelado',
        };

        return estados[estadoAndreani.toLowerCase()] || estadoAndreani.toLowerCase();
    }
}

// Exportar instancia singleton
export const andreaniEnvioService = new AndreaniEnvioService();

