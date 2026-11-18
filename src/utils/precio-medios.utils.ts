/**
 * Descuento por transferencia sobre el subtotal de productos (pedido).
 * Misma fórmula que el frontend de catálogo.
 */

import { roundMoney } from './money.utils';

export interface TransferenciaConfig {
  descuento_transferencia_activo?: boolean;
  descuento_transferencia_pct?: number | null;
}

export function computeDescuentoTransferencia(
  subtotalProductos: number,
  config: TransferenciaConfig | null | undefined
): number {
  if (!config || config.descuento_transferencia_activo !== true) return 0;
  const pct = Number(config.descuento_transferencia_pct ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  const sub = roundMoney(Math.max(0, subtotalProductos));
  return roundMoney((sub * Math.min(100, pct)) / 100);
}

export function computePrecioTransferencia(
  precioPublicado: number,
  config: TransferenciaConfig | null | undefined
): number | null {
  const descuento = computeDescuentoTransferencia(precioPublicado, config);
  if (descuento <= 0) return null;
  return roundMoney(Math.max(0, precioPublicado) - descuento);
}

export function computeValorCuota(
  precioPublicado: number,
  cantidadCuotas: number
): number | null {
  const n = Math.trunc(cantidadCuotas);
  if (n <= 1 || precioPublicado <= 0) return null;
  return roundMoney(precioPublicado / n);
}
