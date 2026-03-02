/**
 * Servicio orquestador de sincronización completa e incremental
 * Coordina: FTP → DBF → CSV → Base de Datos
 * Etapa 1: al finalizar sync completa se guarda el manifest para futura comparación incremental.
 * Etapa 2: descargarYConvertirSoloCambiados() descarga y convierte solo los .dbf indicados y actualiza el manifest (merge).
 * Etapa 4: sincronizarIncremental() compara FTP con manifest; si hay cambios, descarga/convierte solo esos y ejecuta solo las importaciones correspondientes (no importarTodo).
 * Etapa 5: el cron usa tieneManifest() para elegir sincronizarCompleto() (primera vez) o sincronizarIncremental() (posteriores).
 * Etapa 6: manifest solo para archivos descargados+convertidos OK; nombres normalizados; cron respeta SYNC_FORZAR_COMPLETA.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FileInfo } from 'basic-ftp';
import ftpService from '../ftp.service';
import dbfConverterService from '../dbf-converter.service';
import csvImporterService from './csv-importer.service';
import { SyncManifestService } from './sync-manifest.service';
import {
  SincronizacionResult,
  SincronizacionIncrementalResult,
  ImportSelectivoKey,
  MAPA_DBF_A_IMPORT_SELECTIVO,
} from '../../types/sincronizacion.types';

// Directorios
const TEMP_DIR = path.join(__dirname, '../../../temp/dbf');
const CSV_OUTPUT_DIR = path.join(__dirname, '../../../data/csv');

const syncManifestService = new SyncManifestService(CSV_OUTPUT_DIR);

/** Orden de ejecución: referencias primero, luego datos de productos (stock, precios, maestros). */
const REFERENCE_KEYS_ORDER: ImportSelectivoKey[] = [
  'categorias',
  'marcas',
  'grupos',
  'impuestos',
  'listas',
  'sifi',
  'provincias',
  'plataformas',
  'formasPago',
];
const PRODUCT_KEYS_ORDER: ImportSelectivoKey[] = ['stock', 'precios', 'maestros'];

/** Nombre del CSV por clave (solo para referencias; producto usa el mismo csvDir). */
const KEY_TO_CSV_FILE: Record<ImportSelectivoKey, string> = {
  categorias: 'maescate.csv',
  marcas: 'TABLMARC.csv',
  grupos: 'MAESGRAR.csv',
  impuestos: 'tablimpu.csv',
  listas: 'TABLLIST.csv',
  sifi: 'TABLSIFI.csv',
  provincias: 'TABLPCIA.csv',
  plataformas: 'tablplat.csv',
  formasPago: 'TABLFOPA.csv',
  stock: 'MAESSTOK.csv',
  precios: 'maesprec.csv',
  maestros: 'MAESARTI.csv',
};

export class SincronizacionService {
  /**
   * Indica si existe un manifest previo (sync completa ya ejecutada al menos una vez).
   * Etapa 5: el cron usa esto para decidir entre sincronizarCompleto (false) o sincronizarIncremental (true).
   */
  tieneManifest(): boolean {
    return syncManifestService.readManifest() !== null;
  }

