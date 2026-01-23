/**
 * Script para sincronizar bases de datos desde FTP
 * 
 * Proceso:
 * 1. Conecta al FTP del cliente
 * 2. Descarga todos los archivos .DBF de /Tekno/Bases
 * 3. Convierte cada .DBF a CSV con el formato exacto requerido
 * 4. Guarda los CSV en backend/data/csv/
 * 
 * Uso:
 *   npm run ts-node src/scripts/sincronizar-bases.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import ftpService from '../services/ftp.service';
import dbfConverterService from '../services/dbf-converter.service';

// Directorios
const TEMP_DIR = path.join(__dirname, '../../temp/dbf');
const CSV_OUTPUT_DIR = path.join(__dirname, '../../data/csv');

/**
 * Limpia el directorio temporal
 */
function cleanupTempDir(): void {
  if (fs.existsSync(TEMP_DIR)) {
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(TEMP_DIR, file));
    }
    console.log('🧹 Directorio temporal limpiado');
  }
}

/**
 * Asegura que los directorios necesarios existan
 */
function ensureDirectories(): void {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log(`📁 Directorio temporal creado: ${TEMP_DIR}`);
  }

  if (!fs.existsSync(CSV_OUTPUT_DIR)) {
    fs.mkdirSync(CSV_OUTPUT_DIR, { recursive: true });
    console.log(`📁 Directorio CSV creado: ${CSV_OUTPUT_DIR}`);
  }
}

/**
 * Proceso principal de sincronización
 */
async function sincronizarBases(): Promise<void> {
  console.log('🚀 Iniciando sincronización de bases de datos...\n');

  try {
    // Preparar directorios
    ensureDirectories();
    cleanupTempDir();

    // 1. Conectar al FTP
    console.log('📡 Conectando al servidor FTP...');
    await ftpService.connect();

    try {
      // 2. Listar y descargar archivos .DBF
      console.log('\n📥 Descargando archivos .DBF...');
      const downloadedFiles = await ftpService.downloadAllDBFFiles(TEMP_DIR);

      if (downloadedFiles.length === 0) {
        console.log('⚠️  No se encontraron archivos .DBF para descargar');
        return;
      }

      console.log(`\n✅ ${downloadedFiles.length} archivo(s) descargado(s)\n`);

      // 3. Convertir cada .DBF a CSV
      console.log('🔄 Convirtiendo archivos .DBF a CSV...\n');
      const convertedFiles: string[] = [];
      const errors: Array<{ file: string; error: string }> = [];

      for (const dbfFile of downloadedFiles) {
        try {
          const fileName = path.basename(dbfFile);
          const csvFileName = fileName.replace(/\.dbf$/i, '.csv');
          const csvPath = path.join(CSV_OUTPUT_DIR, csvFileName);

          await dbfConverterService.convertDBFtoCSV(dbfFile, csvPath);
          convertedFiles.push(csvFileName);
        } catch (error) {
          const fileName = path.basename(dbfFile);
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push({ file: fileName, error: errorMsg });
          console.error(`❌ Error al convertir ${fileName}:`, errorMsg);
        }
      }

      // 4. Resumen
      console.log('\n' + '='.repeat(60));
      console.log('📊 RESUMEN DE SINCRONIZACIÓN');
      console.log('='.repeat(60));
      console.log(`✅ Archivos descargados: ${downloadedFiles.length}`);
      console.log(`✅ Archivos convertidos: ${convertedFiles.length}`);
      
      if (convertedFiles.length > 0) {
        console.log('\n📄 Archivos CSV generados:');
        convertedFiles.forEach(file => console.log(`   - ${file}`));
      }

      if (errors.length > 0) {
        console.log(`\n⚠️  Errores (${errors.length}):`);
        errors.forEach(({ file, error }) => {
          console.log(`   - ${file}: ${error}`);
        });
      }

      console.log('\n✅ Sincronización completada');
      console.log(`📁 CSV guardados en: ${CSV_OUTPUT_DIR}`);

    } finally {
      // Desconectar del FTP
      await ftpService.disconnect();
    }

    // Limpiar directorio temporal
    cleanupTempDir();

  } catch (error) {
    console.error('\n❌ Error en la sincronización:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  sincronizarBases()
    .then(() => {
      console.log('\n✨ Proceso finalizado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Error fatal:', error);
      process.exit(1);
    });
}

export { sincronizarBases };
