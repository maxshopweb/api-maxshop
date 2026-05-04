import { Client, FileInfo, FTPError } from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import { ftpConfig } from '../config/ftp.config';

/**
 * Mutex para serializar acceso al FTP: FacturaSyncWorker y CatalogoSyncWorker
 * comparten el mismo cliente y basic-ftp no permite operaciones concurrentes.
 */
type ReleaseFn = () => void;

export class FTPService {
  private client: Client;
  private lock: Promise<void> = Promise.resolve();
  private releaseLock: ReleaseFn | null = null;

  constructor() {
    this.client = new Client();
    this.client.ftp.verbose = process.env.NODE_ENV !== 'production';
  }

  /**
   * Conecta al servidor FTP.
   * Si otro worker está usando el FTP, espera a que termine antes de conectar.
   */
  async connect(): Promise<void> {
    const prevLock = this.lock;
    let release: ReleaseFn;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prevLock;

    try {
      await this.client.access({
        host: ftpConfig.host,
        user: ftpConfig.user,
        password: ftpConfig.password,
        port: ftpConfig.port,
        secure: ftpConfig.secure,
      });
      this.releaseLock = release!;
      console.log('✅ Conectado al servidor FTP');
    } catch (error) {
      release!();
      console.error('❌ Error al conectar al FTP:', error);
      throw new Error(`Error de conexión FTP: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Desconecta del servidor FTP y libera el lock para el siguiente worker.
   */
  async disconnect(): Promise<void> {
    try {
      this.client.close();
      console.log('✅ Desconectado del servidor FTP');
    } catch (error) {
      console.error('⚠️  Error al desconectar del FTP:', error);
    } finally {
      this.client = new Client();
      this.client.ftp.verbose = process.env.NODE_ENV !== 'production';
      if (this.releaseLock) {
        this.releaseLock();
        this.releaseLock = null;
      }
    }
  }

  /**
   * Lista todos los archivos .DBF en el directorio remoto
   */
  async listDBFFiles(): Promise<FileInfo[]> {
    try {
      await this.client.cd(ftpConfig.remotePath);
      const files = await this.client.list();
      
      // Filtrar solo archivos .DBF (case insensitive)
      const dbfFiles = files.filter(file => {
        const fileName = file.name.toLowerCase();
        return fileName.endsWith('.dbf') && file.isFile;
      });

      console.log(`📁 Encontrados ${dbfFiles.length} archivos .DBF en ${ftpConfig.remotePath}`);
      return dbfFiles;
    } catch (error) {
      console.error('❌ Error al listar archivos DBF:', error);
      throw new Error(`Error al listar archivos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Descarga un archivo .DBF del FTP a un directorio local temporal
   */
  async downloadFile(remoteFileName: string, localDir: string): Promise<string> {
    try {
      // Asegurar que el directorio existe
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      const localFilePath = path.join(localDir, remoteFileName);
      
      // Cambiar al directorio remoto
      await this.client.cd(ftpConfig.remotePath);
      
      // Descargar el archivo
      await this.client.downloadTo(localFilePath, remoteFileName);
      
      console.log(`✅ Descargado: ${remoteFileName} → ${localFilePath}`);
      return localFilePath;
    } catch (error) {
      console.error(`❌ Error al descargar ${remoteFileName}:`, error);
      throw new Error(`Error al descargar archivo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Descarga todos los archivos .DBF del FTP
   */
  async downloadAllDBFFiles(localDir: string): Promise<string[]> {
    try {
      const dbfFiles = await this.listDBFFiles();
      const downloadedFiles: string[] = [];

      for (const file of dbfFiles) {
        try {
          const localPath = await this.downloadFile(file.name, localDir);
          downloadedFiles.push(localPath);
        } catch (error) {
          console.error(`⚠️  No se pudo descargar ${file.name}:`, error);
          // Continuar con el siguiente archivo
        }
      }

      return downloadedFiles;
    } catch (error) {
      console.error('❌ Error al descargar archivos DBF:', error);
      throw error;
    }
  }

  /**
   * Verifica si un archivo existe en el FTP (SIZE sobre ruta absoluta; no depende del cwd).
   */
  async fileExists(remotePath: string): Promise<boolean> {
    try {
      await this.client.size(remotePath);
      return true;
    } catch (error: unknown) {
      if (error instanceof FTPError && error.code === 550) {
        return false;
      }
      const msg = String(error instanceof Error ? error.message : error);
      const lower = msg.toLowerCase();
      if (msg.includes('550') || lower.includes('not found') || lower.includes('no such file')) {
        return false;
      }
      console.warn(`⚠️ [FTP] fileExists(${remotePath}) — error inesperado: ${msg}`);
      return false;
    }
  }

  /**
   * Descarga un archivo Excel del FTP
   */
  async downloadExcel(remotePath: string, localPath: string): Promise<void> {
    try {
      // Asegurar que el directorio local existe
      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      const remoteDir = path.dirname(remotePath);
      const remoteFileName = path.basename(remotePath);
      
      // Cambiar al directorio remoto
      await this.client.cd(remoteDir);
      
      // Descargar el archivo
      await this.client.downloadTo(localPath, remoteFileName);
      
      console.log(`✅ [FTP] Descargado Excel: ${remotePath} → ${localPath}`);
    } catch (error) {
      console.error(`❌ [FTP] Error al descargar Excel ${remotePath}:`, error);
      throw new Error(`Error al descargar Excel: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sube un archivo Excel al FTP
   */
  async uploadExcel(localPath: string, remotePath: string): Promise<void> {
    try {
      if (!fs.existsSync(localPath)) {
        throw new Error(`Archivo local no existe: ${localPath}`);
      }

      const remoteDir = path.dirname(remotePath);
      const remoteFileName = path.basename(remotePath);
      
      // Asegurar que el directorio remoto existe (crear si no existe)
      try {
        await this.client.cd(remoteDir);
      } catch (error) {
        // Si el directorio no existe, intentar crearlo
        const dirs = remoteDir.split('/').filter(d => d);
        let currentPath = '';
        for (const dir of dirs) {
          currentPath += `/${dir}`;
          try {
            await this.client.cd(currentPath);
          } catch {
            await this.client.ensureDir(currentPath);
          }
        }
      }
      
      // Subir el archivo
      await this.client.uploadFrom(localPath, remoteFileName);
      
      console.log(`✅ [FTP] Subido Excel: ${localPath} → ${remotePath}`);
    } catch (error) {
      console.error(`❌ [FTP] Error al subir Excel ${remotePath}:`, error);
      throw new Error(`Error al subir Excel: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sube un archivo cualquiera al FTP (crea directorios remotos si no existen).
   * Útil para etiquetas, imágenes, etc.
   */
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    try {
      if (!fs.existsSync(localPath)) {
        throw new Error(`Archivo local no existe: ${localPath}`);
      }

      const remoteDir = path.dirname(remotePath);
      const remoteFileName = path.basename(remotePath);

      try {
        await this.client.cd(remoteDir);
      } catch {
        const dirs = remoteDir.split('/').filter(d => d);
        let currentPath = '';
        for (const dir of dirs) {
          currentPath += `/${dir}`;
          try {
            await this.client.cd(currentPath);
          } catch {
            await this.client.ensureDir(currentPath);
          }
        }
      }

      await this.client.uploadFrom(localPath, remoteFileName);
      console.log(`✅ [FTP] Subido archivo: ${localPath} → ${remotePath}`);
    } catch (error) {
      console.error(`❌ [FTP] Error al subir archivo ${remotePath}:`, error);
      throw new Error(`Error al subir archivo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Lista archivos en un directorio remoto
   */
  async listFiles(remotePath: string): Promise<FileInfo[]> {
    try {
      await this.client.cd(remotePath);
      const files = await this.client.list();
      
      // Filtrar solo archivos (no directorios)
      const fileList = files.filter(file => file.isFile);
      
      console.log(`📁 [FTP] Encontrados ${fileList.length} archivo(s) en ${remotePath}`);
      return fileList;
    } catch (error) {
      console.error(`❌ [FTP] Error al listar archivos en ${remotePath}:`, error);
      throw new Error(`Error al listar archivos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Borra un archivo del FTP
   */
  async deleteFile(remotePath: string): Promise<void> {
    try {
      const remoteDir = path.dirname(remotePath);
      const remoteFileName = path.basename(remotePath);
      
      // Cambiar al directorio remoto
      await this.client.cd(remoteDir);
      
      // Borrar el archivo
      await this.client.remove(remoteFileName);
      
      console.log(`✅ [FTP] Archivo borrado: ${remotePath}`);
    } catch (error) {
      console.error(`❌ [FTP] Error al borrar archivo ${remotePath}:`, error);
      throw new Error(`Error al borrar archivo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export default new FTPService();
