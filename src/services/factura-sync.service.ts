/**
 * Servicio de sincronización de facturas
 * 
 * Responsabilidades:
 * - Obtener ventas pendientes de factura desde la BD
 * - Conectar al FTP y listar facturas en Tekno/Facturas
 * - Buscar facturas por cod_interno (formato: F4-0004-{cod_interno}.pdf)
 * - Descargar facturas encontradas
 * - Enviar emails (factura + tracking)
 * - Borrar facturas del FTP
 * - Actualizar estado de venta a "facturado"
 * - Borrar registro de ventas_pendientes_factura
 */

import { prisma } from '../index';
import ftpService from './ftp.service';
import mailService from '../mail/mail.service';
import { IVenta, IVentaPendienteFactura } from '../types';
import * as path from 'path';
import * as fs from 'fs';
import { FileInfo } from 'basic-ftp';

export interface SyncFacturasResult {
    procesadas: number;
    noEncontradas: number;
    errores: number;
    detalles: Array<{
        ventaId: number;
        estado: 'procesada' | 'no_encontrada' | 'error';
        mensaje?: string;
    }>;
}

export class FacturaSyncService {
    private readonly FTP_FACTURAS_PATH = '/Tekno/Facturas';
    // Construir ruta relativa a process.cwd() (raíz del proyecto backend)
    // Si estamos en src/, subimos un nivel, si estamos en dist/, subimos un nivel también
    private readonly TEMP_DIR = (() => {
        const cwd = process.cwd();
        // Si process.cwd() ya está en backend/, usar directamente
        if (cwd.endsWith('backend')) {
            return path.join(cwd, 'data', 'temp', 'facturas');
        }
        // Si estamos en la raíz del proyecto, agregar backend/
        return path.join(cwd, 'backend', 'data', 'temp', 'facturas');
    })();
    private readonly MAX_INTENTOS = 100;

    /**
     * Método principal: sincroniza todas las facturas pendientes
     */
    async syncFacturasPendientes(): Promise<SyncFacturasResult> {
        const resultado: SyncFacturasResult = {
            procesadas: 0,
            noEncontradas: 0,
            errores: 0,
            detalles: [],
        };

        try {
            console.log('🔄 [FacturaSync] Iniciando sincronización de facturas...');

            // 1. Obtener ventas pendientes
            const ventasPendientes = await this.getVentasPendientes();
            console.log(`📋 [FacturaSync] Encontradas ${ventasPendientes.length} venta(s) pendiente(s)`);

            if (ventasPendientes.length === 0) {
                console.log('ℹ️ [FacturaSync] No hay ventas pendientes de factura');
                return resultado;
            }

            // 2. Conectar al FTP
            await ftpService.connect();

            try {
                // 3. Listar facturas en FTP
                const facturasFTP = await this.listarFacturasEnFTP();
                console.log(`📁 [FacturaSync] Encontradas ${facturasFTP.length} factura(s) en FTP`);

                // 4. Procesar cada venta pendiente
                for (const ventaPendiente of ventasPendientes) {
                    try {
                        const ventaId = ventaPendiente.venta_id;
                        const codInterno = ventaPendiente.venta?.cod_interno ?? null;

                        // Buscar factura que coincida con cod_interno (formato F4-0004-{cod_interno})
                        const facturaEncontrada = this.buscarFacturaPorVenta(ventaId, codInterno, facturasFTP);

                        if (facturaEncontrada) {
                            // Procesar factura encontrada
                            await this.procesarFacturaEncontrada(ventaPendiente, facturaEncontrada);
                            resultado.procesadas++;
                            resultado.detalles.push({
                                ventaId,
                                estado: 'procesada',
                                mensaje: `Factura encontrada: ${facturaEncontrada.name}`,
                            });
                        } else {
                            // No encontrada, actualizar intentos
                            await this.actualizarIntento(ventaId, false);
                            resultado.noEncontradas++;
                            resultado.detalles.push({
                                ventaId,
                                estado: 'no_encontrada',
                                mensaje: 'Factura no encontrada en FTP',
                            });
                        }
                    } catch (error: any) {
                        console.error(`❌ [FacturaSync] Error procesando venta #${ventaPendiente.venta_id}:`, error.message);
                        resultado.errores++;
                        resultado.detalles.push({
                            ventaId: ventaPendiente.venta_id,
                            estado: 'error',
                            mensaje: error.message || String(error),
                        });
                    }
                }
            } finally {
                // 5. Desconectar del FTP
                await ftpService.disconnect();
            }

            console.log(`✅ [FacturaSync] Sincronización completada: ${resultado.procesadas} procesada(s), ${resultado.noEncontradas} no encontrada(s), ${resultado.errores} error(es)`);
            return resultado;

        } catch (error: any) {
            console.error('❌ [FacturaSync] Error en sincronización:', error);
            throw error;
        }
    }

