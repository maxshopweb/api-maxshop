import type { IVenta } from '../types';

/**
 * Misma heurística que AndreaniHandler: retiro no genera envío Andreani.
 */
export function isVentaRetiroEnTienda(observaciones: string | null | undefined): boolean {
    const o = observaciones?.toLowerCase() ?? '';
    return o.includes('retiro en tienda') || o.includes('tipo: retiro');
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
