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

/**
 * Entrada del manifest por archivo .dbf (estado conocido del FTP en la última sync).
 * Usado para comparar con el listado actual y detectar archivos nuevos o modificados.
 */
export interface SyncManifestEntry {
  size: number;
  modifiedAt?: string; // ISO string o raw del FTP (rawModifiedAt)
}

/**
 * Manifest: nombre de archivo .dbf -> entrada con size y opcional modifiedAt.
 */
export type SyncManifest = Record<string, SyncManifestEntry>;

/**
 * Claves de importación selectiva (Etapa 3). Usado por el orquestador incremental para
 * decidir qué método del csv-importer ejecutar según el archivo .dbf/.csv que cambió.
 */
export type ImportSelectivoKey =
  | 'categorias'
  | 'marcas'
  | 'grupos'
  | 'impuestos'
  | 'listas'
  | 'sifi'
  | 'provincias'
  | 'plataformas'
  | 'formasPago'
  | 'stock'
  | 'precios'
  | 'maestros';

/**
 * Mapa: nombre de archivo .dbf en MAYÚSCULAS → clave de importación selectiva.
 * El orquestador incremental (Etapa 4) debe hacer lookup con file.name.toUpperCase().
 */
export const MAPA_DBF_A_IMPORT_SELECTIVO: Record<string, ImportSelectivoKey> = {
  'MAESCATE.DBF': 'categorias',
  'TABLMARC.DBF': 'marcas',
  'MAESGRAR.DBF': 'grupos',
  'TABLIMPU.DBF': 'impuestos',
  'TABLLIST.DBF': 'listas',
  'TABLSIFI.DBF': 'sifi',
  'TABLPCIA.DBF': 'provincias',
  'TABLPLAT.DBF': 'plataformas',
  'TABLFOPA.DBF': 'formasPago',
  'MAESSTOK.DBF': 'stock',
  'MAESPREC.DBF': 'precios',
  'MAESARTI.DBF': 'maestros',
};

/**
 * Resultado de la sincronización incremental (Etapa 4).
 * No se usa SincronizacionResult para no mezclar con el flujo completo.
 */
export interface SincronizacionIncrementalResult {
  exito: boolean;
  sinCambios: boolean;
  archivosProcesados: string[];
  importacionesEjecutadas: ImportSelectivoKey[];
  errores: string[];
  mensaje: string;
  duracionMs: number;
}
