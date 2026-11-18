/**
 * TESTS: precio-medios.utils — transferencia y cuotas
 * npm test -- precio-medios
 */

import {
  computeDescuentoTransferencia,
  computePrecioTransferencia,
  computeValorCuota,
} from '../precio-medios.utils';

describe('precio-medios.utils', () => {
  it('1.248.000 con 23% → descuento 287.040 y precio 960.960', () => {
    const config = {
      descuento_transferencia_activo: true,
      descuento_transferencia_pct: 23,
    };
    expect(computeDescuentoTransferencia(1248000, config)).toBe(287040);
    expect(computePrecioTransferencia(1248000, config)).toBe(960960);
  });

  it('6 cuotas de 1.248.000 → 208.000 cada una', () => {
    expect(computeValorCuota(1248000, 6)).toBe(208000);
  });

  it('regla apagada no descuenta', () => {
    expect(
      computeDescuentoTransferencia(1248000, {
        descuento_transferencia_activo: false,
        descuento_transferencia_pct: 23,
      })
    ).toBe(0);
    expect(
      computePrecioTransferencia(1248000, {
        descuento_transferencia_activo: false,
        descuento_transferencia_pct: 23,
      })
    ).toBeNull();
  });

  it('porcentaje 0 no descuenta', () => {
    expect(
      computeDescuentoTransferencia(1000, {
        descuento_transferencia_activo: true,
        descuento_transferencia_pct: 0,
      })
    ).toBe(0);
  });
});
