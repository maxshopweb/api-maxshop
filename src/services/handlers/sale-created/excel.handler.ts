/**
 * Handler de Excel para SALE_CREATED
 * 
 * Responsabilidades:
 * - Conectar al FTP y verificar si existe Ventas.xlsx
 * - Si existe: descargarlo, encontrar última fila, agregar nuevas filas
 * - Si NO existe: crear template desde cero
 * - Mapear datos de venta al formato Excel requerido
 * - Subir archivo actualizado al FTP
 * - Guardar resultado en contexto para otros handlers
 */

import { IEventHandler, EventContext } from '../handler.interface';
import { SaleCreatedPayload } from '../../../domain/events/sale.events';
import ftpService from '../../ftp.service';
import { excelTemplateService, VentaExcelRow } from './utils/excel-template.service';
import {
    formatFechaVenta,
    formatFechaAprobacion,
    formatNumeroSinDecimales,
    formatEstado,
    mapMPStatusToSpanish,
    mapMPStatusDetailToSpanish,
    mapPaymentMethodToSpanish,
    mapPaymentTypeToSpanish,
    formatTipoDocumento,
    formatDireccionFacturacion,
    formatDireccionEnvio,
} from './utils/excel-formatters';
import { IVenta } from '../../../types';
import * as path from 'path';
import * as fs from 'fs';
import { prisma } from '../../../index';

export class ExcelHandler implements IEventHandler<SaleCreatedPayload, EventContext> {
    name = 'excel-handler';
    eventType = 'SALE_CREATED';
    description = 'Genera Excel de ventas y lo sube al FTP';
    priority = 30; // Ejecutar después de Andreani
    enabled = true;

    private readonly REMOTE_PATH = '/Tekno/Pedido/Ventas.xlsx';
    private readonly TEMP_DIR = path.join(process.cwd(), 'backend', 'data', 'temp');

    async handle(payload: SaleCreatedPayload, context: EventContext): Promise<void> {
        const { id_venta, venta } = payload;

        try {
            console.log(`📊 [ExcelHandler] Procesando venta #${id_venta} para Excel...`);

            // 1. Obtener venta completa con todas las relaciones necesarias
            const ventaCompleta = await this.getVentaCompleta(id_venta);

            // 2. Mapear venta a filas Excel (pasar también el contexto para acceder a datos de Andreani)
            const ventaRows = this.mapVentaToExcelRows(ventaCompleta, context);

            if (ventaRows.length === 0) {
                console.warn(`⚠️ [ExcelHandler] Venta #${id_venta} sin detalles - saltando`);
                return;
            }

            // 3. Conectar al FTP
            await ftpService.connect();

            try {
                const localPath = path.join(this.TEMP_DIR, 'Ventas.xlsx');

                // 4. Verificar si el archivo existe en FTP
                const fileExists = await ftpService.fileExists(this.REMOTE_PATH);

                let workbook;
                let startRow: number;
                let wasNewFile = false;

                if (fileExists) {
                    // 5a. Descargar y leer Excel existente
                    console.log(`📥 [ExcelHandler] Descargando Excel existente desde FTP...`);
                    await ftpService.downloadExcel(this.REMOTE_PATH, localPath);
                    workbook = excelTemplateService.readExcel(localPath);
                    const lastRow = excelTemplateService.findLastDataRow(workbook);
                    startRow = lastRow + 1;
                    console.log(`📋 [ExcelHandler] Excel existente encontrado. Última fila: ${lastRow}, agregando desde fila: ${startRow}`);
                } else {
                    // 5b. Crear template desde cero
                    console.log(`🆕 [ExcelHandler] Archivo no existe en FTP. Creando template nuevo...`);
                    workbook = excelTemplateService.createTemplate();
                    startRow = 4; // Primera fila de datos después de headers
                    wasNewFile = true;
                }

                // 6. Agregar filas de la venta
                excelTemplateService.appendVentaRows(workbook, ventaRows, startRow);

                // 7. Guardar Excel localmente
                excelTemplateService.saveExcel(workbook, localPath);

                // 8. Subir al FTP
                console.log(`📤 [ExcelHandler] Subiendo Excel actualizado al FTP...`);
                await ftpService.uploadExcel(localPath, this.REMOTE_PATH);

                // 9. Limpiar archivo temporal (opcional, mantener para debugging)
                // fs.unlinkSync(localPath);

                // 10. Guardar resultado en contexto
                context.handlerData[this.name] = {
                    success: true,
                    filePath: this.REMOTE_PATH,
                    rowsAdded: ventaRows.length,
                    startRow,
                    wasNewFile,
                    processedAt: new Date().toISOString(),
                };

                console.log(`✅ [ExcelHandler] Excel generado y subido exitosamente para venta #${id_venta}`);
                console.log(`📊 [ExcelHandler] Filas agregadas: ${ventaRows.length}, Archivo: ${wasNewFile ? 'NUEVO' : 'ACTUALIZADO'}`);

            } finally {
                // 11. Desconectar del FTP
                await ftpService.disconnect();
            }

        } catch (error: any) {
            // Guardar error en el contexto (para otros handlers o logging)
            context.handlerData[this.name] = {
                success: false,
                error: error.message || String(error),
                errorStack: error.stack,
                processedAt: new Date().toISOString(),
            };

            console.error(`❌ [ExcelHandler] Error al procesar Excel para venta #${id_venta}:`, error.message);
            
            // En desarrollo, mostrar stack completo
            if (process.env.NODE_ENV !== 'production') {
                console.error(`❌ [ExcelHandler] Stack trace:`, error.stack);
            }

            // NO lanzar el error - permitir que otros handlers se ejecuten
            // El error ya está registrado en el contexto y se guardará en event_logs
        }
    }

