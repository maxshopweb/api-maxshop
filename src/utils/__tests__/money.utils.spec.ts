/**
 * TESTS: money.utils — redondeo y comparación de montos
 * npm test -- money.utils
 */

import { amountsMatch, roundMoney, sumPreferenceItems, MONEY_TOLERANCE_ARS } from '../money.utils';

describe('money.utils', () => {
  it('roundMoney redondea a 2 decimales', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(1089)).toBe(1089);
  });

  it('amountsMatch tolera diferencia de centavos', () => {
    expect(amountsMatch(1089, 1089.01, MONEY_TOLERANCE_ARS)).toBe(true);
    expect(amountsMatch(1210, 1089)).toBe(false);
  });

  it('sumPreferenceItems suma unit_price × quantity', () => {
    expect(
      sumPreferenceItems([
        { unit_price: 1089, quantity: 1 },
        { unit_price: 500, quantity: 2 },
      ])
    ).toBe(2089);
  });
});