    /**
     * Obtiene todas las ventas pendientes de factura
     * Incluye registros con estado 'pendiente' y 'error' (para reintentar)
     */
    private async getVentasPendientes(): Promise<IVentaPendienteFactura[]> {
        const registros = await prisma.ventas_pendientes_factura.findMany({
            where: {
                estado: {
                    in: ['pendiente', 'error'], // Incluir errores para reintentar
                },
            },
            include: {
                venta: {
                    include: {
                        cliente: {
                            include: {
                                usuarios: true,
                            },
                        },
                        usuarios: true,
                        direcciones: true,
                        envios: {
                            take: 1,
                            orderBy: {
                                fecha_envio: 'desc',
                            },
                        },
                    },
                },
            },
            orderBy: {
                fecha_creacion: 'asc',
            },
        });

        // Mapear a formato IVentaPendienteFactura
        return registros.map((r: any) => ({
            id: r.id,
            venta_id: r.venta_id,
            fecha_creacion: r.fecha_creacion,
            fecha_ultimo_intento: r.fecha_ultimo_intento,
            intentos: r.intentos,
            estado: r.estado as any,
            error_mensaje: r.error_mensaje,
            factura_encontrada: r.factura_encontrada,
            factura_nombre_archivo: r.factura_nombre_archivo,
            procesado_en: r.procesado_en,
            venta: r.venta as any,
        }));
    }

    /**
     * Lista facturas en el FTP
     */
    private async listarFacturasEnFTP(): Promise<FileInfo[]> {
        try {
            const archivos = await ftpService.listFiles(this.FTP_FACTURAS_PATH);
            // Filtrar solo PDFs
            return archivos.filter((archivo) => {
                const nombre = archivo.name.toLowerCase();
                return nombre.endsWith('.pdf');
            });
        } catch (error: any) {
            console.error(`❌ [FacturaSync] Error al listar facturas en FTP:`, error);
            throw error;
        }
    }

    /**
     * Busca una factura que coincida con cod_interno de la venta.
     * Formato esperado en FTP (Tekno/Facturas): F4-0004-{cod_interno}.pdf
     * Si cod_interno es null, usa id_venta formateado a 8 dígitos como fallback.
     */
    private buscarFacturaPorVenta(
        idVenta: number,
        codInterno: string | null,
        archivosFTP: FileInfo[]
    ): FileInfo | null {
        const codigo = codInterno ?? idVenta.toString().padStart(8, '0');
        const nombreEsperado = `F4-0004-${codigo}`;

        return archivosFTP.find((archivo) => {
            const nombreSinExt = archivo.name.replace(/\.pdf$/i, '');
            return nombreSinExt === nombreEsperado;
        }) || null;
    }

