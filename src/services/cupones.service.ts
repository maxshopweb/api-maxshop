/**
 * Cupones de descuento de pedido (checkout).
 * Distintos de la bonificación de producto: no modifican líneas ni envío.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import {
  CUPON_CANJE_APLICADO,
  CUPON_CANJE_LIBERADO,
  CUPON_TIPO_PORCENTAJE,
  CreateCuponDTO,
  ICupon,
  ICuponAplicado,
  ICuponCanje,
  ICuponValidacionResult,
  UpdateCuponDTO,
} from '../types/cupones.type';
import {
  normalizeCodigo,
  validateCuponAgainstSubtotal,
} from './cupones.calc';

type TxClient = Prisma.TransactionClient;

function mapCupon(row: any): ICupon {
  return {
    id_cupon: row.id_cupon,
    codigo: row.codigo,
    tipo: row.tipo,
    valor: Number(row.valor),
    monto_minimo: Number(row.monto_minimo),
    usos_maximos: row.usos_maximos,
    usos_actuales: row.usos_actuales,
    fecha_inicio: row.fecha_inicio ?? null,
    fecha_fin: row.fecha_fin ?? null,
    activo: !!row.activo,
    creado_en: row.creado_en,
    actualizado_en: row.actualizado_en,
  };
}

class CuponesService {
  normalizeCodigo = normalizeCodigo;

  async list(): Promise<ICupon[]> {
    const rows = await prisma.cupones.findMany({
      orderBy: { id_cupon: 'desc' },
    });
    return rows.map(mapCupon);
  }

  async getById(id: number): Promise<ICupon | null> {
    const row = await prisma.cupones.findUnique({ where: { id_cupon: id } });
    return row ? mapCupon(row) : null;
  }

  async create(dto: CreateCuponDTO): Promise<ICupon> {
    const codigo = normalizeCodigo(dto.codigo);
    if (!codigo) {
      throw Object.assign(new Error('El código es obligatorio'), { statusCode: 400 });
    }
    const existing = await prisma.cupones.findFirst({
      where: { codigo: { equals: codigo, mode: 'insensitive' } },
    });
    if (existing) {
      throw Object.assign(new Error('Ya existe un cupón con ese código'), { statusCode: 400 });
    }
    const created = await prisma.cupones.create({
      data: {
        codigo,
        tipo: dto.tipo,
        valor: dto.valor,
        monto_minimo: dto.monto_minimo ?? 0,
        usos_maximos: dto.usos_maximos ?? 1,
        usos_actuales: 0,
        fecha_inicio: dto.fecha_inicio ?? null,
        fecha_fin: dto.fecha_fin ?? null,
        activo: dto.activo ?? true,
      },
    });
    return mapCupon(created);
  }

  async update(id: number, dto: UpdateCuponDTO): Promise<ICupon> {
    const current = await prisma.cupones.findUnique({ where: { id_cupon: id } });
    if (!current) {
      throw Object.assign(new Error('Cupón no encontrado'), { statusCode: 404 });
    }

    const codigoFinal =
      dto.codigo != null ? normalizeCodigo(dto.codigo) : current.codigo;
    if (!codigoFinal) {
      throw Object.assign(new Error('El código no puede estar vacío'), { statusCode: 400 });
    }
    if (codigoFinal !== current.codigo) {
      const dup = await prisma.cupones.findFirst({
        where: {
          codigo: { equals: codigoFinal, mode: 'insensitive' },
          NOT: { id_cupon: id },
        },
      });
      if (dup) {
        throw Object.assign(new Error('Ya existe otro cupón con ese código'), {
          statusCode: 400,
        });
      }
    }

    const tipoFinal = dto.tipo ?? current.tipo;
    const valorFinal = dto.valor != null ? dto.valor : Number(current.valor);
    if (tipoFinal === CUPON_TIPO_PORCENTAJE && valorFinal > 100) {
      throw Object.assign(new Error('El porcentaje no puede ser mayor a 100'), {
        statusCode: 400,
      });
    }

    const usosMax =
      dto.usos_maximos != null ? dto.usos_maximos : current.usos_maximos;
    if (usosMax < current.usos_actuales) {
      throw Object.assign(
        new Error('Usos máximos no puede ser menor que los usos actuales'),
        { statusCode: 400 }
      );
    }

    const fechaIn =
      dto.fecha_inicio !== undefined ? dto.fecha_inicio : current.fecha_inicio;
    const fechaFi =
      dto.fecha_fin !== undefined ? dto.fecha_fin : current.fecha_fin;
    if (fechaIn && fechaFi && new Date(fechaIn) > new Date(fechaFi)) {
      throw Object.assign(
        new Error('fecha_inicio no puede ser posterior a fecha_fin'),
        { statusCode: 400 }
      );
    }

    const updated = await prisma.cupones.update({
      where: { id_cupon: id },
      data: {
        codigo: codigoFinal,
        tipo: tipoFinal,
        valor: valorFinal,
        monto_minimo:
          dto.monto_minimo != null ? dto.monto_minimo : current.monto_minimo,
        usos_maximos: usosMax,
        fecha_inicio: fechaIn,
        fecha_fin: fechaFi,
        activo: dto.activo != null ? dto.activo : current.activo,
        actualizado_en: new Date(),
      },
    });
    return mapCupon(updated);
  }

  async toggle(id: number): Promise<ICupon> {
    const current = await prisma.cupones.findUnique({ where: { id_cupon: id } });
    if (!current) {
      throw Object.assign(new Error('Cupón no encontrado'), { statusCode: 404 });
    }
    const updated = await prisma.cupones.update({
      where: { id_cupon: id },
      data: { activo: !current.activo, actualizado_en: new Date() },
    });
    return mapCupon(updated);
  }

  async listCanjes(idCupon: number, limit = 30): Promise<ICuponCanje[]> {
    const cupon = await prisma.cupones.findUnique({ where: { id_cupon: idCupon } });
    if (!cupon) {
      throw Object.assign(new Error('Cupón no encontrado'), { statusCode: 404 });
    }
    const rows = await prisma.cupon_canjes.findMany({
      where: { id_cupon: idCupon },
      orderBy: { creado_en: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
      include: {
        venta: { select: { cod_interno: true } },
      },
    });
    return rows.map((r) => ({
      id_canje: r.id_canje,
      id_cupon: r.id_cupon,
      id_venta: r.id_venta,
      monto_aplicado: Number(r.monto_aplicado),
      estado: r.estado as ICuponCanje['estado'],
      creado_en: r.creado_en,
      liberado_en: r.liberado_en,
      cod_interno: r.venta?.cod_interno ?? null,
    }));
  }

  /**
   * Validación pública / previa al checkout.
   * No revela usos ni vigencia interna más allá del mensaje.
   */
  async validatePublic(
    codigo: string,
    subtotalProductos: number
  ): Promise<ICuponValidacionResult> {
    const normalized = normalizeCodigo(codigo);
    if (!normalized) {
      return { valid: false, message: 'Código de cupón inválido' };
    }
    const row = await prisma.cupones.findFirst({
      where: { codigo: normalized, activo: true },
    });
    if (!row) {
      return { valid: false, message: 'Cupón no encontrado o no válido' };
    }
    return validateCuponAgainstSubtotal(mapCupon(row), subtotalProductos);
  }

  /**
   * Revalida y prepara el cupón para persistir en la venta.
   * Lanza si el código no es aplicable.
   */
  async resolveForCheckout(
    codigo: string | null | undefined,
    subtotalProductos: number
  ): Promise<ICuponAplicado | null> {
    const normalized = normalizeCodigo(codigo);
    if (!normalized) return null;

    const row = await prisma.cupones.findFirst({
      where: { codigo: normalized },
    });
    if (!row) {
      throw Object.assign(new Error('Cupón no encontrado o no válido'), {
        statusCode: 400,
      });
    }
    const result = validateCuponAgainstSubtotal(mapCupon(row), subtotalProductos);
    if (!result.valid || result.id_cupon == null || result.monto_descuento == null) {
      throw Object.assign(new Error(result.message || 'Cupón inválido'), {
        statusCode: 400,
      });
    }
    return {
      id_cupon: result.id_cupon,
      codigo: result.codigo!,
      tipo: result.tipo!,
      valor: result.valor!,
      monto_descuento: result.monto_descuento,
    };
  }

  /**
   * Consume cupón + inserta canje en la transacción de venta.
   * Un solo UPDATE condicional (sin doble incremento).
   */
  async redeemAtomically(
    tx: TxClient,
    cupon: ICuponAplicado,
    idVenta: number
  ): Promise<void> {
    const affected = await tx.$executeRaw`
      UPDATE cupones
      SET usos_actuales = usos_actuales + 1,
          actualizado_en = NOW()
      WHERE id_cupon = ${cupon.id_cupon}
        AND activo = true
        AND usos_actuales < usos_maximos
    `;
    if (Number(affected) === 0) {
      throw Object.assign(
        new Error('Este cupón ya no tiene usos disponibles'),
        { statusCode: 409 }
      );
    }
    await tx.cupon_canjes.create({
      data: {
        id_cupon: cupon.id_cupon,
        id_venta: idVenta,
        monto_aplicado: cupon.monto_descuento,
        estado: CUPON_CANJE_APLICADO,
      },
    });
  }

  /**
   * Libera el canje de una venta cancelada (una sola vez).
   * Idempotente: si ya está liberado, no hace nada.
   */
  async releaseForVenta(
    idVenta: number,
    tx?: TxClient
  ): Promise<boolean> {
    const client = tx ?? prisma;
    const canje = await client.cupon_canjes.findUnique({
      where: { id_venta: idVenta },
    });
    if (!canje || canje.estado !== CUPON_CANJE_APLICADO) {
      return false;
    }

    const doRelease = async (c: TxClient) => {
      const updated = await c.cupon_canjes.updateMany({
        where: {
          id_canje: canje.id_canje,
          estado: CUPON_CANJE_APLICADO,
        },
        data: {
          estado: CUPON_CANJE_LIBERADO,
          liberado_en: new Date(),
        },
      });
      if (updated.count === 0) return false;

      await c.$executeRaw`
        UPDATE cupones
        SET usos_actuales = GREATEST(usos_actuales - 1, 0),
            actualizado_en = NOW()
        WHERE id_cupon = ${canje.id_cupon}
      `;
      return true;
    };

    if (tx) {
      return doRelease(tx);
    }
    return prisma.$transaction(async (inner) => doRelease(inner));
  }
}

export const cuponesService = new CuponesService();