  /**
   * Sincronización completa: FTP → CSV → BD
   */
  async sincronizarCompleto(): Promise<SincronizacionResult> {
    const inicio = new Date();
    const resultado: SincronizacionResult = {
      exito: false,
      inicio,
      fin: new Date(),
      duracionTotalMs: 0,
      fases: {
        descargaFTP: {
          exito: false,
          archivosDescargados: 0,
          errores: [],
          duracionMs: 0,
        },
        conversionCSV: {
          exito: false,
          archivosConvertidos: 0,
          errores: [],
          duracionMs: 0,
        },
        importacionBD: {
          exito: false,
          resumen: null,
          errores: [],
          duracionMs: 0,
        },
      },
      errores: [],
      mensaje: '',
    };

    try {
      // Preparar directorios
      this.asegurarDirectorios();
      this.limpiarDirectorioTemporal();

      // FASE 1: Listar y descargar archivos DBF del FTP (guardamos la lista para el manifest al final)
      console.log('\n📡 FASE 1: Descargando archivos desde FTP...');
      const inicioFTP = Date.now();
      let dbfFiles: FileInfo[] = [];
      try {
        await ftpService.connect();
        dbfFiles = await ftpService.listDBFFiles();
        const archivosDescargados: string[] = [];
        for (const file of dbfFiles) {
          try {
            const localPath = await ftpService.downloadFile(file.name, TEMP_DIR);
            archivosDescargados.push(localPath);
          } catch (error: any) {
            console.error(`⚠️  No se pudo descargar ${file.name}:`, error);
          }
        }
        await ftpService.disconnect();

        resultado.fases.descargaFTP = {
          exito: archivosDescargados.length > 0,
          archivosDescargados: archivosDescargados.length,
          errores: [],
          duracionMs: Date.now() - inicioFTP,
        };

        console.log(`✅ ${archivosDescargados.length} archivo(s) descargado(s)`);
      } catch (error: any) {
        resultado.fases.descargaFTP = {
          exito: false,
          archivosDescargados: 0,
          errores: [error?.message || String(error)],
          duracionMs: Date.now() - inicioFTP,
        };
        resultado.errores.push(`Error en descarga FTP: ${error?.message || String(error)}`);
        throw error;
      }

      // FASE 2: Convertir DBF a CSV
      console.log('\n🔄 FASE 2: Convirtiendo archivos DBF a CSV...');
      const inicioConversion = Date.now();
      try {
        const archivosDBF = fs
          .readdirSync(TEMP_DIR)
          .filter((file) => file.toLowerCase().endsWith('.dbf'));

        const archivosConvertidos: string[] = [];
        const erroresConversion: string[] = [];

        for (const dbfFile of archivosDBF) {
          try {
            const dbfPath = path.join(TEMP_DIR, dbfFile);
            const csvFileName = dbfFile.replace(/\.dbf$/i, '.csv');
            const csvPath = path.join(CSV_OUTPUT_DIR, csvFileName);

            await dbfConverterService.convertDBFtoCSV(dbfPath, csvPath);
            archivosConvertidos.push(csvFileName);
          } catch (error: any) {
            const errorMsg = `Error al convertir ${dbfFile}: ${error?.message || String(error)}`;
            erroresConversion.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
          }
        }

        resultado.fases.conversionCSV = {
          exito: erroresConversion.length === 0,
          archivosConvertidos: archivosConvertidos.length,
          errores: erroresConversion,
          duracionMs: Date.now() - inicioConversion,
        };

        console.log(`✅ ${archivosConvertidos.length} archivo(s) convertido(s)`);
      } catch (error: any) {
        resultado.fases.conversionCSV = {
          exito: false,
          archivosConvertidos: 0,
          errores: [error?.message || String(error)],
          duracionMs: Date.now() - inicioConversion,
        };
        resultado.errores.push(`Error en conversión: ${error?.message || String(error)}`);
        throw error;
      }

      // FASE 3: Importar CSV a Base de Datos
      console.log('\n💾 FASE 3: Importando datos a la base de datos...');
      const inicioImportacion = Date.now();
      try {
        const resumen = await csvImporterService.importarTodo(CSV_OUTPUT_DIR);

        resultado.fases.importacionBD = {
          exito: true,
          resumen,
          errores: [],
          duracionMs: Date.now() - inicioImportacion,
        };

        console.log('✅ Importación completada');
      } catch (error: any) {
        resultado.fases.importacionBD = {
          exito: false,
          resumen: null,
          errores: [error?.message || String(error)],
          duracionMs: Date.now() - inicioImportacion,
        };
        resultado.errores.push(`Error en importación: ${error?.message || String(error)}`);
        throw error;
      }

      // Limpiar directorio temporal
      this.limpiarDirectorioTemporal();

      // Guardar manifest para sync incremental (Etapa 6: también tras sync manual vía endpoint)
      if (dbfFiles.length > 0) {
        const manifest = syncManifestService.buildManifestFromFtpFiles(dbfFiles);
        syncManifestService.writeManifest(manifest);
        console.log(`📋 Manifest actualizado (${Object.keys(manifest).length} archivos)`);
      }

      // Resultado final
      resultado.exito = true;
      resultado.fin = new Date();
      resultado.duracionTotalMs = resultado.fin.getTime() - inicio.getTime();
      resultado.mensaje = 'Sincronización completada exitosamente';

      return resultado;
    } catch (error: any) {
      resultado.exito = false;
      resultado.fin = new Date();
      resultado.duracionTotalMs = resultado.fin.getTime() - inicio.getTime();
      resultado.mensaje = `Error en sincronización: ${error?.message || String(error)}`;
      resultado.errores.push(error?.message || String(error));

      // Intentar limpiar
      try {
        this.limpiarDirectorioTemporal();
      } catch (cleanupError) {
        // Ignorar errores de limpieza
      }

      return resultado;
    }
  }