    /**
     * Procesa una factura encontrada: descarga, envía emails, borra del FTP, actualiza BD
     */
    private async procesarFacturaEncontrada(
        ventaPendiente: IVentaPendienteFactura,
        archivoFactura: FileInfo
    ): Promise<void> {
        const ventaId = ventaPendiente.venta_id;
        const remotePath = `${this.FTP_FACTURAS_PATH}/${archivoFactura.name}`;
        let localPath: string | null = null;

        try {
            console.log(`📦 [FacturaSync] Procesando factura para venta #${ventaId}: ${archivoFactura.name}`);

            // 1. Actualizar registro: estado="procesando", factura_encontrada=true
            await prisma.ventas_pendientes_factura.update({
                where: { venta_id: ventaId },
                data: {
                    estado: 'procesando',
                    factura_encontrada: true,
                    factura_nombre_archivo: archivoFactura.name,
                    fecha_ultimo_intento: new Date(),
                },
            });

            // 2. Asegurar que el directorio temporal existe
            if (!fs.existsSync(this.TEMP_DIR)) {
                fs.mkdirSync(this.TEMP_DIR, { recursive: true });
            }

            // 3. Descargar factura a carpeta temporal
            localPath = path.join(this.TEMP_DIR, `factura_${ventaId}_${Date.now()}.pdf`);
            // Asegurar que el directorio existe
            if (!fs.existsSync(this.TEMP_DIR)) {
                fs.mkdirSync(this.TEMP_DIR, { recursive: true });
            }
            // Usar downloadExcel que acepta remotePath y localPath
            await ftpService.downloadExcel(remotePath, localPath);
            console.log(`✅ [FacturaSync] Factura descargada: ${localPath}`);

            // 4. Obtener datos completos de la venta
            const venta = await this.getVentaCompleta(ventaId);
            if (!venta) {
                throw new Error(`Venta #${ventaId} no encontrada`);
            }

            // 5. Obtener email del cliente
            const clienteEmail = venta.cliente?.usuario?.email || venta.usuario?.email;
            if (!clienteEmail) {
                throw new Error(`No se encontró email para venta #${ventaId}`);
            }

            const clienteNombre = venta.cliente?.usuario?.nombre || venta.usuario?.nombre || 'Cliente';
            const clienteApellido = venta.cliente?.usuario?.apellido || venta.usuario?.apellido || '';

            // 6. Enviar email con factura adjunta
            await this.enviarEmailConFactura(venta, localPath, clienteEmail, clienteNombre, clienteApellido);
            console.log(`📧 [FacturaSync] Email con factura enviado a ${clienteEmail}`);

            // 7. Enviar email con código de seguimiento de Andreani
            await this.enviarEmailConTracking(venta, clienteEmail, clienteNombre, clienteApellido);
            console.log(`📧 [FacturaSync] Email con tracking enviado a ${clienteEmail}`);

            // 8. Borrar factura del FTP
            await ftpService.deleteFile(remotePath);
            console.log(`🗑️ [FacturaSync] Factura borrada del FTP: ${remotePath}`);

            // 9. Actualizar estado de venta a "facturado"
            await prisma.venta.update({
                where: { id_venta: ventaId },
                data: { estado_pago: 'facturado' },
            });
            console.log(`✅ [FacturaSync] Venta #${ventaId} actualizada a estado "facturado"`);

            // 10. Marcar registro como completado
            await prisma.ventas_pendientes_factura.update({
                where: { venta_id: ventaId },
                data: {
                    estado: 'completado',
                    procesado_en: new Date(),
                },
            });

            // 11. Borrar registro de ventas_pendientes_factura (o mantenerlo para auditoría)
            // Por ahora lo mantenemos para auditoría, pero podrías borrarlo:
            // await prisma.ventas_pendientes_factura.delete({ where: { venta_id: ventaId } });

            // 12. Limpiar archivo temporal
            if (localPath && fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
            }

            console.log(`✅ [FacturaSync] Procesamiento completado para venta #${ventaId}`);

        } catch (error: any) {
            console.error(`❌ [FacturaSync] Error procesando factura para venta #${ventaId}:`, error);

            // Limpiar archivo temporal si existe
            if (localPath && fs.existsSync(localPath)) {
                try {
                    fs.unlinkSync(localPath);
                } catch (cleanupError) {
                    console.warn(`⚠️ [FacturaSync] Error al limpiar archivo temporal:`, cleanupError);
                }
            }

            // Actualizar registro con error
            await prisma.ventas_pendientes_factura.update({
                where: { venta_id: ventaId },
                data: {
                    estado: 'error',
                    error_mensaje: error.message || String(error),
                    fecha_ultimo_intento: new Date(),
                },
            });

            throw error;
        }
    }

