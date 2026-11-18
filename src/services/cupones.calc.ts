/**
 * Cálculo y validación pura de cupones (sin I/O).
 */

import { roundMoney } from '../utils/money.utils';
import {
  CUPON_TIPO_MONTO_FIJO,
  CUPON_TIPO_PORCENTAJE,
  ICupon,
  ICuponValidacionResult,
} from '../types/cupones.type';

export function normalizeCodigo(codigo: string | null | undefined): string {
  return String(codigo || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function computeMontoDescuento(
  tipo: string,
  valor: number,
  subtotalProductos: number
): number {
  const subtotal = roundMoney(Math.max(0, subtotalProductos));
  if (subtotal <= 0) return 0;
  if (tipo === CUPON_TIPO_PORCENTAJE) {
    return roundMoney((subtotal * Math.min(100, Math.max(0, valor))) / 100);
  }
  return roundMoney(Math.min(Math.max(0, valor), subtotal));
}

export function validateCuponAgainstSubtotal(
  cupon: ICupon,
  subtotalProductos: number
): ICuponValidacionResult {
  const now = new Date();
  if (!cupon.activo) {
    return { valid: false, message: 'Cupón no encontrado o no válido' };
  }
  if (cupon.fecha_inicio && new Date(cupon.fecha_inicio) > now) {
    return { valid: false, message: 'El cupón aún no está vigente' };
  }
  if (cupon.fecha_fin && new Date(cupon.fecha_fin) < now) {
    return { valid: false, message: 'El cupón ha expirado' };
  }
  if (cupon.usos_actuales >= cupon.usos_maximos) {
    return { valid: false, message: 'Este cupón ya no tiene usos disponibles' };
  }
  const subtotal = roundMoney(Math.max(0, subtotalProductos));
  if (subtotal < cupon.monto_minimo) {
    return {
      valid: false,
      message: `El subtotal mínimo para este cupón es $${cupon.monto_minimo.toFixed(2)}`,
    };
  }
  const monto_descuento = computeMontoDescuento(cupon.tipo, cupon.valor, subtotal);
  if (monto_descuento <= 0) {
    return { valid: false, message: 'El cupón no genera descuento para este pedido' };
  }
  return {
    valid: true,
    message: 'Cupón válido',
    id_cupon: cupon.id_cupon,
    codigo: cupon.codigo,
    tipo: cupon.tipo,
    valor: cupon.valor,
    monto_descuento,
  };
}

export { CUPON_TIPO_PORCENTAJE, CUPON_TIPO_MONTO_FIJO };
