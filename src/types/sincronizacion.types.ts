/**
 * Tipos TypeScript para el sistema de sincronización
 */

export interface ImportResult {
  tabla: string;
  registrosProcesados: number;
  registrosInsertados: number;
  registrosActualizados: number;
  registrosConError: number;
  errores: Array<{ fila: number; codigo: string; error: string }>;
  duracionMs: number;
}

export interface ImportSummary {
  inicio: Date;
  fin: Date;
  duracionTotalMs: number;
  resultados: ImportResult[];
  estadisticas: {
    totalRegistros: number;
    totalInsertados: number;
    totalActualizados: number;
    totalErrores: number;
  };
}

export interface SincronizacionResult {
  exito: boolean;
  inicio: Date;
  fin: Date;
  duracionTotalMs: number;
  fases: {
    descargaFTP: {
      exito: boolean;
      archivosDescargados: number;
      errores: string[];
      duracionMs: number;
    };
    conversionCSV: {
      exito: boolean;
      archivosConvertidos: number;
      errores: string[];
      duracionMs: number;
    };
    importacionBD: {
      exito: boolean;
      resumen: ImportSummary | null;
      errores: string[];
      duracionMs: number;
    };
  };
  errores: string[];
  mensaje: string;
}

export interface StockData {
  stock: number;      // ACTUSTOK (suma por depósito)
  stock_min: number;  // MINISTOK (máx por producto si varios depósitos)
}

export interface ImportDependencies {
  categorias: Set<string>;
  marcas: Set<string>;
  grupos: Set<string>;
  impuestos: Map<string, number>;
  precios: Map<string, PrecioData>;
  stock: Map<string, StockData>;
}

export interface PrecioData {
  precioVenta: number | null;    // CODILIST = V
  precioEspecial: number | null; // CODILIST = O
  precioPvp: number | null;     // CODILIST = P
  precioCampanya: number | null; // CODILIST = Q
  precioCosto?: number | null;   // CODILIST = C (opcional)
}
