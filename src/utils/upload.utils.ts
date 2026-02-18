/**
 * Utilidades para upload de imágenes: validación por magic bytes y construcción de paths.
 * Los paths devueltos son relativos (ej. productos/123/123.jpg) para guardar en BD.
 */

import fs from 'fs/promises';
import path from 'path';
import {
  UPLOAD_ALLOWED_MIMES,
  UPLOAD_ALLOWED_EXTENSIONS,
  UPLOAD_ROOT,
} from '../config/upload.config';

/** Resultado de detectar tipo por magic bytes. */
export type MimeAndExtension = { mime: (typeof UPLOAD_ALLOWED_MIMES)[number]; ext: string } | null;

/** Magic bytes por tipo (inicio del buffer). */
const MAGIC: Array<{ mime: (typeof UPLOAD_ALLOWED_MIMES)[number]; ext: string; bytes: number[] }> = [
  { mime: 'image/jpeg', ext: '.jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: '.png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  {
    mime: 'image/webp',
    ext: '.webp',
    bytes: [0x52, 0x49, 0x46, 0x46], // RIFF; luego a +4 debe seguir WEBP
  },
];

/**
 * Detecta MIME y extensión por magic bytes del buffer (no confía en Content-Type del request).
 * Devuelve null si el tipo no está permitido.
 */
export function getMimeAndExtensionFromBuffer(buffer: Buffer): MimeAndExtension {
  if (!buffer || buffer.length < 12) return null;
  for (const { mime, ext, bytes } of MAGIC) {
    if (bytes.length > buffer.length) continue;
    const match = bytes.every((b, i) => buffer[i] === b);
    if (!match) continue;
    if (mime === 'image/webp') {
      const riff = buffer.toString('ascii', 8, 12);
      if (riff !== 'WEBP') continue;
    }
    return { mime, ext };
  }
  return null;
}

/**
 * Path relativo para imagen de producto (para guardar en BD).
 * Formato: productos/[id_prod]/[id_prod].[ext]
 */
export function buildProductImagePath(idProd: number, extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const filename = `${idProd}${ext}`;
  return path.join('productos', String(idProd), filename).split(path.sep).join('/');
}

/**
 * Path relativo para imagen secundaria de producto (para guardar en BD, campo imagenes).
 * Formato: productos/[id_prod]/[id_prod]_[N].[ext] (N = 2, 3, ...)
 */
export function buildProductSecondaryImagePath(
  idProd: number,
  index: number,
  extension: string
): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const filename = `${idProd}_${index}${ext}`;
  return path.join('productos', String(idProd), filename).split(path.sep).join('/');
}

/**
 * Path relativo para banner (para guardar en BD o respuesta).
 * Formato: banners/banner-[N].[ext]
 */
export function buildBannerPath(index: number, extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return `banners/banner-${index}${ext}`;
}

/**
 * Obtiene el siguiente índice para banner (banner-1, banner-2, ...) leyendo la carpeta en disco.
 * Si la carpeta no existe o está vacía, devuelve 1.
 */
export async function getNextBannerIndex(): Promise<number> {
  const bannersDir = path.join(UPLOAD_ROOT, 'banners');
  try {
    await fs.mkdir(bannersDir, { recursive: true });
  } catch {
    // ya existe
  }
  let maxN = 0;
  try {
    const entries = await fs.readdir(bannersDir, { withFileTypes: true });
    const bannerRegex = /^banner-(\d+)\.(jpg|jpeg|png|webp)$/i;
    for (const e of entries) {
      if (!e.isFile()) continue;
      const m = e.name.match(bannerRegex);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
  } catch {
    // directorio vacío o no existe
  }
  return maxN + 1;
}

/**
 * Obtiene el siguiente índice para imagen secundaria de producto (2, 3, ...).
 * Lee la carpeta productos/[id_prod] y busca archivos [id]_N.ext.
 */
export async function getNextProductSecondaryIndex(idProd: number): Promise<number> {
  const productDir = path.join(UPLOAD_ROOT, 'productos', String(idProd));
  let maxN = 1;
  try {
    const entries = await fs.readdir(productDir, { withFileTypes: true });
    const regex = new RegExp(`^${idProd}_(\\d+)\\.(jpg|jpeg|png|webp)$`, 'i');
    for (const e of entries) {
      if (!e.isFile()) continue;
      const m = e.name.match(regex);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
  } catch {
    // directorio no existe o vacío
  }
  return maxN + 1;
}

/**
 * Comprueba que la extensión esté en la whitelist de permitidas.
 */
export function isAllowedExtension(ext: string): boolean {
  const normalized = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return (UPLOAD_ALLOWED_EXTENSIONS as readonly string[]).includes(normalized);
}
