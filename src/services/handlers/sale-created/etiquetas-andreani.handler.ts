/**
 * Handler de Etiquetas Andreani para SALE_CREATED
 *
 * Responsabilidades:
 * - Tras el pre-envío Andreani, descargar las etiquetas desde los links en respuestaCompleta
 * - Subir cada etiqueta al FTP en /Tekno/Andreani/{cod_interno}/etiqueta_N.{pdf|png}
 *   (carpeta nombrada por código de venta, no por código de seguimiento Andreani)
 * - Manejo de errores por bulto sin interrumpir el flujo ni otros handlers
 */

import * as fs from 'fs';
import * as path from 'path';
import { IEventHandler, EventContext } from '../handler.interface';
import { SaleCreatedPayload } from '../../../domain/events/sale.events';
import { andreaniApiService } from '../../andreani/andreani.api.service';
import { andreaniConfig } from '../../../config/andreani.config';
import ftpService from '../../ftp.service';
import { IOrdenEnvioResponse } from '../../andreani/andreani.types';
import { prisma } from '../../../index';

const REMOTE_BASE = '/Tekno/Andreani';

/** PDF de etiqueta usado en modo mock (ANDREANI_MOCK=true) */
function getMockEtiquetaPath(): string | null {
    const fromRoot = path.join(process.cwd(), 'backend', 'data', 'etiqueta_1.pdf');
    const fromBackend = path.join(process.cwd(), 'data', 'etiqueta_1.pdf');
    if (fs.existsSync(fromRoot)) return fromRoot;
    if (fs.existsSync(fromBackend)) return fromBackend;
    return null;
}

export class EtiquetasAndreaniHandler implements IEventHandler<SaleCreatedPayload, EventContext> {
    name = 'etiquetas-andreani-handler';
    eventType = 'SALE_CREATED';
    description = 'Descarga etiquetas de Andreani y las sube al FTP';
    priority = 25; // Después de Andreani (20), antes de Excel (30)
    enabled = true;

    private readonly TEMP_BASE = path.join(process.cwd(), 'backend', 'data', 'temp', 'etiquetas');

