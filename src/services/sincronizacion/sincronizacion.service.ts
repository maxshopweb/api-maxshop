/**
 * Servicio orquestador de sincronización completa
 * Coordina: FTP → DBF → CSV → Base de Datos
 */

import * as fs from 'fs';
import * as path from 'path';
import ftpService from '../ftp.service';
import dbfConverterService from '../dbf-converter.service';
import csvImporterService from './csv-importer.service';
import { SincronizacionResult } from '../../types/sincronizacion.types';

// Directorios
const TEMP_DIR = path.join(__dirname, '../../../temp/dbf');
const CSV_OUTPUT_DIR = path.join(__dirname, '../../../data/csv');

export class SincronizacionService {
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

      // FASE 1: Descargar archivos DBF del FTP
      console.log('\n📡 FASE 1: Descargando archivos desde FTP...');
      const inicioFTP = Date.now();
      try {
        await ftpService.connect();
        const archivosDescargados = await ftpService.downloadAllDBFFiles(TEMP_DIR);
        await ftpService.disconnect();

        resultado.fases.descargaFTP = {
          exito: true,
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
