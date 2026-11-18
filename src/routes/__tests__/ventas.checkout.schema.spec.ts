/**
 * TESTS: Validación Zod del payload POST /ventas/checkout
 * npm test -- ventas.checkout
 */

import { checkoutBodySchema } from '../../schemas/checkout.schema';

const validPayload = {
  metodo_pago: 'mercadopago',
  detalles: [{ id_prod: 1, cantidad: 2 }],
};

describe('checkoutBodySchema', () => {
  it('acepta payload mínimo válido', () => {
    const r = checkoutBodySchema.safeParse(validPayload);
    expect(r.success).toBe(true);
  });

  it('rechaza sin metodo_pago', () => {
    const r = checkoutBodySchema.safeParse({ detalles: [{ id_prod: 1, cantidad: 1 }] });
    expect(r.success).toBe(false);
  });

  it('rechaza detalles vacíos', () => {
    const r = checkoutBodySchema.safeParse({ metodo_pago: 'efectivo', detalles: [] });
    expect(r.success).toBe(false);
  });

  it('rechaza cantidad no positiva', () => {
    const r = checkoutBodySchema.safeParse({
      metodo_pago: 'efectivo',
      detalles: [{ id_prod: 1, cantidad: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it('acepta transferencia con dirección opcional', () => {
    const r = checkoutBodySchema.safeParse({
      metodo_pago: 'transferencia',
      detalles: [{ id_prod: 5, cantidad: 1, precio_unitario: 100 }],
      direccion: { ciudad: 'CABA', cod_postal: 1425 },
      costo_envio: 1500,
    });
    expect(r.success).toBe(true);
  });

  it('rechaza campos extra (strict)', () => {
    const r = checkoutBodySchema.safeParse({
      ...validPayload,
      campo_extra: true,
    });
    expect(r.success).toBe(false);
  });

  it.each(['mercadopago', 'efectivo', 'transferencia'] as const)(
    'acepta codigo_cupon con medio %s',
    (metodo) => {
      const r = checkoutBodySchema.safeParse({
        metodo_pago: metodo,
        detalles: [{ id_prod: 1, cantidad: 1 }],
        codigo_cupon: 'PROMO10',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.codigo_cupon).toBe('PROMO10');
      }
    }
  );

  it('acepta payload sin codigo_cupon', () => {
    const r = checkoutBodySchema.safeParse(validPayload);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.codigo_cupon).toBeUndefined();
    }
  });

  it('normaliza codigo_cupon vacío a undefined', () => {
    const r = checkoutBodySchema.safeParse({
      ...validPayload,
      codigo_cupon: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.codigo_cupon).toBeUndefined();
    }
  });

  it('normaliza codigo_cupon null a undefined', () => {
    const r = checkoutBodySchema.safeParse({
      ...validPayload,
      codigo_cupon: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.codigo_cupon).toBeUndefined();
    }
  });

  it('sigue rechazando clave desconocida aunque venga codigo_cupon', () => {
    const r = checkoutBodySchema.safeParse({
      ...validPayload,
      codigo_cupon: 'PROMO10',
      campo_extra: true,
    });
    expect(r.success).toBe(false);
  });
});
