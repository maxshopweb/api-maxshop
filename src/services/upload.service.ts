/**
 * Servicio de subida de imágenes: productos y banners.
 * Valida tamaño, tipo (magic bytes), límite diario por usuario y persiste en disco.
 * En BD se guarda solo el path relativo (ej. productos/123/123.jpg).
 */

import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../index';
import { auditService } from './audit.service';
import cacheService from './cache.service';
import {
  UPLOAD_ROOT,
  UPLOAD_MAX_FILE_SIZE,
  UPLOAD_MAX_PER_DAY,
  UPLOAD_AUDIT_ACTION,
} from '../config/upload.config';
import {
  getMimeAndExtensionFromBuffer,
  buildProductImagePath,
  buildProductSecondaryImagePath,
  buildBannerPath,
  getNextBannerIndex,
  getNextProductSecondaryIndex,
} from '../utils/upload.utils';

export class UploadService {
  /**
   * Cuenta cuántas imágenes subió el usuario hoy (auditoría).
   */
  private async getTodayUploadCount(userId: string): Promise<number> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return prisma.auditoria.count({
      where: {
        id_usuario: userId,
        accion: UPLOAD_AUDIT_ACTION,
        fecha: { gte: startOfDay },
      },
    });
  }

  /**
   * Verifica que el usuario no supere el límite diario de uploads.
   */
  private async checkDailyLimit(userId: string): Promise<void> {
    const count = await this.getTodayUploadCount(userId);
    if (count >= UPLOAD_MAX_PER_DAY) {
      const err = new Error('Límite diario de subida de imágenes alcanzado.');
      (err as any).statusCode = 429;
      throw err;
    }
  }

  /**
   * Registra el upload en auditoría (para límite diario y trazabilidad). Solo admin; respeta ENABLE_ADMIN_AUDIT.
   */
  private async recordUpload(
    userId: string,
    description: string,
    tableAffected: string,
    currentData?: Record<string, unknown>,
    previousData?: Record<string, unknown> | null
  ): Promise<void> {
    await auditService.record({
      action: UPLOAD_AUDIT_ACTION,
      table: tableAffected,
      description,
      userId,
      status: 'SUCCESS',
      previousData: previousData ?? undefined,
      currentData,
      adminAudit: true,
    });
  }

  /**
   * Sube la imagen principal de un producto.
   * Crea la carpeta productos/[id_prod], guarda el archivo como [id_prod].[ext],
   * actualiza producto.img_principal con el path relativo e invalida cache.
   */
  async uploadProductImage(
    idProd: number,
    file: Express.Multer.File,
    userId: string
  ): Promise<{ path: string }> {
    const product = await prisma.productos.findFirst({
      where: { id_prod: idProd, estado: { not: 0 } },
    });
    if (!product) {
      const err = new Error('Producto no encontrado o inactivo.');
      (err as any).statusCode = 404;
      throw err;
    }

    await this.checkDailyLimit(userId);

    if (!file.buffer || file.size > UPLOAD_MAX_FILE_SIZE) {
      const err = new Error('Archivo inválido o supera el tamaño máximo permitido.');
      (err as any).statusCode = 400;
      throw err;
    }

    const mimeExt = getMimeAndExtensionFromBuffer(file.buffer);
    if (!mimeExt) {
      const err = new Error('Formato de imagen no permitido. Use JPEG, PNG o WebP.');
      (err as any).statusCode = 400;
      throw err;
    }

    const relativePath = buildProductImagePath(idProd, mimeExt.ext);
    const absoluteDir = path.join(UPLOAD_ROOT, 'productos', String(idProd));
    const absolutePath = path.join(absoluteDir, `${idProd}${mimeExt.ext}`);

    await fs.mkdir(absoluteDir, { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);

    const previousImg = product.img_principal;

    await prisma.productos.update({
      where: { id_prod: idProd },
      data: { img_principal: relativePath, actualizado_en: new Date() },
    });

    await this.recordUpload(
      userId,
      `Imagen principal producto ${idProd}`,
      'productos',
      { id_prod: idProd, path: relativePath },
      previousImg != null ? { id_prod: idProd, img_principal: previousImg } : null
    );

    await cacheService.deletePattern('productos:*');
    await cacheService.delete(`producto:${idProd}`);
    await cacheService.delete(`producto:codigo:${product.codi_arti}`);
    await cacheService.deletePattern('productos:destacados:*');
    await cacheService.delete('productos:stock-bajo');
    await cacheService.deletePattern('productos:con-imagenes:*');

    return { path: relativePath };
  }

  /**
   * Sube una imagen secundaria de producto (posición 2, 3, ...).
   * Guarda como [id_prod]_[N].[ext], appendea el path a producto.imagenes (JSON) y devuelve el path.
   */
  async uploadProductSecondaryImage(
    idProd: number,
    file: Express.Multer.File,
    userId: string
  ): Promise<{ path: string }> {
    const product = await prisma.productos.findFirst({
      where: { id_prod: idProd, estado: { not: 0 } },
    });
    if (!product) {
      const err = new Error('Producto no encontrado o inactivo.');
      (err as any).statusCode = 404;
      throw err;
    }

    await this.checkDailyLimit(userId);

    if (!file.buffer || file.size > UPLOAD_MAX_FILE_SIZE) {
      const err = new Error('Archivo inválido o supera el tamaño máximo permitido.');
      (err as any).statusCode = 400;
      throw err;
    }

    const mimeExt = getMimeAndExtensionFromBuffer(file.buffer);
    if (!mimeExt) {
      const err = new Error('Formato de imagen no permitido. Use JPEG, PNG o WebP.');
      (err as any).statusCode = 400;
      throw err;
    }

    const index = await getNextProductSecondaryIndex(idProd);
    const relativePath = buildProductSecondaryImagePath(idProd, index, mimeExt.ext);
    const absoluteDir = path.join(UPLOAD_ROOT, 'productos', String(idProd));
    const absolutePath = path.join(absoluteDir, `${idProd}_${index}${mimeExt.ext}`);

    await fs.mkdir(absoluteDir, { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);

    const currentImagenes = Array.isArray(product.imagenes) ? (product.imagenes as string[]) : [];
    const newImagenes = [...currentImagenes, relativePath];

    await prisma.productos.update({
      where: { id_prod: idProd },
      data: { imagenes: newImagenes, actualizado_en: new Date() },
    });

    await this.recordUpload(
      userId,
      `Imagen secundaria producto ${idProd}`,
      'productos',
      { id_prod: idProd, path: relativePath, index, imagenes: newImagenes },
      { id_prod: idProd, imagenes: currentImagenes }
    );

    await cacheService.deletePattern('productos:*');
    await cacheService.delete(`producto:${idProd}`);
    await cacheService.delete(`producto:codigo:${product.codi_arti}`);
    await cacheService.deletePattern('productos:destacados:*');
    await cacheService.delete('productos:stock-bajo');
    await cacheService.deletePattern('productos:con-imagenes:*');

    return { path: relativePath };
  }

  /**
   * Sube un banner. Nombre en disco: banner-1, banner-2, ...
   * No actualiza ninguna tabla de eventos; solo devuelve el path para que el front/otro endpoint lo asocie.
   */
  async uploadBanner(file: Express.Multer.File, userId: string): Promise<{ path: string }> {
    await this.checkDailyLimit(userId);

    if (!file.buffer || file.size > UPLOAD_MAX_FILE_SIZE) {
      const err = new Error('Archivo inválido o supera el tamaño máximo permitido.');
      (err as any).statusCode = 400;
      throw err;
    }

    const mimeExt = getMimeAndExtensionFromBuffer(file.buffer);
    if (!mimeExt) {
      const err = new Error('Formato de imagen no permitido. Use JPEG, PNG o WebP.');
      (err as any).statusCode = 400;
      throw err;
    }

    const index = await getNextBannerIndex();
    const relativePath = buildBannerPath(index, mimeExt.ext);
    const bannersDir = path.join(UPLOAD_ROOT, 'banners');
    const absolutePath = path.join(bannersDir, `banner-${index}${mimeExt.ext}`);

    await fs.mkdir(bannersDir, { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);

    await this.recordUpload(userId, `Banner ${index}`, 'banners', { path: relativePath });

    return { path: relativePath };
  }
}

export const uploadService = new UploadService();
