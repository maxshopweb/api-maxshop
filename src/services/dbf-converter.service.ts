import * as fs from 'fs';
import * as path from 'path';
import { DBFFile } from 'dbffile';

export interface DBFColumn {
  name: string;
  type: string; // C, N, D, L, M
  length: number;
  decimalPlaces: number;
}

export class DBFConverterService {
  /**
   * Convierte un archivo DBF a CSV con el formato exacto requerido
   */
  async convertDBFtoCSV(dbfFilePath: string, outputPath: string): Promise<string> {
    try {
      console.log(`🔄 Convirtiendo ${path.basename(dbfFilePath)} → ${path.basename(outputPath)}`);

      // Abrir el archivo DBF
      const dbf = await DBFFile.open(dbfFilePath);

      // Obtener metadatos de las columnas
      const columns: DBFColumn[] = dbf.fields.map(field => ({
        name: field.name,
        type: field.type,
        length: field.size,
        decimalPlaces: field.decimalPlaces || 0,
      }));

      // Crear el contenido CSV
      const csvLines: string[] = [];

      // Primera línea: Metadatos de columnas en formato "NOMBRE,TIPO,LONGITUD,PRECISION"
      // IMPORTANTE: El formato varía según el tipo:
      // - C (Character): "NOMBRE,C,LONGITUD" (sin tercer parámetro)
      // - D (Date): "NOMBRE,D" (sin parámetros adicionales)
      // - L (Logical): "NOMBRE,L" (sin parámetros adicionales)
      // - N (Numeric): "NOMBRE,N,LONGITUD,PRECISION" (siempre con precisión)
      const headerLine = columns
        .map(col => {
          let metadata: string;
          const typeUpper = col.type.toUpperCase();
          
          if (typeUpper === 'C') {
            // Character: solo nombre, tipo y longitud
            metadata = `${col.name},${col.type},${col.length}`;
          } else if (typeUpper === 'D') {
            // Date: solo nombre y tipo
            metadata = `${col.name},${col.type}`;
          } else if (typeUpper === 'L') {
            // Logical: solo nombre y tipo
            metadata = `${col.name},${col.type}`;
          } else if (typeUpper === 'N') {
            // Numeric: nombre, tipo, longitud y precisión
            metadata = `${col.name},${col.type},${col.length},${col.decimalPlaces}`;
          } else {
            // Otros tipos: incluir todos los parámetros por defecto
            metadata = `${col.name},${col.type},${col.length},${col.decimalPlaces}`;
          }
          
          return `"${metadata}"`;
        })
        .join(',');
      csvLines.push(headerLine);

      // Procesar cada registro usando async iteration
      let recordCount = 0;
      for await (const record of dbf) {
        const row: string[] = [];

        for (const column of columns) {
          let value = record[column.name];

          // Formatear según el tipo
          const formattedValue = this.formatValue(value, column);
          row.push(formattedValue);
        }

        // Unir con comas (sin comillas adicionales a menos que el valor las necesite)
        csvLines.push(row.join(','));
        recordCount++;
      }

      // Escribir el archivo CSV
      const csvContent = csvLines.join('\n');
      
      // Asegurar que el directorio de salida existe
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Escribir con encoding UTF-8
      fs.writeFileSync(outputPath, csvContent, 'utf-8');

      console.log(`✅ Convertido: ${recordCount} registros → ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error(`❌ Error al convertir ${dbfFilePath}:`, error);
      throw new Error(`Error de conversión: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Formatea un valor según su tipo de columna DBF
   */
  private formatValue(value: any, column: DBFColumn): string {
    // Si el valor es null o undefined, retornar vacío
    if (value === null || value === undefined) {
      return '';
    }

    switch (column.type.toUpperCase()) {
      case 'C': // Character
        return this.formatCharacter(value);

      case 'N': // Numeric
        return this.formatNumeric(value, column.decimalPlaces);

      case 'D': // Date
        return this.formatDate(value);

      case 'L': // Logical (Boolean)
        return this.formatLogical(value);

      case 'M': // Memo
        return this.formatCharacter(String(value));

      default:
        return String(value);
    }
  }

  /**
   * Formatea un valor de tipo Character
   */
  private formatCharacter(value: any): string {
    const str = String(value).trim();
    
    // Si contiene comas, comillas o saltos de línea, necesita comillas
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      // Escapar comillas dobles duplicándolas
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    }
    
    return str;
  }

  /**
   * Formatea un valor numérico
   */
  private formatNumeric(value: any, decimalPlaces: number): string {
    if (value === null || value === undefined || value === '') {
      // Los campos numéricos vacíos se escriben como 0
      return '0';
    }

    const num = typeof value === 'number' ? value : parseFloat(String(value));
    
    if (isNaN(num)) {
      // Los campos numéricos con NaN se escriben como 0
      return '0';
    }

    // Si tiene decimales, usar coma como separador (formato argentino)
    if (decimalPlaces > 0) {
      // Si el valor es 0 o es un entero (sin parte decimal), retornar como entero sin comillas
      if (num === 0 || Number.isInteger(num)) {
        return String(Math.round(num));
      }
      
      // Formatear con la cantidad de decimales especificada
      let fixed = num.toFixed(decimalPlaces);
      // Eliminar ceros finales después del punto decimal
      fixed = fixed.replace(/\.?0+$/, '');
      // Reemplazar punto por coma
      const formatted = fixed.replace('.', ',');
      // Los números con decimales (distintos de 0 y no enteros) van entre comillas en el formato CSV
      return `"${formatted}"`;
    }

    // Sin decimales, retornar como entero (sin comillas)
    return String(Math.round(num));
  }

  /**
   * Formatea una fecha (tipo D)
   */
  private formatDate(value: any): string {
    if (!value) {
      return '';
    }

    try {
      let date: Date;

      // node-dbf puede retornar fechas en diferentes formatos
      if (value instanceof Date) {
        date = value;
      } else if (typeof value === 'string') {
        // Intentar parsear diferentes formatos
        // Formato común: YYYYMMDD
        if (value.length === 8 && /^\d{8}$/.test(value)) {
          const year = parseInt(value.substring(0, 4));
          const month = parseInt(value.substring(4, 6)) - 1; // Mes es 0-indexed
          const day = parseInt(value.substring(6, 8));
          date = new Date(year, month, day);
        } else {
          date = new Date(value);
        }
      } else {
        return '';
      }

      // Validar que sea una fecha válida
      if (isNaN(date.getTime())) {
        return '';
      }

      // Formatear como DD/MM/YYYY
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();

      return `${day}/${month}/${year}`;
    } catch (error) {
      console.warn(`⚠️  Error al formatear fecha: ${value}`, error);
      return '';
    }
  }

  /**
   * Formatea un valor lógico (Boolean)
   */
  private formatLogical(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    // DBF usa T/t/Y/y para true y F/f/N/n para false
    const str = String(value).toUpperCase();
    if (str === 'T' || str === 'Y' || str === 'TRUE' || value === true) {
      return 'T';
    }
    if (str === 'F' || str === 'N' || str === 'FALSE' || value === false) {
      return 'F';
    }

    return '';
  }
}

export default new DBFConverterService();
