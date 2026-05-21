/**
 * Cálculo unificado de precios (lista, bonificación, final con IVA).
 * Fuente de verdad para catálogo, ventas online y validación de checkout.
 */

import { roundMoney } from '../utils/money.utils';

export interface PrecioPresentacion {
    /** Precio de lista activa con IVA (antes de bonificación). */
    precioListaConIva: number;
    /** Precio final a pagar por unidad (con IVA, bonificación aplicada). */
    precioFinalConIva: number;
    /** Precio final sin IVA (para totales de venta). */
    precioSinIvaFinal: number;
    bonificacionPorcentaje: number | null;
    /** Monto descontado por bonificación en una unidad. */
    montoBonificacionUnitario: number;
    tieneBonificacion: boolean;
}

export function normalizeBonificacionPct(raw: unknown): number | null {
    if (raw == null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(100, Math.max(0, roundMoney(n)));
}

/** Aplica bonificación porcentual sobre precio con IVA. */
export function applyBonificacionToPrecio(
    precioListaConIva: number,
    bonificacionPct: number | null
): number {
    if (precioListaConIva <= 0) return 0;
    if (bonificacionPct == null || bonificacionPct <= 0) {
        return roundMoney(precioListaConIva);
    }
    return roundMoney(precioListaConIva * (1 - bonificacionPct / 100));
}

export function getMontoBonificacionUnitario(
    precioListaConIva: number,
    precioFinalConIva: number
): number {
    return roundMoney(Math.max(0, precioListaConIva - precioFinalConIva));
}

/**
 * Construye precios de presentación para catálogo y ventas.
 * @param precioListaConIva Precio de lista activa con IVA (sin bonificar).
 * @param bonificacionPctRaw bonificacion_porcentaje del producto o línea.
 * @param porcentajeIva Porcentaje de IVA (ej. 21).
 */
export function buildPrecioPresentacion(
    precioListaConIva: number | null | undefined,
    bonificacionPctRaw: unknown,
    porcentajeIva: number = 0
): PrecioPresentacion | null {
    if (precioListaConIva == null || !Number.isFinite(Number(precioListaConIva))) {
        return null;
    }
    const lista = roundMoney(Number(precioListaConIva));
    if (lista <= 0) return null;

    const bonificacionPorcentaje = normalizeBonificacionPct(bonificacionPctRaw);
    const precioFinalConIva = applyBonificacionToPrecio(lista, bonificacionPorcentaje);
    const factorIva = 1 + (Number.isFinite(porcentajeIva) ? porcentajeIva : 0) / 100;
    const precioSinIvaFinal =
        factorIva > 0 ? roundMoney(precioFinalConIva / factorIva) : precioFinalConIva;
    const montoBonificacionUnitario = getMontoBonificacionUnitario(lista, precioFinalConIva);

    return {
        precioListaConIva: lista,
        precioFinalConIva,
        precioSinIvaFinal,
        bonificacionPorcentaje,
        montoBonificacionUnitario,
        tieneBonificacion: montoBonificacionUnitario > 0,
    };
}

export interface LineaVentaPricingInput {
    precioListaConIva: number;
    bonificacionPctRaw: unknown;
    porcentajeIva: number;
    cantidad: number;
    descuentoManual?: number;
}

export interface LineaVentaPricingResult {
    presentacion: PrecioPresentacion;
    precioUnitarioLista: number;
    precioUnitarioFinal: number;
    descuentoBonificacionLinea: number;
    descuentoManual: number;
    descuentoAplicadoLinea: number;
    subTotalLinea: number;
    subTotalNetoLinea: number;
}

/** Totales de una línea de venta (online: bonificación explícita en descuento_aplicado). */
export function computeLineaVentaPricing(input: LineaVentaPricingInput): LineaVentaPricingResult {
    const presentacion = buildPrecioPresentacion(
        input.precioListaConIva,
        input.bonificacionPctRaw,
        input.porcentajeIva
    );
    if (!presentacion) {
        throw new Error('Precio de lista no disponible para calcular la línea');
    }

    const cantidad = input.cantidad > 0 ? input.cantidad : 1;
    const descuentoManual = roundMoney(Math.max(0, input.descuentoManual || 0));
    const descuentoBonificacionLinea = roundMoney(
        presentacion.montoBonificacionUnitario * cantidad
    );
    const descuentoAplicadoLinea = roundMoney(descuentoBonificacionLinea + descuentoManual);
    const subTotalLinea = roundMoney(
        presentacion.precioFinalConIva * cantidad - descuentoManual
    );
    const factorIva = 1 + (Number.isFinite(input.porcentajeIva) ? input.porcentajeIva : 0) / 100;
    const subTotalNetoLinea = roundMoney(
        factorIva > 0 ? subTotalLinea / factorIva : subTotalLinea
    );

    return {
        presentacion,
        precioUnitarioLista: presentacion.precioListaConIva,
        precioUnitarioFinal: presentacion.precioFinalConIva,
        descuentoBonificacionLinea,
        descuentoManual,
        descuentoAplicadoLinea,
        subTotalLinea,
        subTotalNetoLinea,
    };
}
