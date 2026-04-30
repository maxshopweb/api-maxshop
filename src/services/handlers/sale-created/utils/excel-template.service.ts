/**
 * Servicio para manejar el template y operaciones de Excel de ventas
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface VentaExcelRow {
  // Permitimos filas parciales para soportar:
  // - fila cabecera de venta (solo columnas de venta)
  // - filas detalle de producto (solo columnas de producto)
  // Los valores numéricos se escriben como número en Excel (formato decimal)
  //
  // Columnas liquidación/cuotas MP (después de BV):
  // - BW: monto liquidado (net_received_amount)
  // - BX: fecha liquidación (money_release_date), string formateado
  // - BY: monto por cuota (installment_amount)
  [key: string]: string | number | null | undefined;
}

/**
 * Cabeceras filas 2–3 alineadas con Venta_fgb_detallada.xlsx (fila 1 vacía).
 */
const VENTAS_SHEET_ROW2: Record<string, string> = {
  A2: 'Ventas',
  T2: 'Facturación al comprador',
  Y2: 'Compradores',
};

/** Fila 3: nombres de columna (texto literal del documento de referencia). */
const VENTAS_SHEET_ROW3: Record<string, string> = {
  A3: '# de venta    1',
  B3: 'Fecha de venta 2',
  F3: 'Unidades 6',
  G3: 'Total 7 ',
  L3: 'Estado  12   Si v iene en cero quiere decir que el pedido tiene más de 1 artículo',
  N3: 'SKU 14',
  R3: 'Precio unitario (ARS) 18',
  S3: 'codigo lista de precios    19    ',
  T3: 'Provincia de facturación 20  Tablpcia',
  U3: 'Datos personales o de empresa 21',
  V3: 'Tipo y número de documento 22',
  W3: 'Dirección  23',
  X3: 'Condición fiscal 24',
  Y3: 'Comprador 25',
  Z3: 'DNI 26',
  AA3: 'Domicilio Envio 27',
  AB3: 'Ciudad 28',
  AC3: 'Provincia Envio   29   ',
  AD3: 'Código postal Envio 30',
  AE3: 'País',
  AF3: 'Transporte   32 Tabltran',
  AG3: 'Identificación de Plataforma de Pago 33',
  AH3: 'id de Pago  34',
  AI3: 'Estado del pago 35',
  AJ3: 'Detalle del estado 36',
  AK3: 'Forma de Pago  37',
  AL3: 'Tipo de pago 38',
  AM3: 'Fecha Aprobacion mismo formato que la columna 2   39',
  AN3: 'Total Pagado  40',
  AO3: 'Total Neto 41',
  AP3: 'Comisiones 42',
  AQ3: 'Cantidad Cuotas 43',
  AR3: 'Numero Tarjeta 44',
  AS3: 'Titular Tarjeta 45',
};

function seedVentasArSheetHeaders(worksheet: XLSX.WorkSheet): void {
  for (const [addr, v] of Object.entries(VENTAS_SHEET_ROW2)) {
    worksheet[addr] = { t: 's', v };
  }
  for (const [addr, v] of Object.entries(VENTAS_SHEET_ROW3)) {
    worksheet[addr] = { t: 's', v };
  }
}

export class ExcelTemplateService {
  private readonly SHEET_NAME = 'Ventas AR';

  /**
   * Recalcula worksheet['!ref'] como el rectángulo mínimo que contiene todas las celdas definidas.
   * Evita filas/columnas fantasma y no recorta datos existentes al añadir filas nuevas.
   */
  private recomputeWorksheetRef(worksheet: XLSX.WorkSheet): void {
    const keys = Object.keys(worksheet).filter((k) => !k.startsWith('!'));
    if (keys.length === 0) {
      worksheet['!ref'] = 'A1:A1';
      return;
    }
    let minR = Infinity;
    let minC = Infinity;
    let maxR = -Infinity;
    let maxC = -Infinity;
    for (const addr of keys) {
      const decoded = XLSX.utils.decode_cell(addr);
      if (decoded.r < minR) minR = decoded.r;
      if (decoded.c < minC) minC = decoded.c;
      if (decoded.r > maxR) maxR = decoded.r;
      if (decoded.c > maxC) maxC = decoded.c;
    }
    worksheet['!ref'] = XLSX.utils.encode_range({
      s: { r: minR, c: minC },
      e: { r: maxR, c: maxC },
    });
  }

