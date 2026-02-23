/**
 * Servicio de banners: CRUD completo con upload de imagen, activar/desactivar y reordenamiento.
 * Máximo 5 banners por tipo (desktop/mobile). Imagen validada por magic bytes, límite 2 MB.
 * Al reemplazar o eliminar, borra el archivo anterior del disco.
 */

import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../index';
import { auditService } from './audit.service';
import {
  UPLOAD_ROOT,
  UPLOAD_BANNER_MAX_FILE_SIZE,
  BANNERS_MAX_PER_TYPE,
  UPLOAD_AUDIT_ACTION,
} from '../config/upload.config';
import { getMimeAndExtensionFromBuffer } from '../utils/upload.utils';

export class BannersService {
  /** Lista banners públicos: solo activos con imagen, ordenados por posición. */
  async getPublicBanners(tipo?: string) {
    return prisma.banners.findMany({
      where: {
        activo: true,
        path_img: { not: null },
        ...(tipo ? { tipo } : {}),
      },
      orderBy: { orden: 'asc' },
      select: { id: true, orden: true, tipo: true, path_img: true, link: true },
    });
  }

  /** Lista todos los banners para el panel admin (activos e inactivos). */
  async getAdminBanners(tipo?: string) {
    return prisma.banners.findMany({
      where: tipo ? { tipo } : {},
      orderBy: [{ tipo: 'asc' }, { orden: 'asc' }],
    });
  }

  /** Crea un slot de banner (sin imagen). Valida límite de 5 y unicidad de orden+tipo. */
  async createBanner(
    data: { orden: number; tipo: string; link?: string },
    userId: string
  ) {
    if (!['desktop', 'mobile'].includes(data.tipo)) {
      const err = new Error('tipo debe ser "desktop" o "mobile".');
      (err as any).statusCode = 400;
      throw err;
    }
    if (data.orden < 1 || data.orden > BANNERS_MAX_PER_TYPE) {
      const err = new Error(`orden debe estar entre 1 y ${BANNERS_MAX_PER_TYPE}.`);
      (err as any).statusCode = 400;
      throw err;
    }

    const count = await prisma.banners.count({ where: { tipo: data.tipo } });
    if (count >= BANNERS_MAX_PER_TYPE) {
      const err = new Error(`Máximo ${BANNERS_MAX_PER_TYPE} banners por tipo.`);
      (err as any).statusCode = 400;
      throw err;
    }

    const exists = await prisma.banners.findUnique({
      where: { orden_tipo: { orden: data.orden, tipo: data.tipo } },
    });
    if (exists) {
      const err = new Error(
        `Ya existe un banner en la posición ${data.orden} para tipo "${data.tipo}".`
      );
      (err as any).statusCode = 409;
      throw err;
    }

    const banner = await prisma.banners.create({
      data: { orden: data.orden, tipo: data.tipo, link: data.link ?? null, activo: false },
    });

    await auditService.record({
      action: 'CREATE_BANNER',
      table: 'banners',
      description: `Banner creado id=${banner.id} tipo=${banner.tipo} orden=${banner.orden}`,
      userId,
      status: 'SUCCESS',
      currentData: banner as unknown as Record<string, unknown>,
      adminAudit: true,
    });

    return banner;
  }