    /**
     * Obtiene la venta completa con todas las relaciones necesarias
     */
    private async getVentaCompleta(idVenta: number): Promise<IVenta> {
        const venta = await prisma.venta.findUnique({
            where: { id_venta: idVenta },
            include: {
                cliente: {
                    include: {
                        usuarios: true, // En Prisma la relación es 'usuarios' (plural)
                    },
                },
                usuarios: true,
                venta_detalle: {
                    include: {
                        productos: true,
                        eventos: true,
                    },
                },
                direcciones: true,
                envios: {
                    take: 1, // Solo el primer envío si hay múltiples
                },
                mercado_pago_payments: {
                    orderBy: {
                        created_at: 'desc', // El más reciente primero
                    },
                    take: 1, // Solo el primer pago
                },
            },
        });

        if (!venta) {
            throw new Error(`Venta #${idVenta} no encontrada`);
        }

        // Mapear venta_detalle → detalles (igual que en ventas.service.ts)
        const formattedVenta: IVenta = {
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
            detalles: (venta as any).venta_detalle ? (venta as any).venta_detalle.map((detalle: any) => ({
                ...detalle,
                precio_unitario: detalle.precio_unitario ? Number(detalle.precio_unitario) : null,
                descuento_aplicado: detalle.descuento_aplicado ? Number(detalle.descuento_aplicado) : null,
                sub_total: detalle.sub_total ? Number(detalle.sub_total) : null,
                tipo_descuento: detalle.tipo_descuento as any,
                producto: detalle.productos ? {
                    ...detalle.productos,
                } : null,
            })) : [],
            envio: (venta as any).envios && (venta as any).envios.length > 0 ? {
                ...(venta as any).envios[0],
                costo_envio: (venta as any).envios[0].costo_envio ? Number((venta as any).envios[0].costo_envio) : null,
                estado_envio: (venta as any).envios[0].estado_envio as any,
            } : null,
            direcciones: (venta.direcciones || []) as any,
            mercado_pago_payments: (venta.mercado_pago_payments || []) as any,
        };

        return formattedVenta;
    }

