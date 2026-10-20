/**
 * Resolución de precio por lista activa (V/O/P/Q/E).
 * Lista E es el precio ERP (precio_manual), no un precio interno.
 */

export const ERR_LISTA_E_SIN_PRECIO =
    'Si la lista pública es E, el precio de lista E (precio_manual) debe ser mayor a 0';

function numOrNull(value: unknown): number | null {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export function isPrecioListaEValido(
    lista: string | null | undefined,
    precioManual: unknown
): boolean {
    if ((lista ?? '').toUpperCase() !== 'E') return true;
    const n = numOrNull(precioManual);
    return n != null && n > 0;
}

export function getPrecioNetoListaActiva(producto: {
    lista_precio_activa?: string | null;
    precio_venta?: unknown;
    precio_especial?: unknown;
    precio_pvp?: unknown;
    precio_campanya?: unknown;
    precio_manual?: unknown;
}): number | null {
    const lista = (producto.lista_precio_activa || 'V').toUpperCase();
    const pv = numOrNull(producto.precio_venta);
    const pe = numOrNull(producto.precio_especial);
    const pp = numOrNull(producto.precio_pvp);
    const pc = numOrNull(producto.precio_campanya);
    const pm = numOrNull(producto.precio_manual);
    if (lista === 'E') return pm;
    if (lista === 'V') return pv;
    if (lista === 'O') return pe;
    if (lista === 'P') return pp;
    if (lista === 'Q') return pc;
    return pv ?? pe ?? pp ?? pc ?? pm;
}
