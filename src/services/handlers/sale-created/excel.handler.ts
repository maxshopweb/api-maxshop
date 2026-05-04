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
    mapMPStatusToSpanish,
    mapMPStatusDetailToSpanish,
    mapPaymentMethodToSpanish,
    mapPaymentTypeToSpanish,
    normalizarNombreProvincia,
} from './utils/excel-formatters';
import { IVenta } from '../../../types';
import * as path from 'path';
import * as fs from 'fs';
import { prisma } from '../../../index';
import { ftpPathsConfig } from '../../../config/ftp-paths.config';

/** Columnas obligatorias del diccionario: vacías se rellenan con espacio para lectores externos. */
const REQUIRED_VENTAS_EXCEL_KEYS = [
    'AA', 'AB', 'AD', 'AE', 'AF', 'AG', 'AL', 'AN', 'AR', 'AS', 'AT', 'AU', 'AV', 'AW', 'AX', 'AY', 'AZ',
    'BA', 'BB', 'BC', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR', 'BS',
] as const;

function fillRequiredVentasColumns(row: VentaExcelRow): void {
    for (const k of REQUIRED_VENTAS_EXCEL_KEYS) {
        const v = row[k as keyof VentaExcelRow];
        if (v === null || v === undefined || (typeof v === 'string' && v === '')) {
            (row as Record<string, string | number | null | undefined>)[k] = ' ';
        }
    }
}

export class ExcelHandler implements IEventHandler<SaleCreatedPayload, EventContext> {
    name = 'excel-handler';
    eventType = 'SALE_CREATED';
    description = 'Genera Excel de ventas y lo sube al FTP';
    priority = 30; // Ejecutar después de Andreani
    enabled = true;
    runOnPending = true;

    private readonly REMOTE_PATH = ftpPathsConfig.ventasExcel;
    private readonly TEMP_DIR = path.join(process.cwd(), 'backend', 'data', 'temp');