  /** Sube o reemplaza la imagen de un banner. Valida 2 MB y magic bytes. Borra la anterior del disco. */
  async uploadBannerImage(
    id: number,
    file: Express.Multer.File,
    userId: string
  ) {
    const banner = await prisma.banners.findUnique({ where: { id } });
    if (!banner) {
      const err = new Error('Banner no encontrado.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (!file.buffer || file.size > UPLOAD_BANNER_MAX_FILE_SIZE) {
      const err = new Error(
        `Archivo inválido o supera los ${UPLOAD_BANNER_MAX_FILE_SIZE / 1024 / 1024} MB permitidos para banners.`
      );
      (err as any).statusCode = 400;
      throw err;
    }

    const mimeExt = getMimeAndExtensionFromBuffer(file.buffer);
    if (!mimeExt) {
      const err = new Error('Formato no permitido. Use JPEG, PNG o WebP.');
      (err as any).statusCode = 400;
      throw err;
    }

    const bannersDir = path.join(UPLOAD_ROOT, 'banners');
    await fs.mkdir(bannersDir, { recursive: true });

    // Borrar imagen anterior del disco si existe
    if (banner.path_img) {
      const oldAbs = path.join(UPLOAD_ROOT, banner.path_img);
      await fs.unlink(oldAbs).catch(() => {});
    }

    const filename = `banner-${banner.tipo}-${banner.orden}${mimeExt.ext}`;
    await fs.writeFile(path.join(bannersDir, filename), file.buffer);
    const relativePath = `banners/${filename}`;

    const updated = await prisma.banners.update({
      where: { id },
      data: { path_img: relativePath, actualizado_en: new Date() },
    });

    await auditService.record({
      action: UPLOAD_AUDIT_ACTION,
      table: 'banners',
      description: `Imagen subida banner id=${id} path=${relativePath}`,
      userId,
      status: 'SUCCESS',
      currentData: { id, path: relativePath } as Record<string, unknown>,
      previousData: banner.path_img ? ({ path: banner.path_img } as Record<string, unknown>) : undefined,
      adminAudit: true,
    });

    return updated;
  }

  /** Activa o desactiva un banner. No se puede activar sin imagen. */
  async toggleActivo(id: number, activo: boolean, userId: string) {
    const banner = await prisma.banners.findUnique({ where: { id } });
    if (!banner) {
      const err = new Error('Banner no encontrado.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (activo && !banner.path_img) {
      const err = new Error('No se puede activar un banner sin imagen cargada.');
      (err as any).statusCode = 400;
      throw err;
    }

    const updated = await prisma.banners.update({
      where: { id },
      data: { activo, actualizado_en: new Date() },
    });

    await auditService.record({
      action: activo ? 'ACTIVATE_BANNER' : 'DEACTIVATE_BANNER',
      table: 'banners',
      description: `Banner id=${id} ${activo ? 'activado' : 'desactivado'}`,
      userId,
      status: 'SUCCESS',
      currentData: { id, activo } as Record<string, unknown>,
      adminAudit: true,
    });

    return updated;
  }

  /**
   * Actualiza orden y/o link de un banner.
   * Si el nuevo orden ya está ocupado, hace swap automático entre los dos banners.
   */
  async updateBanner(
    id: number,
    data: { orden?: number; link?: string },
    userId: string
  ) {
    const banner = await prisma.banners.findUnique({ where: { id } });
    if (!banner) {
      const err = new Error('Banner no encontrado.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (data.orden !== undefined) {
      if (data.orden < 1 || data.orden > BANNERS_MAX_PER_TYPE) {
        const err = new Error(`orden debe estar entre 1 y ${BANNERS_MAX_PER_TYPE}.`);
        (err as any).statusCode = 400;
        throw err;
      }

      if (data.orden !== banner.orden) {
        const conflict = await prisma.banners.findUnique({
          where: { orden_tipo: { orden: data.orden, tipo: banner.tipo } },
        });
        if (conflict) {
          // Swap: el que estaba en la posición destino pasa a la posición origen
          await prisma.banners.update({
            where: { id: conflict.id },
            data: { orden: banner.orden, actualizado_en: new Date() },
          });
        }
      }
    }

    const updated = await prisma.banners.update({
      where: { id },
      data: {
        ...(data.orden !== undefined ? { orden: data.orden } : {}),
        ...(data.link !== undefined ? { link: data.link } : {}),
        actualizado_en: new Date(),
      },
    });

    await auditService.record({
      action: 'UPDATE_BANNER',
      table: 'banners',
      description: `Banner id=${id} actualizado`,
      userId,
      status: 'SUCCESS',
      currentData: updated as unknown as Record<string, unknown>,
      previousData: banner as unknown as Record<string, unknown>,
      adminAudit: true,
    });

    return updated;
  }

  /** Elimina un banner y su archivo en disco. */
  async deleteBanner(id: number, userId: string) {
    const banner = await prisma.banners.findUnique({ where: { id } });
    if (!banner) {
      const err = new Error('Banner no encontrado.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (banner.path_img) {
      await fs.unlink(path.join(UPLOAD_ROOT, banner.path_img)).catch(() => {});
    }

    await prisma.banners.delete({ where: { id } });

    await auditService.record({
      action: 'DELETE_BANNER',
      table: 'banners',
      description: `Banner id=${id} eliminado`,
      userId,
      status: 'SUCCESS',
      previousData: banner as unknown as Record<string, unknown>,
      adminAudit: true,
    });
  }
}

export const bannersService = new BannersService();
