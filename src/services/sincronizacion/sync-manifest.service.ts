/**
 * Servicio de manifest para sync incremental FTP.
 * Guarda el estado conocido de los archivos .dbf (size, modifiedAt) y permite
 * comparar con el listado actual del FTP para detectar archivos nuevos o modificados.
 * Etapa 1: lectura/escritura y comparación. Etapa 6: claves en mayúsculas (case-insensitive).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FileInfo } from 'basic-ftp';
import type { SyncManifest, SyncManifestEntry } from '../../types/sincronizacion.types';

const MANIFEST_FILENAME = 'sync-manifest.json';

export class SyncManifestService {
  private readonly manifestPath: string;

  constructor(csvOutputDir: string) {
    this.manifestPath = path.join(csvOutputDir, MANIFEST_FILENAME);
  }

  /**
   * Ruta del archivo manifest en disco.
   */
  getManifestPath(): string {
    return this.manifestPath;
  }

  /**
   * Lee el manifest desde disco.
   * @returns El manifest o null si no existe o está mal formado (considerar "sin manifest").
   */
  readManifest(): SyncManifest | null {
    try {
      if (!fs.existsSync(this.manifestPath)) {
        return null;
      }
      const raw = fs.readFileSync(this.manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      const entries = parsed as Record<string, unknown>;
      const manifest: SyncManifest = {};
      for (const [name, value] of Object.entries(entries)) {
        if (value && typeof value === 'object' && 'size' in value && typeof (value as any).size === 'number') {
          const v = value as { size: number; modifiedAt?: string };
          manifest[name] = { size: v.size };
          if (typeof v.modifiedAt === 'string') {
            manifest[name].modifiedAt = v.modifiedAt;
          }
        }
      }
      return manifest;
    } catch {
      return null;
    }
  }

  /**
   * Escribe el manifest completo en disco.
   * Asegura que el directorio exista.
   */
  writeManifest(manifest: SyncManifest): void {
    const dir = path.dirname(this.manifestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  /**
   * Construye un manifest a partir del listado actual del FTP (FileInfo[]).
   * Usa size y, si está disponible, modifiedAt (ISO) o rawModifiedAt.
   * Claves en MAYÚSCULAS para comparación case-insensitive (Etapa 6).
   */
  buildManifestFromFtpFiles(ftpFiles: FileInfo[]): SyncManifest {
    const manifest: SyncManifest = {};
    for (const file of ftpFiles) {
      const entry: SyncManifestEntry = { size: file.size ?? 0 };
      if (file.modifiedAt instanceof Date) {
        entry.modifiedAt = file.modifiedAt.toISOString();
      } else if (file.rawModifiedAt && typeof file.rawModifiedAt === 'string') {
        entry.modifiedAt = file.rawModifiedAt;
      }
      manifest[file.name.toUpperCase()] = entry;
    }
    return manifest;
  }

  /**
   * Compara el listado actual del FTP con el manifest y devuelve los nombres
   * de archivos .dbf que están nuevos o modificados.
   * @param ftpFiles Listado actual del FTP (listDBFFiles).
   * @param manifest Manifest leído (readManifest()); si es null, se consideran todos como cambiados.
   * @returns Lista de nombres de archivos .dbf a procesar.
   */
  getArchivosCambiados(ftpFiles: FileInfo[], manifest: SyncManifest | null): string[] {
    if (!manifest || Object.keys(manifest).length === 0) {
      return ftpFiles.map((f) => f.name);
    }
    const cambiados: string[] = [];
    for (const file of ftpFiles) {
      const manifestKey = Object.keys(manifest).find((k) => k.toUpperCase() === file.name.toUpperCase());
      const entry = manifestKey ? manifest[manifestKey] : undefined;
      const size = file.size ?? 0;
      if (!entry) {
        cambiados.push(file.name);
        continue;
      }
      if (entry.size !== size) {
        cambiados.push(file.name);
        continue;
      }
      const modifiedAtFtp =
        file.modifiedAt instanceof Date
          ? file.modifiedAt.toISOString()
          : file.rawModifiedAt && typeof file.rawModifiedAt === 'string'
            ? file.rawModifiedAt
            : undefined;
      if (entry.modifiedAt !== undefined && modifiedAtFtp !== undefined && entry.modifiedAt !== modifiedAtFtp) {
        cambiados.push(file.name);
      }
    }
    return cambiados;
  }
}