  /**
   * Etapa 2: Descarga solo los .dbf indicados, los convierte a .csv en data/csv y actualiza el manifest (merge).
   * No llama a importarTodo ni conecta/desconecta FTP: el caller debe conectar antes y desconectar después.
   * @param archivosCambiados Nombres de archivos .dbf a descargar y convertir (ej. ['MAESSTOK.dbf']).
   * @param ftpFiles Listado completo del FTP (para extraer size/modifiedAt de los cambiados y actualizar el manifest).
   */
  async descargarYConvertirSoloCambiados(
    archivosCambiados: string[],
    ftpFiles: FileInfo[]
  ): Promise<void> {
    if (archivosCambiados.length === 0) {
      return;
    }

    this.asegurarDirectorios();
    this.limpiarDirectorioTemporal();

    // Descargar solo los .dbf indicados (FTP debe estar conectado)
    for (const name of archivosCambiados) {
      try {
        await ftpService.downloadFile(name, TEMP_DIR);
        console.log(`✅ Descargado: ${name}`);
      } catch (error: any) {
        console.error(`⚠️ No se pudo descargar ${name}:`, error?.message || error);
      }
    }

    // Convertir solo esos .dbf a .csv en data/csv (sobrescribiendo solo esos)
    for (const name of archivosCambiados) {
      try {
        const dbfPath = path.join(TEMP_DIR, name);
        if (!fs.existsSync(dbfPath)) {
          console.warn(`⚠️ No existe localmente ${name}, se omite conversión`);
          continue;
        }
        const csvFileName = name.replace(/\.dbf$/i, '.csv');
        const csvPath = path.join(CSV_OUTPUT_DIR, csvFileName);
        await dbfConverterService.convertDBFtoCSV(dbfPath, csvPath);
        console.log(`✅ Convertido: ${name} → ${csvFileName}`);
      } catch (error: any) {
        console.error(`❌ Error al convertir ${name}:`, error?.message || error);
      }
    }

    // Etapa 6: actualizar manifest solo para archivos descargados y convertidos correctamente
    const procesadosOk = archivosCambiados.filter((name) => {
      const csvFileName = name.replace(/\.dbf$/i, '.csv');
      return fs.existsSync(path.join(CSV_OUTPUT_DIR, csvFileName));
    });
    const currentManifest = syncManifestService.readManifest() ?? {};
    for (const name of procesadosOk) {
      const file = ftpFiles.find((f) => f.name.toUpperCase() === name.toUpperCase());
      if (file) {
        const newEntries = syncManifestService.buildManifestFromFtpFiles([file]);
        const key = name.toUpperCase();
        if (newEntries[key]) {
          currentManifest[key] = newEntries[key];
        }
      }
    }
    syncManifestService.writeManifest(currentManifest);
    console.log(`📋 Manifest actualizado (${procesadosOk.length}/${archivosCambiados.length} archivo(s))`);

    this.limpiarDirectorioTemporal();
  }

