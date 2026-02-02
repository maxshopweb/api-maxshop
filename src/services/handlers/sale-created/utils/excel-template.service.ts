/**
 * Servicio para manejar el template y operaciones de Excel de ventas
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface VentaExcelRow {
  AA: string; // # de venta (columna A en Excel)
  AB: string; // Fecha de venta
  AF: string; // Unidades
  AG: string; // Total
  AL: string; // Estado
  AN: string; // SKU
  AR: string; // Precio unitario
  AS: string | null; // codigo lista de precios
  AT: string | null; // Provincia de facturación
  AU: string; // Datos personales o de empresa
  AV: string; // Tipo y número de documento
  AW: string; // Dirección
  AX: string; // Condición fiscal
  AY: string; // Comprador
  AZ: string; // DNI
  BA: string; // Domicilio Envio
  BB: string; // Ciudad
  BC: string; // Provincia Envio
  BD: string; // Código postal Envio
  BE: string; // País
  BF: string; // Transporte
  BG: string; // Identificación de Plataforma de Pago
  BH: string | null; // id de Pago
  BI: string | null; // Estado del pago
  BJ: string | null; // Detalle del estado
  BK: string | null; // Forma de Pago
  BL: string | null; // Tipo de pago
  BM: string | null; // Fecha Aprobacion
  BN: string | null; // Total Pagado
  BO: string | null; // Total Neto
  BP: string | null; // Comisiones
  BQ: string | null; // Cantidad Cuotas
  BR: string | null; // Numero Tarjeta
  BS: string | null; // Titular Tarjeta
}

export class ExcelTemplateService {
  private readonly SHEET_NAME = 'Ventas AR';

  /**
   * Crea un template Excel vacío (sin encabezados)
   * Las filas 1, 2, 3 quedan vacías
   * Los datos se escribirán desde la fila 4
   */
  createTemplate(): XLSX.WorkBook {
    const workbook = XLSX.utils.book_new();
    // Crear una hoja completamente vacía
    const worksheet = XLSX.utils.aoa_to_sheet([]);

    XLSX.utils.book_append_sheet(workbook, worksheet, this.SHEET_NAME);
    return workbook;
  }

  /**
   * Lee un archivo Excel existente
   */
  readExcel(filePath: string): XLSX.WorkBook {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Archivo Excel no existe: ${filePath}`);
      }
      return XLSX.readFile(filePath);
    } catch (error) {
      console.error(`❌ [ExcelTemplate] Error al leer Excel: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * Encuentra la última fila con datos (después de la fila 3 de headers)
   * IMPORTANTE: Ignora cualquier dato antes de la fila 4 y busca desde la fila 4 en adelante
   */
  findLastDataRow(workbook: XLSX.WorkBook): number {
    try {
      const worksheet = workbook.Sheets[this.SHEET_NAME];
      if (!worksheet) {
        return 3; // Si no existe la hoja, retornar fila de headers
      }

      // Convertir a JSON para iterar
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
      
      // La fila 3 es la de headers (índice 2), empezar desde fila 4 (índice 3)
      let lastRow = 3; // Fila de headers (mínimo permitido)
      
      // CRÍTICO: Ignorar cualquier dato antes de la fila 4
      // Iterar SOLO desde fila 4 (índice 3) hacia abajo
      for (let i = 3; i < data.length; i++) {
        const row = data[i] as any[];
        // Si la columna AA (índice 0) tiene valor, es una fila con datos
        if (row && row[0] !== null && row[0] !== undefined && row[0] !== '') {
          lastRow = i + 1; // +1 porque XLSX usa 1-based indexing
        } else {
          // Si encontramos una fila vacía, la anterior era la última
          break;
        }
      }
      
      // Asegurar que nunca retornemos menos de 3 (fila de headers)
      // Esto garantiza que startRow será al menos 4
      return Math.max(lastRow, 3);
    } catch (error) {
      console.error('❌ [ExcelTemplate] Error al encontrar última fila:', error);
      return 3; // En caso de error, retornar fila de headers
    }
  }

  /**
   * Agrega filas de venta al Excel
   */
  appendVentaRows(workbook: XLSX.WorkBook, ventaRows: VentaExcelRow[], startRow: number): void {
    try {
      const worksheet = workbook.Sheets[this.SHEET_NAME];
      if (!worksheet) {
        throw new Error(`Hoja "${this.SHEET_NAME}" no existe en el Excel`);
      }

      // Mapeo de columnas a índices
      const columnMap: Record<string, number> = {
        'AA': 0, 'AB': 1, 'AC': 2, 'AD': 3, 'AE': 4, 'AF': 5, 'AG': 6,
        'AH': 7, 'AI': 8, 'AJ': 9, 'AK': 10, 'AL': 11, 'AM': 12, 'AN': 13,
        'AO': 14, 'AP': 15, 'AQ': 16, 'AR': 17, 'AS': 18, 'AT': 19, 'AU': 20,
        'AV': 21, 'AW': 22, 'AX': 23, 'AY': 24, 'AZ': 25, 'BA': 26, 'BB': 27,
        'BC': 28, 'BD': 29, 'BE': 30, 'BF': 31, 'BG': 32, 'BH': 33, 'BI': 34,
        'BJ': 35, 'BK': 36, 'BL': 37, 'BM': 38, 'BN': 39, 'BO': 40, 'BP': 41,
        'BQ': 42, 'BR': 43, 'BS': 44
      };

      let currentRow = startRow;

      for (const rowData of ventaRows) {
        // Escribir cada columna de la fila
        for (const [col, value] of Object.entries(rowData)) {
          if (value !== null && value !== undefined) {
            const colIndex = columnMap[col];
            if (colIndex !== undefined) {
              const cellAddress = XLSX.utils.encode_cell({ r: currentRow - 1, c: colIndex });
              worksheet[cellAddress] = { t: 's', v: value.toString() };
            }
          }
        }
        currentRow++;
      }

      // Actualizar el rango de la hoja
      worksheet['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: currentRow - 1, c: 44 }
      });

      console.log(`✅ [ExcelTemplate] Agregadas ${ventaRows.length} fila(s) desde la fila ${startRow}`);
    } catch (error) {
      console.error('❌ [ExcelTemplate] Error al agregar filas:', error);
      throw error;
    }
  }

  /**
   * Guarda el Excel en un archivo
   */
  saveExcel(workbook: XLSX.WorkBook, filePath: string): void {
    try {
      // Asegurar que el directorio existe
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      XLSX.writeFile(workbook, filePath);
      console.log(`✅ [ExcelTemplate] Excel guardado: ${filePath}`);
    } catch (error) {
      console.error(`❌ [ExcelTemplate] Error al guardar Excel: ${filePath}`, error);
      throw error;
    }
  }
}

export const excelTemplateService = new ExcelTemplateService();
