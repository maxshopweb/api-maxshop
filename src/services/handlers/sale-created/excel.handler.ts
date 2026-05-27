/**
 * Handler de Excel para SALE_CREATED
 *
 * Responsabilidades:
 * - Conectar al FTP y verificar si existe Ventas.xlsx
 * - Si existe: descargarlo, encontrar última fila, agregar nuevas filas
 * - Si NO existe: crear template desde cero
 * - Mapear datos de venta al formato Excel requerido (vía VentasExcelExportService)
 * - Subir archivo actualizado al FTP
 * - Guardar resultado en contexto para otros handlers
 */

import { IEventHandler, EventContext } from '../handler.interface';
import { SaleCreatedPayload } from '../../../domain/events/sale.events';
import ftpService from '../../ftp.service';
import { excelTemplateService } from './utils/excel-template.service';
import { ventasExcelExportService } from '../../ventas-excel-export.service';
import * as path from 'path';
import * as fs from 'fs';
import { ftpPathsConfig } from '../../../config/ftp-paths.config';

export class ExcelHandler implements IEventHandler<SaleCreatedPayload, EventContext> {
    name = 'excel-handler';
    eventType = 'SALE_CREATED';
    description = 'Genera Excel de ventas y lo sube al FTP';
    priority = 30; // Ejecutar después de Andreani
    enabled = true;
    runOnPending = false;

    private readonly REMOTE_PATH = ftpPathsConfig.ventasExcel;
    private readonly TEMP_DIR = path.join(process.cwd(), 'backend', 'data', 'temp');

    async handle(payload: SaleCreatedPayload, context: EventContext): Promise<void> {
        if (payload.estado_pago !== 'aprobado') {
            return;
        }

        const { id_venta, venta } = payload;

        try {
            console.log(`📊 [ExcelHandler] Procesando venta #${id_venta} para Excel...`);

            const ventaCompleta = await ventasExcelExportService.getVentaCompleta(id_venta);
            const ventaRows = await ventasExcelExportService.mapVentaToExcelRows(ventaCompleta, context);

            if (ventaRows.length === 0) {
                console.warn(`⚠️ [ExcelHandler] Venta #${id_venta} sin detalles - saltando`);
                return;
            }

            await ftpService.connect();

            try {
                const localPath = path.join(this.TEMP_DIR, 'Ventas.xlsx');

                const fileExists = await ftpService.fileExists(this.REMOTE_PATH);

                let workbook;
                let startRow: number;
                let wasNewFile = false;

                if (fileExists) {
                    console.log(`📥 [ExcelHandler] Descargando Excel existente desde FTP...`);
                    await ftpService.downloadExcel(this.REMOTE_PATH, localPath);
                    workbook = excelTemplateService.readExcel(localPath);

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
                    startRow = Math.max(lastRow + 1, 4);
                    console.log(`📋 [ExcelHandler] Excel existente encontrado. Última fila: ${lastRow}, agregando desde fila: ${startRow}`);
                } else {
                    console.log(`🆕 [ExcelHandler] Archivo no existe en FTP. Creando template nuevo...`);
                    workbook = excelTemplateService.createTemplate();
                    startRow = 4;
                    wasNewFile = true;
                }

                excelTemplateService.appendVentaRows(workbook, ventaRows, startRow);

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

                excelTemplateService.saveExcel(workbook, localPath);

                console.log(`📤 [ExcelHandler] Subiendo Excel actualizado al FTP...`);
                await ftpService.uploadExcel(localPath, this.REMOTE_PATH);

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
                await ftpService.disconnect();
            }
        } catch (error: any) {
            context.handlerData[this.name] = {
                success: false,
                error: error.message || String(error),
                errorStack: error.stack,
                processedAt: new Date().toISOString(),
            };

            console.error(`❌ [ExcelHandler] Error al procesar Excel para venta #${id_venta}:`, error.message);

            if (process.env.NODE_ENV !== 'production') {
                console.error(`❌ [ExcelHandler] Stack trace:`, error.stack);
            }
        }
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