    async handle(payload: SaleCreatedPayload, context: EventContext): Promise<void> {
        const { id_venta, venta } = payload;

        try {
            console.log(`📊 [ExcelHandler] Procesando venta #${id_venta} para Excel...`);

            // 1. Obtener venta completa con todas las relaciones necesarias
            const ventaCompleta = await this.getVentaCompleta(id_venta);

            // 2. Mapear venta a filas Excel (pasar también el contexto para acceder a datos de Andreani)
            const ventaRows = await this.mapVentaToExcelRows(ventaCompleta, context);

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

                    // Verificar duplicado por código de venta antes de agregar filas
                    const codVentaCheck = ventaCompleta.cod_interno || id_venta.toString().padStart(8, '0');
                    if (excelTemplateService.isVentaInExcel(workbook, codVentaCheck)) {
                        console.log(`ℹ️ [ExcelHandler] Venta #${id_venta} ya existe en Excel - saltando duplicado`);
                        context.handlerData[this.name] = {
                            success: true,
                            skipped: true,
                            reason: 'already_in_excel',
                            processedAt: new Date().toISOString(),
                        };
                        return;
                    }

                    const lastRow = excelTemplateService.findLastDataRow(workbook);
                    // CRÍTICO: Asegurar que startRow sea al menos 4 (nunca escribir antes de la fila 4)
                    startRow = Math.max(lastRow + 1, 4);
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

                // 6b. Resguardo local: copia del Excel descargado del FTP (estado antes del append) antes de guardar
                if (fileExists && fs.existsSync(localPath)) {
                    try {
                        if (!fs.existsSync(this.TEMP_DIR)) {
                            fs.mkdirSync(this.TEMP_DIR, { recursive: true });
                        }
                        const stamped = new Date().toISOString().replace(/[:.]/g, '-');
                        const backupPath = path.join(this.TEMP_DIR, `Ventas_backup_${stamped}.xlsx`);
                        fs.copyFileSync(localPath, backupPath);
                        console.log(`💾 [ExcelHandler] Backup previo guardado: ${backupPath}`);
                    } catch (copyErr) {
                        console.warn(`⚠️ [ExcelHandler] No se pudo guardar backup previo a venta #${id_venta}:`, copyErr);
                    }
                    this.pruneVentasExcelBackups(5);
                }

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
                if (wasNewFile) {
                    console.warn(
                        `⚠️ [ExcelHandler] ATENCIÓN: Se creó un archivo NUEVO en el FTP para venta #${id_venta}. ` +
                            `Si ya había ventas anteriores en el FTP, revisar logs de fileExists y el servidor FTP.`
                    );
                }

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
                        productos: { include: { iva: true } },
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
    private async mapVentaToExcelRows(venta: IVenta, context: EventContext): Promise<VentaExcelRow[]> {
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

        // Obtener datos de Andreani (primero del contexto, luego de la base de datos)
        const andreaniData = context.handlerData['andreani-handler'];
        let codigoEnvioAndreani = andreaniData?.numeroEnvio || null;
        
        // Si no está en el contexto, buscar en la base de datos (envios)
        if (!codigoEnvioAndreani && venta.envio) {
            codigoEnvioAndreani = venta.envio.cod_seguimiento || null;
        } else if (!codigoEnvioAndreani) {
            // Buscar en la tabla envios directamente
            try {
                const envio = await prisma.envios.findFirst({
                    where: {
                        id_venta: venta.id_venta,
                        empresa_envio: {
                            contains: 'andreani',
                            mode: 'insensitive',
                        },
                    },
                    orderBy: {
                        fecha_envio: 'desc',
                    },
                });
                codigoEnvioAndreani = envio?.cod_seguimiento || null;
            } catch (error) {
                console.warn(`⚠️ [ExcelHandler] Error al buscar envío de Andreani en BD:`, error);
            }
        }

        // Obtener código de provincia de facturación (lookup en tabla provincia)
        // Normalización sin acentos: "Cordoba" / "Córdoba" matchean con "CÓRDOBA" en BD
        let codigoProvinciaFacturacion = '';
        const provinciaVenta = direccionEnvio?.provincia || cliente?.provincia || '';
        if (provinciaVenta) {
            try {
                const provinciaInputNorm = normalizarNombreProvincia(provinciaVenta);
                const todasProvincias = await prisma.provincia.findMany({
                    where: { activo: true },
                    select: { codi_provincia: true, nombre: true },
                });
                const provincia = todasProvincias.find(
                    (p) => p.nombre && normalizarNombreProvincia(p.nombre) === provinciaInputNorm
                );
                if (provincia) {
                    codigoProvinciaFacturacion = provincia.codi_provincia || '';
                    console.log(`✅ [ExcelHandler] Provincia encontrada: "${provinciaVenta}" -> código: "${codigoProvinciaFacturacion}"`);
                } else {
                    console.warn(`⚠️ [ExcelHandler] No se encontró código de provincia para: "${provinciaVenta}" (normalizado: "${provinciaInputNorm}")`);
                }
            } catch (error) {
                console.warn(`⚠️ [ExcelHandler] Error al buscar provincia: ${provinciaVenta}`, error);
            }
        } else {
            console.warn(`⚠️ [ExcelHandler] No se encontró provincia en dirección de envío ni en cliente para venta #${venta.id_venta}`);
        }

        // Columna AG (plataforma de pago): MP / TRANS / EFECTIVO
        const codigoPlataformaPagoDisplay = (() => {
            const metodo = (venta.metodo_pago || '').toLowerCase();
            if (metodo.includes('mercado') || metodo === 'mercadopago') return 'MP';
            if (metodo.includes('transferencia') || metodo === 'transferencia') return 'TRANS';
            if (metodo.includes('efectivo') || metodo === 'efectivo') return 'EFECTIVO';
            return '';
        })();

        // Columna AF Excel (BF interno): códigos TABLTRAN — 30 = Andreani, RE = retiro en local
        const esEnvioAndreani = !!(codigoEnvioAndreani || (andreaniData && !(andreaniData as any).skipped));
        const transporteDisplay = esEnvioAndreani ? '30' : 'RE';

        // Sucursales Andreani desde contexto (respuesta del pre-envío)
        const sucursalDistribucionAndreani = andreaniData?.respuestaCompleta?.sucursalDeDistribucion?.descripcion ?? '';
        const sucursalRendicionAndreani = andreaniData?.respuestaCompleta?.sucursalDeRendicion?.descripcion ?? '';

        // Calcular estado (columna L): total final si es un solo producto, 0 si hay más productos (valor numérico)
        const calcularEstado = (detalleActual: any, total: number): number => {
            if (total > 1) return 0;
            const subTotal = detalleActual.sub_total ? Number(detalleActual.sub_total) : 0;
            return subTotal;
        };

        // Formatear nombre de provincia: convertir guiones a espacios y capitalizar cada palabra
        // Ejemplo: "buenos-aires" -> "Buenos Aires"
        const formatearProvincia = (provincia: string | null | undefined): string => {
            if (!provincia) return '';
            // Reemplazar guiones por espacios, trim, y capitalizar cada palabra
            return provincia
                .replace(/-/g, ' ')  // Reemplazar guiones por espacios
                .split(' ')
                .map(palabra => {
                    if (!palabra) return '';
                    // Capitalizar: primera letra mayúscula, resto minúscula
                    return palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
                })
                .join(' ')
                .trim();
        };

        // Formatear dirección de facturación completa
        // Formato esperado: "los tamariscos 2119, Bahía Blanca - C.P.: 8000, Buenos Aires"
        const formatearDireccionFacturacion = (): string => {
            const parts: string[] = [];
            if (cliente?.direccion) {
                let direccionCompleta = cliente.direccion;
                if (cliente.altura) direccionCompleta += ` ${cliente.altura}`;
                parts.push(direccionCompleta);
            }
            if (cliente?.ciudad) {
                parts.push(cliente.ciudad);
            }
            if (cliente?.cod_postal) {
                parts.push(`C.P.: ${cliente.cod_postal}`);
            }
            if (cliente?.provincia) {
                parts.push(formatearProvincia(cliente.provincia));
            }
            // Formato: "direccion, ciudad - C.P.: cod_postal, provincia"
            if (parts.length === 0) return '';
            if (parts.length === 1) return parts[0];
            // Formato: "direccion, ciudad - C.P.: cod_postal, provincia"
            const direccionYCiudad = parts.slice(0, 2).join(', ');
            const codPostalYProvincia = parts.slice(2).join(', ');
            return codPostalYProvincia ? `${direccionYCiudad} - ${codPostalYProvincia}` : direccionYCiudad;
        };

        // Formatear dirección de envío completa
        // Formato esperado: "los tamariscos 2119, Bahía Blanca - C.P.: 8000, Buenos Aires"
        const formatearDireccionEnvio = (): string => {
            // Si hay dirección formateada (de OpenCage), formatearla también para corregir la provincia
            if (direccionEnvio?.direccion_formateada) {
                // Extraer y formatear la provincia de la dirección formateada
                const dirFormateada = direccionEnvio.direccion_formateada;
                // Buscar la última parte después de la última coma (que debería ser la provincia)
                const partes = dirFormateada.split(',');
                if (partes.length > 0) {
                    const ultimaParte = partes[partes.length - 1].trim();
                    // Si la última parte parece ser una provincia (contiene guiones o está en minúsculas)
                    if (ultimaParte.includes('-') || ultimaParte === ultimaParte.toLowerCase()) {
                        const provinciaFormateada = formatearProvincia(ultimaParte);
                        // Reemplazar la última parte con la provincia formateada
                        partes[partes.length - 1] = provinciaFormateada;
                        return partes.join(',');
                    }
                }
                return dirFormateada;
            }
            
            // Construir dirección desde direccionEnvio, con fallback a cliente si no hay datos
            const parts: string[] = [];
            
            // Dirección: usar direccionEnvio primero, luego cliente como fallback
            const direccion = direccionEnvio?.direccion || cliente?.direccion;
            const altura = direccionEnvio?.altura || cliente?.altura;
            if (direccion) {
                let direccionCompleta = direccion;
                if (altura) direccionCompleta += ` ${altura}`;
                parts.push(direccionCompleta);
            }
            
            // Ciudad: usar direccionEnvio primero, luego cliente como fallback
            const ciudad = direccionEnvio?.ciudad || cliente?.ciudad;
            if (ciudad) {
                parts.push(ciudad);
            }
            
            // Código postal: usar direccionEnvio primero, luego cliente como fallback
            const codPostal = direccionEnvio?.cod_postal || cliente?.cod_postal;
            if (codPostal) {
                parts.push(`C.P.: ${codPostal}`);
            }
            
            // Provincia: usar direccionEnvio primero, luego cliente como fallback
            const provincia = direccionEnvio?.provincia || cliente?.provincia;
            if (provincia) {
                parts.push(formatearProvincia(provincia));
            }
            
            // Formato: "direccion, ciudad - C.P.: cod_postal, provincia"
            if (parts.length === 0) {
                console.warn(`⚠️ [ExcelHandler] No se encontró dirección de envío para venta #${venta.id_venta}`);
                return '';
            }
            if (parts.length === 1) return parts[0];
            const direccionYCiudad = parts.slice(0, 2).join(', ');
            const codPostalYProvincia = parts.slice(2).join(', ');
            return codPostalYProvincia ? `${direccionYCiudad} - ${codPostalYProvincia}` : direccionYCiudad;
        };

        // Obtener nombre completo del cliente
        const nombreCompletoCliente = usuarioCliente
            ? `${usuarioCliente.nombre || ''} ${usuarioCliente.apellido || ''}`.trim() || usuarioCliente.nombre || ''
            : '';

        // Obtener tipo y número de documento
        const tipoYNumeroDoc = (() => {
            if (usuarioCliente?.tipo_documento && usuarioCliente?.numero_documento) {
                return `${usuarioCliente.tipo_documento} ${usuarioCliente.numero_documento}`;
            }
            if (usuarioCliente?.numero_documento) {
                // Si solo hay número, intentar inferir el tipo
                const numDoc = usuarioCliente.numero_documento;
                if (numDoc.length <= 8) {
                    return `DNI ${numDoc}`;
                } else if (numDoc.length === 11) {
                    return `CUIT ${numDoc}`;
                }
                return numDoc;
            }
            // Fallback: usar id_usuario si no hay documento
            if (usuarioCliente?.id_usuario) {
                return `DNI ${usuarioCliente.id_usuario}`;
            }
            return '';
        })();

        // Calcular comisiones (valor numérico para Excel)
        const calcularComisiones = (): number => {
            if (pagoMP?.commission_amount != null) return Number(pagoMP.commission_amount);
            const totalConIva = venta.total_con_iva ? Number(venta.total_con_iva) : 0;
            const totalNeto = venta.total_neto ? Number(venta.total_neto) : 0;
            return totalConIva - totalNeto;
        };

        const domicilioEnvioParaExcel = (): string =>
            (direccionEnvio ? formatearDireccionEnvio() : formatearDireccionFacturacion());

        // Helpers para filas (venta cabecera / producto detalle)
        const buildVentaBaseRow = (): VentaExcelRow =>
            ({
                AA: venta.cod_interno || venta.id_venta.toString().padStart(8, '0'), // COLUMNA A: # de venta (usar cod_interno, fallback a id_venta formateado)
                AB: formatFechaVenta(venta.actualizado_en || venta.fecha), // Usar actualizado_en según mapeo
                AD: usuarioCliente?.email || (cliente as any)?.email || null, // COLUMNA D: email
                AE: usuarioCliente?.telefono || (cliente as any)?.telefono || null, // COLUMNA E: teléfono
                AT: codigoProvinciaFacturacion, // COLUMNA T: código de provincia de la venta (lookup en tabla provincia)
                AU: nombreCompletoCliente, // Nombre y apellido del cliente
                AV: tipoYNumeroDoc, // COLUMNA V: Tipo y número de documento (usar numero_documento)
                AW: formatearDireccionFacturacion(), // COLUMNA W: Dirección de facturación formateada
                AX: 'CF', // COLUMNA X: Condición fiscal fija "CF"
                AY: nombreCompletoCliente, // Nombre cliente (repeat)
                AZ: tipoYNumeroDoc, // COLUMNA Z: mismo formato que V — "DNI 42234462"
                BA: domicilioEnvioParaExcel(), // COLUMNA AA: envío; si no hay dirección de envío, facturación
                BB: direccionEnvio?.ciudad || cliente?.ciudad || '', // Ciudad envío
                BC: codigoProvinciaFacturacion, // COLUMNA AC (BC): mismo codi_provincia que columna T
                BD: (direccionEnvio?.cod_postal || cliente?.cod_postal || '').toString(), // Código postal envío
                BE: direccionEnvio?.pais || 'ARGENTINA', // País
                BF: transporteDisplay, // COLUMNA AF: 30 = Andreani, RE = retiro (TABLTRAN)
                BG: codigoPlataformaPagoDisplay, // COLUMNA AG: MP | TRANS | EFECTIVO
                BH: pagoMP?.payment_id || (venta as any).referencia_pago_manual || null, // Referencia pago: MP o manual (admin)
                BI: pagoMP?.status_mp ? mapMPStatusToSpanish(pagoMP.status_mp) : null, // Estado del pago
                BJ: pagoMP?.status_detail ? mapMPStatusDetailToSpanish(pagoMP.status_detail) : null, // Detalle del pago
                BK: pagoMP?.payment_method_id ? mapPaymentMethodToSpanish(pagoMP.payment_method_id) : null, // Forma de pago
                BL: pagoMP?.payment_type_id
                    ? mapPaymentTypeToSpanish(pagoMP.payment_type_id, pagoMP.card_info)
                    : null, // Tipo de pago
                BM: pagoMP?.date_approved ? formatFechaVenta(pagoMP.date_approved) : null, // Fecha aprobación (mismo formato que columna B)
                BN: venta.total_con_iva != null ? Number(venta.total_con_iva) : 0,
                BO: venta.total_neto != null ? Number(venta.total_neto) : null, // Sin duplicar total_con_iva si falta neto
                BP: calcularComisiones(),
                BQ: pagoMP?.installments ? pagoMP.installments.toString() : null, // Cantidad cuotas
                BR: pagoMP?.card_info?.last_four_digits || null, // Número tarjeta (últimos 4 dígitos)
                BS: pagoMP?.card_info?.cardholder?.name ?? null, // Solo dato real de MP (sin fallback)
                BT: codigoEnvioAndreani ?? null, // COLUMNA AT Excel: código de envío Andreani
                BU: sucursalDistribucionAndreani || null, // COLUMNA AU Excel: sucursal de distribución Andreani
                BV: sucursalRendicionAndreani || null, // COLUMNA AV Excel: sucursal de rendición Andreani
                // Liquidación y cuotas MP (solo por venta: legacy o cabecera; nunca en filas de producto)
                BW: pagoMP?.net_received_amount != null ? Number(pagoMP.net_received_amount) : null, // Monto liquidado
                BX: pagoMP?.money_release_date ? formatFechaVenta(pagoMP.money_release_date) : null,   // Fecha liquidación
                BY: pagoMP?.installment_amount != null ? Number(pagoMP.installment_amount) : null,   // Monto por cuota
            }) as VentaExcelRow;

        // Helpers para columnas O, P, Q: sub_total y precio_unitario son montos finales con IVA incluido.
        const montoFinalLinea = (d: any): number => (d.sub_total != null ? Number(d.sub_total) : 0);
        const netoLineaDesdeFinal = (d: any, prod: any): number => {
            const bruto = montoFinalLinea(d);
            const pct = prod?.iva?.porcentaje != null ? Number(prod.iva.porcentaje) : 0;
            const factor = 1 + pct / 100;
            if (factor <= 0 || !Number.isFinite(bruto)) return 0;
            return Math.round((bruto / factor) * 100) / 100;
        };
        const ivaLinea = (d: any, prod: any): number => {
            const bruto = montoFinalLinea(d);
            const neto = netoLineaDesdeFinal(d, prod);
            return Math.round((bruto - neto) * 100) / 100;
        };
        const porcentajeDescuentoLinea = (d: any): number => {
            const base = (d.precio_unitario != null ? Number(d.precio_unitario) : 0) * (d.cantidad != null ? Number(d.cantidad) : 0);
            if (base <= 0) return 0;
            const desc = d.descuento_aplicado != null ? Number(d.descuento_aplicado) : 0;
            return Math.round((desc / base) * 100 * 100) / 100;
        };

        /** Importe de descuento en dinero (col H / clave AH), negativo; 0 si no hay descuento. */
        const importeDescuentoLinea = (d: any): number => {
            if (d.descuento_aplicado == null) return 0;
            const n = Number(d.descuento_aplicado);
            if (!Number.isFinite(n) || n === 0) return 0;
            return -Math.abs(n);
        };

        const buildProductoRow = (detalle: any): VentaExcelRow => {
            const producto = detalle.producto;
            return ({
                AA: venta.cod_interno || venta.id_venta.toString().padStart(8, '0'), // A
                AB: formatFechaVenta(venta.actualizado_en || venta.fecha), // B
                AF: detalle.cantidad != null ? Number(detalle.cantidad) : 1, // F (cantidad, número)
                AH: importeDescuentoLinea(detalle), // H: importe descuento (negativo)
                AN: producto?.codi_arti || '', // N: solo SKU (codi_arti)
                AO: netoLineaDesdeFinal(detalle, producto), // O: neto del artículo (sin IVA)
                AP: ivaLinea(detalle, producto), // P: IVA del artículo (monto)
                AQ: porcentajeDescuentoLinea(detalle), // Q: % descuento sobre monto original
                AR: detalle.precio_unitario != null ? Number(detalle.precio_unitario) : 0, // R (número)
                AS: producto?.lista_precio_activa ?? 'V', // S: lista de precio por línea (V|O|P|Q|E)
                // No escribir AT en filas de producto: AT = col T = provincia (evitar colisión con bonificación)
            }) as VentaExcelRow;
        };

        // Una fila por cada detalle de la venta (comportamiento legacy)
        const totalDetalles = venta.detalles.length;
        for (let i = 0; i < totalDetalles; i++) {
            const detalle = venta.detalles[i];
            const producto = detalle.producto;

            const legacyRow: VentaExcelRow = {
                ...buildVentaBaseRow(),
                AF: detalle.cantidad != null ? Number(detalle.cantidad) : 1,
                AG: detalle.sub_total != null ? Number(detalle.sub_total) : 0,
                AH: importeDescuentoLinea(detalle), // H: importe descuento (negativo); Q sigue siendo %
                AL: calcularEstado(detalle, totalDetalles),
                AN: producto?.codi_arti || '', // N: solo SKU (codi_arti)
                AO: netoLineaDesdeFinal(detalle, producto), // O: neto del artículo (sin IVA)
                AP: ivaLinea(detalle, producto), // P: IVA del artículo (monto)
                AQ: porcentajeDescuentoLinea(detalle), // Q: % descuento sobre monto original
                AR: detalle.precio_unitario != null ? Number(detalle.precio_unitario) : 0,
                AS: producto?.lista_precio_activa ?? 'V', // S: lista de precio por línea (V|O|P|Q|E)
                // AT = provincia desde buildVentaBaseRow; no sobrescribir con bonificación
            };

            rows.push(legacyRow);
        }

        // NUEVO: Para ventas con MÁS de 2 productos distintos, generar:
        // 1) fila cabecera de venta (datos de venta)
        // 2) filas por producto (datos mínimos de producto)
        const productosDistintos = new Set(
            venta.detalles
                .map((d: any) => d.id_prod)
                .filter((id: any) => id !== null && id !== undefined)
        );
        const cantidadProductosDistintos = productosDistintos.size;

        if (cantidadProductosDistintos >= 2) {
            // Reemplazar filas legacy por el nuevo formato compacto
            rows.length = 0;

            const totalConIvaNum = venta.total_con_iva ? Number(venta.total_con_iva) : 0;
            const totalNetoNum = venta.total_neto ? Number(venta.total_neto) : 0;
            const diferencia = totalConIvaNum - totalNetoNum;

            const cabeceraVenta: VentaExcelRow = {
                ...buildVentaBaseRow(),
                AC: `Paquete de ${cantidadProductosDistintos} productos`, // C
                AG: totalConIvaNum, // G (número)
                AH: -Math.abs(diferencia), // H (número): descuento global a nivel pedido
                AJ: -(Math.abs(diferencia) * 0.8378), // J (número)
                AL: totalNetoNum, // L (número)
            };

            rows.push(cabeceraVenta);

            for (const detalle of venta.detalles) {
                rows.push(buildProductoRow(detalle));
            }
        }

        for (const row of rows) {
            fillRequiredVentasColumns(row);
        }

        return rows;
    }

    /** Mantiene solo los `maxKeep` backups más recientes (nombre con timestamp ISO ordenable). */
    private pruneVentasExcelBackups(maxKeep: number): void {
        try {
            if (!fs.existsSync(this.TEMP_DIR)) return;
            const names = fs
                .readdirSync(this.TEMP_DIR)
                .filter((f) => f.startsWith('Ventas_backup_') && f.endsWith('.xlsx'))
                .sort()
                .reverse();
            for (const name of names.slice(maxKeep)) {
                try {
                    fs.unlinkSync(path.join(this.TEMP_DIR, name));
                } catch (unlinkErr) {
                    console.warn(`⚠️ [ExcelHandler] No se pudo eliminar backup viejo ${name}:`, unlinkErr);
                }
            }
        } catch (e) {
            console.warn(`⚠️ [ExcelHandler] pruneVentasExcelBackups:`, e);
        }
    }
}