    /**
     * Mapea una venta a filas Excel (una fila por cada detalle)
     */
    private mapVentaToExcelRows(venta: IVenta, context: EventContext): VentaExcelRow[] {
        const rows: VentaExcelRow[] = [];

        if (!venta.detalles || venta.detalles.length === 0) {
            return rows;
        }

        // Obtener datos de pago (usar el primer pago si hay múltiples)
        const pagoMP = venta.mercado_pago_payments && venta.mercado_pago_payments.length > 0
            ? venta.mercado_pago_payments[0]
            : null;

        // Obtener datos del cliente
        const cliente = venta.cliente;
        // En Prisma la relación es 'usuarios' (plural), pero en TypeScript ICliente usa 'usuario' (singular)
        const usuarioCliente = (cliente as any)?.usuarios || cliente?.usuario;

        // Obtener dirección de envío (usar la primera dirección si hay múltiples)
        const direccionEnvio = venta.direcciones && venta.direcciones.length > 0
            ? venta.direcciones[0]
            : null;

        // Obtener datos de envío de la base de datos
        const envio = venta.envio || null;

        // Obtener datos de Andreani del contexto (si el handler de Andreani ya se ejecutó)
        const andreaniData = context.handlerData['andreani-handler'];
        const codigoEnvioAndreani = andreaniData?.numeroEnvio || null;
        const agrupadorAndreani = andreaniData?.agrupadorDeBultos || null;
        const estadoAndreani = andreaniData?.estado || null;
        
        // Construir texto de transporte con código de Andreani si está disponible
        const construirTransporte = (): string => {
            if (codigoEnvioAndreani) {
                return `Colecta de Mercado Envíos - Código: ${codigoEnvioAndreani}`;
            }
            if (envio?.empresa_envio) {
                return envio.empresa_envio;
            }
            return 'Colecta de Mercado Envíos';
        };

        // Calcular estado (columna AL)
        const calcularEstado = (): string => {
            if (venta.detalles && venta.detalles.length > 1) {
                return '0'; // Si hay múltiples artículos, estado = 0
            }
            // Si es un solo artículo, calcular: total_neto / cantidad_detalles
            const totalNeto = venta.total_neto ? Number(venta.total_neto) : 0;
            return formatEstado(totalNeto);
        };

        // Una fila por cada detalle de la venta
        for (const detalle of venta.detalles) {
            const producto = detalle.producto;

            rows.push({
                AA: venta.id_venta.toString(),
                AB: formatFechaVenta(venta.fecha),
                AF: (detalle.cantidad || 1).toString(),
                AG: formatNumeroSinDecimales(detalle.sub_total || detalle.precio_unitario),
                AL: calcularEstado(),
                AN: producto?.cod_sku || producto?.codi_arti || '',
                AR: formatNumeroSinDecimales(detalle.precio_unitario),
                AS: null, // codigo lista de precios (TODO: buscar en tabla lista_precio)
                AT: null, // Provincia de facturación (TODO: buscar código en tabla provincia)
                AU: usuarioCliente
                    ? `${usuarioCliente.nombre || ''} ${usuarioCliente.apellido || ''}`.trim() || usuarioCliente.nombre || ''
                    : '',
                AV: formatTipoDocumento(
                    null, // tipo_documento no existe en IUsuarios
                    usuarioCliente?.id_usuario || ''
                ),
                AW: formatDireccionFacturacion(
                    cliente?.direccion,
                    cliente?.ciudad,
                    cliente?.cod_postal,
                    cliente?.provincia
                ),
                AX: '05', // Código de condición fiscal (default: 05) - TODO: buscar en tabla situacion_fiscal
                AY: usuarioCliente
                    ? `${usuarioCliente.nombre || ''} ${usuarioCliente.apellido || ''}`.trim() || usuarioCliente.nombre || ''
                    : '',
                AZ: (usuarioCliente?.id_usuario || '').toString(), // dni no existe, usar id_usuario
                BA: formatDireccionEnvio(
                    direccionEnvio?.direccion_formateada,
                    direccionEnvio?.direccion,
                    null, // referencia no existe en IDireccion
                    direccionEnvio?.cod_postal,
                    direccionEnvio?.ciudad,
                    direccionEnvio?.provincia
                ),
                BB: direccionEnvio?.ciudad || cliente?.ciudad || '',
                BC: direccionEnvio?.provincia || cliente?.provincia || '',
                BD: (direccionEnvio?.cod_postal || cliente?.cod_postal || '').toString(),
                BE: direccionEnvio?.pais || 'Argentina',
                BF: construirTransporte(), // Incluye código de envío de Andreani si está disponible
                BG: venta.metodo_pago === 'mercadopago' ? 'Mercado Pago' : '',
                BH: pagoMP?.payment_id || null,
                BI: pagoMP?.status_mp ? mapMPStatusToSpanish(pagoMP.status_mp) : null,
                BJ: pagoMP?.status_detail ? mapMPStatusDetailToSpanish(pagoMP.status_detail) : null,
                BK: pagoMP?.payment_method_id ? mapPaymentMethodToSpanish(pagoMP.payment_method_id) : null,
                BL: pagoMP?.payment_type_id
                    ? mapPaymentTypeToSpanish(pagoMP.payment_type_id, pagoMP.card_info)
                    : null,
                BM: pagoMP?.date_approved ? formatFechaAprobacion(pagoMP.date_approved) : null,
                BN: pagoMP?.total_paid_amount ? formatNumeroSinDecimales(pagoMP.total_paid_amount) : null,
                BO: pagoMP?.net_received_amount
                    ? formatNumeroSinDecimales(pagoMP.net_received_amount)
                    : formatNumeroSinDecimales(venta.total_neto),
                BP: pagoMP?.commission_amount ? formatNumeroSinDecimales(pagoMP.commission_amount) : '0',
                BQ: pagoMP?.installments ? pagoMP.installments.toString() : null,
                BR: pagoMP?.card_info?.last_four_digits || null,
                BS: pagoMP?.card_info?.cardholder?.name || null,
            });
        }

        return rows;
    }
}