    /**
     * Obtiene la venta completa con todas las relaciones
     */
    private async getVentaCompleta(idVenta: number): Promise<IVenta | null> {
        const venta = await prisma.venta.findUnique({
            where: { id_venta: idVenta },
            include: {
                cliente: {
                    include: {
                        usuarios: true,
                    },
                },
                usuarios: true,
                direcciones: true,
                envios: {
                    take: 1,
                    orderBy: {
                        fecha_envio: 'desc',
                    },
                },
            },
        });

        if (!venta) {
            return null;
        }

        // Mapear a formato IVenta
        return {
            ...venta,
            total_sin_iva: venta.total_sin_iva ? Number(venta.total_sin_iva) : null,
            total_con_iva: venta.total_con_iva ? Number(venta.total_con_iva) : null,
            descuento_total: venta.descuento_total ? Number(venta.descuento_total) : null,
            total_neto: venta.total_neto ? Number(venta.total_neto) : null,
            metodo_pago: venta.metodo_pago as any,
            estado_pago: venta.estado_pago as any,
            estado_envio: venta.estado_envio as any,
            tipo_venta: venta.tipo_venta as any,
            usuario: venta.usuarios ? {
                ...venta.usuarios,
                estado: venta.usuarios.estado as any,
            } : null,
            cliente: venta.cliente ? {
                ...venta.cliente,
                usuario: venta.cliente.usuarios ? {
                    ...venta.cliente.usuarios,
                    estado: venta.cliente.usuarios.estado as any,
                } : undefined,
            } : null,
            detalles: [],
            envio: (venta as any).envios && (venta as any).envios.length > 0 ? {
                ...(venta as any).envios[0],
                costo_envio: (venta as any).envios[0].costo_envio ? Number((venta as any).envios[0].costo_envio) : null,
                estado_envio: (venta as any).envios[0].estado_envio as any,
            } : null,
            direcciones: (venta.direcciones || []) as any,
            mercado_pago_payments: [],
        };
    }

    /**
     * Envía email con factura adjunta
     */
    private async enviarEmailConFactura(
        venta: IVenta,
        facturaPath: string,
        clienteEmail: string,
        clienteNombre: string,
        clienteApellido: string
    ): Promise<void> {
        const nombreCompleto = `${clienteNombre} ${clienteApellido}`.trim() || 'Cliente';
        const totalFormatted = venta.total_neto
            ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(venta.total_neto)
            : '$0';

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; background-color: #f9f9f9; }
                    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Tu factura está lista</h1>
                    </div>
                    <div class="content">
                        <p>Hola ${nombreCompleto},</p>
                        <p>Te enviamos la factura de tu pedido <strong>#${venta.id_venta}</strong>.</p>
                        <p><strong>Total:</strong> ${totalFormatted}</p>
                        <p>La factura se encuentra adjunta en este email.</p>
                        <p>Gracias por tu compra.</p>
                    </div>
                    <div class="footer">
                        <p>Este es un email automático, por favor no responder.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        await mailService.sendEmailWithAttachment(
            clienteEmail,
            `Tu factura está lista - Pedido #${venta.id_venta}`,
            html,
            facturaPath,
            `Factura_${venta.id_venta}.pdf`,
            {
                name: nombreCompleto,
                tags: ['factura', 'pedido'],
            }
        );
    }

    /**
     * Envía email con código de seguimiento de Andreani
     */
    private async enviarEmailConTracking(
        venta: IVenta,
        clienteEmail: string,
        clienteNombre: string,
        clienteApellido: string
    ): Promise<void> {
        const nombreCompleto = `${clienteNombre} ${clienteApellido}`.trim() || 'Cliente';
        const codigoTracking = venta.envio?.cod_seguimiento || 'No disponible aún';

        await mailService.sendShippingSent({
            orderId: venta.id_venta,
            trackingCode: codigoTracking,
            carrier: 'Andreani',
            cliente: {
                email: clienteEmail,
                nombre: nombreCompleto,
            },
        });
    }

    /**
     * Actualiza intentos cuando no se encuentra la factura
     */
    private async actualizarIntento(ventaId: number, encontrado: boolean): Promise<void> {
        if (encontrado) {
            return; // Ya se procesó
        }

        const registro = await prisma.ventas_pendientes_factura.findUnique({
            where: { venta_id: ventaId },
        });

        if (!registro) {
            return;
        }

        const nuevosIntentos = registro.intentos + 1;

        if (nuevosIntentos >= this.MAX_INTENTOS) {
            // Marcar como error después de muchos intentos
            await prisma.ventas_pendientes_factura.update({
                where: { venta_id: ventaId },
                data: {
                    estado: 'error',
                    error_mensaje: `Factura no encontrada después de ${this.MAX_INTENTOS} intentos`,
                    intentos: nuevosIntentos,
                    fecha_ultimo_intento: new Date(),
                },
            });
        } else {
            // Incrementar intentos
            await prisma.ventas_pendientes_factura.update({
                where: { venta_id: ventaId },
                data: {
                    intentos: nuevosIntentos,
                    fecha_ultimo_intento: new Date(),
                },
            });
        }
    }
}

// Instancia singleton
export const facturaSyncService = new FacturaSyncService();
export default facturaSyncService;
