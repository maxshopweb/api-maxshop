import { Prisma } from '@prisma/client';
import type { IVenta } from '../types';

export type RetiroFilter = 'sin_aviso' | 'avisado_sin_retirar' | 'retirado';

/**
 * Misma heurística que AndreaniHandler: retiro no genera envío Andreani.
 */
export function isVentaRetiroEnTienda(observaciones: string | null | undefined): boolean {
    const o = observaciones?.toLowerCase() ?? '';
    return o.includes('retiro en tienda') || o.includes('tipo: retiro');
}

/** Condición Prisma: venta con retiro en tienda (observaciones). */
export function ventaRetiroEnTiendaWhereInput(): Prisma.ventaWhereInput {
    return {
        OR: [
            { observaciones: { contains: 'retiro en tienda', mode: 'insensitive' } },
            { observaciones: { contains: 'tipo: retiro', mode: 'insensitive' } },
        ],
    };
}

/** Aplica filtro operativo de retiro en tienda sobre un where existente. */
export function applyRetiroFilterToWhere(
    whereClause: Prisma.ventaWhereInput,
    retiro: RetiroFilter
): void {
    const retiroBase = ventaRetiroEnTiendaWhereInput();
    const andParts: Prisma.ventaWhereInput[] = Array.isArray(whereClause.AND)
        ? [...whereClause.AND]
        : whereClause.AND
          ? [whereClause.AND]
          : [];

    andParts.push(retiroBase);

    if (retiro === 'sin_aviso') {
        andParts.push(
            { estado_pago: 'aprobado' },
            { listo_retiro_avisado_en: null },
            { retirado_en: null }
        );
    } else if (retiro === 'avisado_sin_retirar') {
        andParts.push(
            { estado_pago: 'aprobado' },
            { listo_retiro_avisado_en: { not: null } },
            { retirado_en: null }
        );
    } else if (retiro === 'retirado') {
        andParts.push({ retirado_en: { not: null } });
    }

    whereClause.AND = andParts;
}

/**
 * Datos mínimos del cliente para crear envío (alineado con andreani.preenvio.service).
 * Si es retiro en tienda, no aplica.
 */
export function assertClienteDireccionCompletaParaEnvio(venta: IVenta, contexto: string): void {
    if (isVentaRetiroEnTienda(venta.observaciones)) {
        return;
    }
    if (!venta.cliente) {
        throw new Error(`${contexto}: la venta no tiene cliente asociado.`);
    }
    const direccion = venta.cliente.direccion?.trim();
    const ciudad = venta.cliente.ciudad?.trim();
    const cp = venta.cliente.cod_postal != null ? String(venta.cliente.cod_postal).trim() : '';

    if (!direccion) {
        throw new Error(
            `${contexto}: completá la dirección del cliente (calle) antes de confirmar el envío.`
        );
    }
    if (!ciudad) {
        throw new Error(
            `${contexto}: completá la ciudad del cliente antes de confirmar el envío.`
        );
    }
    if (!cp || cp === '0' || cp === '0000') {
        throw new Error(
            `${contexto}: completá un código postal válido del cliente antes de confirmar el envío.`
        );
    }
}