  /**
   * Etapa 4: Sincronización incremental. Compara FTP con manifest; si no hay cambios no hace nada.
   * Si hay cambios: descarga y convierte solo esos .dbf, luego ejecuta solo las importaciones correspondientes.
   * No llama a importarTodo.
   */
  async sincronizarIncremental(): Promise<SincronizacionIncrementalResult> {
    const inicio = Date.now();
    const resultado: SincronizacionIncrementalResult = {
      exito: false,
      sinCambios: false,
      archivosProcesados: [],
      importacionesEjecutadas: [],
      errores: [],
      mensaje: '',
      duracionMs: 0,
    };

    try {
      await ftpService.connect();
      const ftpFiles = await ftpService.listDBFFiles();
      const manifest = syncManifestService.readManifest();
      const archivosCambiados = syncManifestService.getArchivosCambiados(ftpFiles, manifest);

      if (archivosCambiados.length === 0) {
        await ftpService.disconnect();
        resultado.exito = true;
        resultado.sinCambios = true;
        resultado.mensaje = 'Sin cambios en FTP; no se descargó ni importó nada.';
        resultado.duracionMs = Date.now() - inicio;
        console.log('📋 [sincronizarIncremental] Sin cambios, nada que hacer.');
        return resultado;
      }

      await this.descargarYConvertirSoloCambiados(archivosCambiados, ftpFiles);
      await ftpService.disconnect();

      const keysToRun = new Set<ImportSelectivoKey>();
      for (const name of archivosCambiados) {
        const key = MAPA_DBF_A_IMPORT_SELECTIVO[name.toUpperCase()];
        if (key) keysToRun.add(key);
      }

      for (const key of REFERENCE_KEYS_ORDER) {
        if (!keysToRun.has(key)) continue;
        try {
          const csvFile = KEY_TO_CSV_FILE[key];
          const csvPath = path.join(CSV_OUTPUT_DIR, csvFile);
          if (!fs.existsSync(csvPath)) continue;
          if (key === 'categorias') await csvImporterService.importarCategorias(csvPath);
          else if (key === 'marcas') await csvImporterService.importarMarcas(csvPath);
          else if (key === 'grupos') await csvImporterService.importarGrupos(csvPath);
          else if (key === 'impuestos') await csvImporterService.importarImpuestos(csvPath);
          else if (key === 'listas') await csvImporterService.importarListasPrecio(csvPath);
          else if (key === 'sifi') await csvImporterService.importarSituacionesFiscales(csvPath);
          else if (key === 'provincias') await csvImporterService.importarProvincias(csvPath);
          else if (key === 'plataformas') await csvImporterService.importarPlataformasPago(csvPath);
          else if (key === 'formasPago') await csvImporterService.importarFormasPago(csvPath);
          resultado.importacionesEjecutadas.push(key);
        } catch (error: any) {
          const msg = `Error importación ${key}: ${error?.message || String(error)}`;
          resultado.errores.push(msg);
          console.error(`❌ [sincronizarIncremental] ${msg}`);
        }
      }

      for (const key of PRODUCT_KEYS_ORDER) {
        if (!keysToRun.has(key)) continue;
        try {
          if (key === 'stock') await csvImporterService.actualizarSoloStock(CSV_OUTPUT_DIR);
          else if (key === 'precios') await csvImporterService.actualizarSoloPrecios(CSV_OUTPUT_DIR);
          else if (key === 'maestros') await csvImporterService.actualizarSoloDatosMaestrosProductos(CSV_OUTPUT_DIR);
          resultado.importacionesEjecutadas.push(key);
        } catch (error: any) {
          const msg = `Error importación ${key}: ${error?.message || String(error)}`;
          resultado.errores.push(msg);
          console.error(`❌ [sincronizarIncremental] ${msg}`);
        }
      }

      resultado.exito = resultado.errores.length === 0;
      resultado.archivosProcesados = archivosCambiados;
      resultado.mensaje =
        resultado.errores.length === 0
          ? `Procesados ${archivosCambiados.length} archivo(s), ${resultado.importacionesEjecutadas.length} importación(es).`
          : `Procesados con errores: ${resultado.errores.join('; ')}`;
      resultado.duracionMs = Date.now() - inicio;
      console.log(`✅ [sincronizarIncremental] ${resultado.mensaje} (${resultado.duracionMs}ms)`);
      return resultado;
    } catch (error: any) {
      try {
        await ftpService.disconnect();
      } catch {
        // ignorar
      }
      resultado.exito = false;
      resultado.mensaje = `Error: ${error?.message || String(error)}`;
      resultado.errores.push(resultado.mensaje);
      resultado.duracionMs = Date.now() - inicio;
      console.error('❌ [sincronizarIncremental]', error?.message || error);
      return resultado;
    }
  }

  /**
   * Asegura que los directorios necesarios existan
   */
  private asegurarDirectorios(): void {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    if (!fs.existsSync(CSV_OUTPUT_DIR)) {
      fs.mkdirSync(CSV_OUTPUT_DIR, { recursive: true });
    }
  }

  /**
   * Limpia el directorio temporal
   */
  private limpiarDirectorioTemporal(): void {
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(TEMP_DIR, file));
        } catch (error) {
          // Ignorar errores al eliminar
        }
      }
    }
  }
}

export default new SincronizacionService();
