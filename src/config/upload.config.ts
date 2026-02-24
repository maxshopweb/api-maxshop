/**
 * Configuración centralizada de subida de archivos (imágenes).
 * Cambiar aquí paths o límites afecta a todo el módulo de upload.
 */

import path from 'path';

/** Ruta base en disco para archivos servidos públicamente (ej. /opt/files). */
export const UPLOAD_ROOT =
  process.env.UPLOAD_ROOT ?? path.join(process.cwd(), '..', 'files');

/** URL base para servir archivos (ej. https://files.maxshop.com.ar). */
export const FILES_BASE_URL = process.env.FILES_BASE_URL ?? 'https://files.maxshop.com.ar';

/**
 * Construye la URL pública de un archivo a partir del path relativo.
 * Codifica espacios y caracteres especiales (paths con espacios desde FTP/CSV).
 * Normaliza la extensión del archivo a minúsculas para coincidir con los archivos en FTP.
 */
export function buildImageUrl(path: string | null | undefined): string {
  if (!path || typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  let normalized = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  // Extensión en minúsculas para que la URL coincida con archivos en FTP (.PNG/.JPG en BD → .png/.jpg en URL)
  normalized = normalized.replace(/\.[a-zA-Z0-9]+$/, (ext) => ext.toLowerCase());
  const encoded = normalized
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const base = FILES_BASE_URL.replace(/\/$/, '');
  return `${base}/${encoded}`;
}

/** Tamaño máximo por archivo en bytes (5 MB). */
export const UPLOAD_MAX_FILE_SIZE = 5 * 1024 * 1024;

/** MIME types permitidos (validación por magic bytes en utils). */
export const UPLOAD_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Extensiones permitidas (derivadas del MIME). */
export const UPLOAD_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

/** Máximo de imágenes que un usuario puede subir por día (productos + banners). */
export const UPLOAD_MAX_PER_DAY = 150;

/** Acción usada en auditoría para contar uploads por día. */
export const UPLOAD_AUDIT_ACTION = 'UPLOAD_IMAGE';

/** Nombre del campo en multipart para la imagen. */
export const UPLOAD_FIELD_NAME = 'image';

/** Tamaño máximo para banners en bytes (2 MB — imágenes de hero, deben ser ligeras). */
export const UPLOAD_BANNER_MAX_FILE_SIZE = 2 * 1024 * 1024;

/** Máximo de banners permitidos por tipo (desktop/mobile). */
export const BANNERS_MAX_PER_TYPE = 5;
