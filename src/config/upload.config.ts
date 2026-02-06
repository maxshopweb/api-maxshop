/**
 * Configuración centralizada de subida de archivos (imágenes).
 * Cambiar aquí paths o límites afecta a todo el módulo de upload.
 */

import path from 'path';

/** Ruta base en disco (hermana de la API en el VPS). Puede ser absoluta o relativa a process.cwd(). */
export const UPLOAD_ROOT =
  process.env.UPLOAD_ROOT ?? path.join(process.cwd(), '..', 'files');

/** Prefijo de ruta que se guarda en BD y se concatena con FILES_BASE_URL en el front. */
export const FILES_PATH_PREFIX = 'files';

/** URL base para servir archivos (ej. https://files.maxshop.com.ar). El front concatena esta URL + path de BD. */
export const FILES_BASE_URL = process.env.FILES_BASE_URL ?? 'https://files.maxshop.com.ar';

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
