/**
 * Utilidades de redondeo y comparación de montos (ARS).
 * Usadas por ventas, Mercado Pago y webhooks para mantener integridad de cobro.
 */

export const MONEY_TOLERANCE_ARS = 0.02;

export function roundMoney(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** True si dos montos coinciden dentro de la tolerancia (centavos). */
export function amountsMatch(a: number, b: number, tolerance = MONEY_TOLERANCE_ARS): boolean {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(roundMoney(a) - roundMoney(b)) <= tolerance;
}

export function sumPreferenceItems(items: Array<{ unit_price: number; quantity: number }>): number {
    return roundMoney(
        items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0)
    );
}
