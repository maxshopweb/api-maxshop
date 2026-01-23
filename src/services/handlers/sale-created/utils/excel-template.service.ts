/**
 * Servicio para manejar el template y operaciones de Excel de ventas
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface VentaExcelRow {
  AA: string; // # de venta
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
   * Crea un template Excel desde cero con las filas 1-3 (metadatos, títulos, headers)
   */
  createTemplate(): XLSX.WorkBook {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([]);

    // Fila 1: Metadatos
    worksheet['AL1'] = { t: 's', v: 'importante' };
    worksheet['AS1'] = { t: 's', v: 'tabllist' };
    worksheet['AX1'] = { t: 's', v: 'tablsifi' };
    worksheet['BC1'] = { t: 's', v: 'tablpcia' };
    worksheet['BG1'] = { t: 's', v: 'tablplat' };
    worksheet['BK1'] = { t: 's', v: 'Tablfopa' };
    worksheet['BM1'] = { t: 's', v: 'mismo formato que la columna 2' };

    // Fila 2: Títulos de secciones
    worksheet['AA2'] = { t: 's', v: 'Ventas' };
    worksheet['AT2'] = { t: 's', v: 'Facturación al comprador' };
    worksheet['AY2'] = { t: 's', v: 'Compradores' };

    // Fila 3: Headers con números
    worksheet['AA3'] = { t: 's', v: '# de venta    1' };
    worksheet['AB3'] = { t: 's', v: 'Fecha de venta 2' };
    worksheet['AF3'] = { t: 's', v: 'Unidades 6' };
    worksheet['AG3'] = { t: 's', v: 'Total 7 ' };
    worksheet['AL3'] = { t: 's', v: 'Estado  12   Si v iene en cero quiere decir que el pedido tiene más de 1 artículo' };
    worksheet['AN3'] = { t: 's', v: 'SKU 14' };
    worksheet['AR3'] = { t: 's', v: 'Precio unitario (ARS) 18' };
    worksheet['AS3'] = { t: 's', v: 'codigo lista de precios    19    ' };
    worksheet['AT3'] = { t: 's', v: 'Provincia de facturación 20  Tablpcia' };
    worksheet['AU3'] = { t: 's', v: 'Datos personales o de empresa 21' };
    worksheet['AV3'] = { t: 's', v: 'Tipo y número de documento 22' };
    worksheet['AW3'] = { t: 's', v: 'Dirección  23' };
    worksheet['AX3'] = { t: 's', v: 'Condición fiscal 24' };
    worksheet['AY3'] = { t: 's', v: 'Comprador 25' };
    worksheet['AZ3'] = { t: 's', v: 'DNI 26' };
    worksheet['BA3'] = { t: 's', v: 'Domicilio Envio 27' };
    worksheet['BB3'] = { t: 's', v: 'Ciudad 28' };
    worksheet['BC3'] = { t: 's', v: 'Provincia Envio   29    ' };
    worksheet['BD3'] = { t: 's', v: 'Código postal Envio 30' };
    worksheet['BE3'] = { t: 's', v: 'País' };
    worksheet['BF3'] = { t: 's', v: 'Transporte   32 Tabltran' };
    worksheet['BG3'] = { t: 's', v: 'Identificación de Plataforma de Pago 33' };
    worksheet['BH3'] = { t: 's', v: 'id de Pago  34' };
    worksheet['BI3'] = { t: 's', v: 'Estado del pago 35' };
    worksheet['BJ3'] = { t: 's', v: 'Detalle del estado 36' };
    worksheet['BK3'] = { t: 's', v: 'Forma de Pago  37' };
    worksheet['BL3'] = { t: 's', v: 'Tipo de pago 38' };
    worksheet['BM3'] = { t: 's', v: 'Fecha Aprobacion mismo formato que la columna 2    ' };
    worksheet['BN3'] = { t: 's', v: 'Total Pagado  40' };
    worksheet['BO3'] = { t: 's', v: 'Total Neto 41' };
    worksheet['BP3'] = { t: 's', v: 'Comisiones 42' };
    worksheet['BQ3'] = { t: 's', v: 'Cantidad Cuotas 43' };
    worksheet['BR3'] = { t: 's', v: 'Numero Tarjeta 44' };
    worksheet['BS3'] = { t: 's', v: 'Titular Tarjeta 45' };

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
      let lastRow = 3; // Fila de headers
      
      // Iterar desde fila 4 hacia abajo
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
      
      return lastRow;
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