  /**
   * Crea un template Excel para Ventas AR.
   * Fila 1 vacía. Filas 2–3: cabeceras como Venta_fgb_detallada.xlsx. Datos desde fila 4.
   */
  createTemplate(): XLSX.WorkBook {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([]);

    seedVentasArSheetHeaders(worksheet);
    this.recomputeWorksheetRef(worksheet);

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
        // Si la columna A (índice 0) tiene valor, es una fila con datos
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
   * Verifica si una venta ya existe en el Excel por código interno (columna A/AA)
   * Busca desde la fila 4 en adelante.
   */
  isVentaInExcel(workbook: XLSX.WorkBook, codVenta: string): boolean {
    try {
      const worksheet = workbook.Sheets[this.SHEET_NAME];
      if (!worksheet) {
        return false;
      }

      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
      for (let i = 3; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        const cod = row[0];
        if (cod !== null && cod !== undefined && String(cod).trim() === codVenta.trim()) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('❌ [ExcelTemplate] Error al verificar venta duplicada en Excel:', error);
      return false;
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

      // Mapeo: clave en código (AA=Excel A, BA=Excel AA) → índice 0-based.
      // Columnas AA–BV (0–47) existentes; BW–BY (48–50) liquidación y cuotas MP.
      const columnMap: Record<string, number> = {
        'AA': 0, 'AB': 1, 'AC': 2, 'AD': 3, 'AE': 4, 'AF': 5, 'AG': 6,
        'AH': 7, 'AI': 8, 'AJ': 9, 'AK': 10, 'AL': 11, 'AM': 12, 'AN': 13,
        'AO': 14, 'AP': 15, 'AQ': 16, 'AR': 17, 'AS': 18, 'AT': 19, 'AU': 20,
        'AV': 21, 'AW': 22, 'AX': 23, 'AY': 24, 'AZ': 25, 'BA': 26, 'BB': 27,
        'BC': 28, 'BD': 29, 'BE': 30, 'BF': 31, 'BG': 32, 'BH': 33, 'BI': 34,
        'BJ': 35, 'BK': 36, 'BL': 37, 'BM': 38, 'BN': 39, 'BO': 40, 'BP': 41,
        'BQ': 42, 'BR': 43, 'BS': 44, 'BT': 45, 'BU': 46, 'BV': 47,
        'BW': 48, 'BX': 49, 'BY': 50
      };

      let currentRow = startRow;

      // Columnas que se escriben como número en Excel (formato decimal 23000,00)
      // AF (cantidad) se excluye: siempre entero, sin z '#.##0,00'
      const columnasNumericas = new Set([
        'AG', 'AH', 'AJ', 'AK', 'AL', 'AO', 'AP', 'AQ', 'AR',
        'BN', 'BO', 'BP',
        'BW', 'BY' // BW: monto liquidado, BY: monto por cuota
      ]);

      for (const rowData of ventaRows) {
        // Escribir cada columna de la fila
        for (const [col, value] of Object.entries(rowData)) {
          if (value !== null && value !== undefined) {
            const colIndex = columnMap[col];
            if (colIndex !== undefined) {
              const cellAddress = XLSX.utils.encode_cell({ r: currentRow - 1, c: colIndex });
              const num = typeof value === 'number' && !isNaN(value);
              if (num && columnasNumericas.has(col)) {
                const rounded = Math.round((value as number) * 100) / 100;
                worksheet[cellAddress] = { t: 'n', v: rounded, z: '#.##0,00' };
              } else if (num && col === 'AF') {
                worksheet[cellAddress] = { t: 'n', v: Math.round(value as number) };
              } else {
                worksheet[cellAddress] = { t: 's', v: value.toString() };
              }
            }
          }
        }
        currentRow++;
      }

      this.recomputeWorksheetRef(worksheet);

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
