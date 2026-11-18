/**
 * TESTS: cupones.calc — cálculo y validación pura
 * npm test -- cupones.service
 */

import {
  normalizeCodigo,
  computeMontoDescuento,
  validateCuponAgainstSubtotal,
  CUPON_TIPO_PORCENTAJE,
  CUPON_TIPO_MONTO_FIJO,
} from '../cupones.calc';
import type { ICupon } from '../../types/cupones.type';

function baseCupon(overrides: Partial<ICupon> = {}): ICupon {
  return {
    id_cupon: 1,
    codigo: 'TEST10',
    tipo: CUPON_TIPO_PORCENTAJE,
    valor: 10,
    monto_minimo: 0,
    usos_maximos: 100,
    usos_actuales: 0,
    fecha_inicio: null,
    fecha_fin: null,
    activo: true,
    creado_en: new Date(),
    actualizado_en: new Date(),
    ...overrides,
  };
}

describe('cupones.calc', () => {
  it('normalizeCodigo quita espacios y pasa a mayúsculas', () => {
    expect(normalizeCodigo('  bienvenido 10 ')).toBe('BIENVENIDO10');
  });

  it('porcentaje 10% sobre 1000 = 100', () => {
    expect(computeMontoDescuento(CUPON_TIPO_PORCENTAJE, 10, 1000)).toBe(100);
  });

  it('monto fijo no supera el subtotal', () => {
    expect(computeMontoDescuento(CUPON_TIPO_MONTO_FIJO, 500, 300)).toBe(300);
    expect(computeMontoDescuento(CUPON_TIPO_MONTO_FIJO, 200, 1000)).toBe(200);
  });

  it('cupón válido porcentaje', () => {
    const result = validateCuponAgainstSubtotal(baseCupon(), 5000);
    expect(result.valid).toBe(true);
    expect(result.monto_descuento).toBe(500);
  });

  it('rechaza inactivo', () => {
    const result = validateCuponAgainstSubtotal(baseCupon({ activo: false }), 5000);
    expect(result.valid).toBe(false);
  });

  it('rechaza agotado', () => {
    const result = validateCuponAgainstSubtotal(
      baseCupon({ usos_actuales: 5, usos_maximos: 5 }),
      5000
    );
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/usos/i);
  });

  it('rechaza monto mínimo no alcanzado', () => {
    const result = validateCuponAgainstSubtotal(
      baseCupon({ monto_minimo: 10000 }),
      5000
    );
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/mínimo/i);
  });

  it('rechaza expirado', () => {
    const past = new Date(Date.now() - 86400000);
    const result = validateCuponAgainstSubtotal(baseCupon({ fecha_fin: past }), 5000);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/expirado/i);
  });

  it('rechaza aún no vigente', () => {
    const future = new Date(Date.now() + 86400000);
    const result = validateCuponAgainstSubtotal(
      baseCupon({ fecha_inicio: future }),
      5000
    );
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/vigente/i);
  });
});