    async handle(payload: SaleCreatedPayload, context: EventContext): Promise<void> {
        const { id_venta } = payload;

        const andreaniData = context.handlerData['andreani-handler'] as {
            success?: boolean;
            skipped?: boolean;
            reason?: string;
            respuestaCompleta?: IOrdenEnvioResponse;
            numeroEnvio?: string | null;
        } | undefined;

        if (!andreaniData) {
            console.warn(`⚠️ [EtiquetasAndreani] Venta #${id_venta}: no hay datos de Andreani - saltando`);
            context.handlerData[this.name] = {
                skipped: true,
                reason: 'no_andreani_data',
                processedAt: new Date().toISOString(),
            };
            return;
        }

        if (andreaniData.skipped && andreaniData.reason === 'retiro_en_tienda') {
            console.log(`ℹ️ [EtiquetasAndreani] Venta #${id_venta} es retiro en tienda - no hay etiquetas`);
            context.handlerData[this.name] = {
                skipped: true,
                reason: 'retiro_en_tienda',
                processedAt: new Date().toISOString(),
            };
            return;
        }

        if (!andreaniData.success || !andreaniData.respuestaCompleta?.bultos?.length) {
            console.warn(`⚠️ [EtiquetasAndreani] Venta #${id_venta}: pre-envío sin bultos o fallido - saltando`);
            context.handlerData[this.name] = {
                skipped: true,
                reason: andreaniData.success ? 'no_bultos' : 'andreani_failed',
                processedAt: new Date().toISOString(),
            };
            return;
        }

        const respuestaCompleta = andreaniData.respuestaCompleta;
        const codigoSeguimiento = andreaniData.numeroEnvio ?? respuestaCompleta.bultos?.[0]?.numeroDeEnvio ?? `venta-${id_venta}`;

        // Carpeta en FTP por código de venta (cod_interno), no por código de seguimiento Andreani
        let codVenta = payload.venta?.cod_interno?.trim() || null;
        if (!codVenta) {
            const venta = await prisma.venta.findUnique({
                where: { id_venta },
                select: { cod_interno: true },
            });
            codVenta = venta?.cod_interno?.trim() ?? id_venta.toString().padStart(8, '0');
        }

        const rutasSubidas: string[] = [];
        const errores: { bulto: string; error: string }[] = [];
        const isMock = andreaniConfig.useMock;
        const mockPdfPath = isMock ? getMockEtiquetaPath() : null;

        try {
            console.log(`🏷️ [EtiquetasAndreani] Venta #${id_venta}: ${isMock ? 'MOCK: subiendo' : 'descargando y subiendo'} etiquetas (carpeta: ${codVenta}, tracking: ${codigoSeguimiento})...`);

            await ftpService.connect();

            const tempDir = path.join(this.TEMP_BASE, codVenta);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            for (let i = 0; i < respuestaCompleta.bultos.length; i++) {
                const bulto = respuestaCompleta.bultos[i];
                const numeroBulto = bulto.numeroDeBulto || String(i + 1);
                const nombreArchivo = `etiqueta_${numeroBulto}.pdf`;
                const remotePath = `${REMOTE_BASE}/${codVenta}/${nombreArchivo}`;

                if (isMock) {
                    // Modo mock: subir siempre backend/data/etiqueta_1.pdf al FTP
                    if (!mockPdfPath) {
                        console.warn(`⚠️ [EtiquetasAndreani] MOCK: no se encontró backend/data/etiqueta_1.pdf`);
                        errores.push({ bulto: numeroBulto, error: 'Archivo mock no encontrado' });
                        continue;
                    }
                    try {
                        await ftpService.uploadFile(mockPdfPath, remotePath);
                        rutasSubidas.push(remotePath);
                    } catch (uploadErr: any) {
                        console.warn(`⚠️ [EtiquetasAndreani] MOCK Bulto ${numeroBulto}: error al subir FTP: ${uploadErr.message}`);
                        errores.push({ bulto: numeroBulto, error: uploadErr.message });
                    }
                    continue;
                }

                const etiquetaLink = bulto.linking?.find((l) => l.meta === 'Etiqueta');
                const urlEtiqueta = etiquetaLink?.contenido?.trim();

                if (!urlEtiqueta) {
                    console.warn(`⚠️ [EtiquetasAndreani] Bulto ${numeroBulto}: sin link de etiqueta`);
                    errores.push({ bulto: numeroBulto, error: 'Sin link de etiqueta' });
                    continue;
                }

                const endpoint = this.extraerEndpointDesdeUrl(urlEtiqueta);
                if (!endpoint) {
                    console.warn(`⚠️ [EtiquetasAndreani] Bulto ${numeroBulto}: URL inválida`);
                    errores.push({ bulto: numeroBulto, error: 'URL inválida' });
                    continue;
                }

                const result = await andreaniApiService.getBinary(endpoint);
                if (!result.success || !result.data) {
                    const msg = result.error || 'Error al descargar etiqueta';
                    console.warn(`⚠️ [EtiquetasAndreani] Bulto ${numeroBulto}: ${msg}`);
                    errores.push({ bulto: numeroBulto, error: msg });
                    continue;
                }

                const ext = this.extensionDesdeContentType(result.data.contentType);
                const nombreArchivoReal = `etiqueta_${numeroBulto}${ext}`;
                const localPath = path.join(tempDir, nombreArchivoReal);
                const remotePathReal = `${REMOTE_BASE}/${codVenta}/${nombreArchivoReal}`;

                try {
                    fs.writeFileSync(localPath, result.data.buffer);
                } catch (writeErr: any) {
                    console.warn(`⚠️ [EtiquetasAndreani] Bulto ${numeroBulto}: error al guardar temporal: ${writeErr.message}`);
                    errores.push({ bulto: numeroBulto, error: writeErr.message });
                    continue;
                }

                try {
                    await ftpService.uploadFile(localPath, remotePathReal);
                    rutasSubidas.push(remotePathReal);
                } catch (uploadErr: any) {
                    console.warn(`⚠️ [EtiquetasAndreani] Bulto ${numeroBulto}: error al subir FTP: ${uploadErr.message}`);
                    errores.push({ bulto: numeroBulto, error: uploadErr.message });
                } finally {
                    try {
                        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                    } catch {
                        // ignorar fallo al borrar temporal
                    }
                }
            }

            try {
                if (fs.existsSync(tempDir)) {
                    const files = fs.readdirSync(tempDir);
                    if (files.length === 0) fs.rmdirSync(tempDir);
                }
            } catch {
                // ignorar fallo al limpiar carpeta temporal
            }

            const success = rutasSubidas.length > 0;
            context.handlerData[this.name] = {
                success,
                codVenta,
                codigoSeguimiento,
                rutasSubidas,
                totalBultos: respuestaCompleta.bultos.length,
                subidas: rutasSubidas.length,
                errores: errores.length > 0 ? errores : undefined,
                processedAt: new Date().toISOString(),
            };

            if (success) {
                console.log(`✅ [EtiquetasAndreani] Venta #${id_venta}: ${rutasSubidas.length} etiqueta(s) subidas a ${REMOTE_BASE}/${codVenta}/`);
            }
            if (errores.length > 0) {
                console.warn(`⚠️ [EtiquetasAndreani] Venta #${id_venta}: ${errores.length} error(es) en bultos:`, errores.map((e) => e.bulto).join(', '));
            }
        } catch (error: any) {
            context.handlerData[this.name] = {
                success: false,
                codVenta,
                codigoSeguimiento,
                rutasSubidas,
                error: error.message || String(error),
                errorStack: error.stack,
                processedAt: new Date().toISOString(),
            };
            console.error(`❌ [EtiquetasAndreani] Venta #${id_venta}:`, error.message);
            if (process.env.NODE_ENV !== 'production') {
                console.error(`❌ [EtiquetasAndreani] Stack:`, error.stack);
            }
            // No relanzar: otros handlers siguen
        } finally {
            try {
                await ftpService.disconnect();
            } catch {
                // puede no estar conectado (no romper flujo)
            }
        }
    }

    /**
     * Extrae path + query desde la URL completa de Andreani para usar en getBinary.
     */
    private extraerEndpointDesdeUrl(url: string): string | null {
        try {
            const base = andreaniConfig.baseUrl.replace(/\/$/, '');
            if (!url.startsWith(base)) return null;
            const pathAndQuery = url.slice(base.length);
            return pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
        } catch {
            return null;
        }
    }

    /**
     * Devuelve extensión según Content-Type (PDF o imagen).
     */
    private extensionDesdeContentType(contentType: string): string {
        const ct = contentType.toLowerCase();
        if (ct.includes('application/pdf')) return '.pdf';
        if (ct.includes('image/png')) return '.png';
        if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return '.jpg';
        if (ct.includes('image/')) return '.png';
        return '.pdf';
    }
}
