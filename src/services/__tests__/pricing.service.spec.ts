/**
 * TESTS: pricing.service — precio lista, bonificación y final unificado
 * npm test -- pricing.service
 */

import {
    applyBonificacionToPrecio,
    buildPrecioPresentacion,
    computeLineaVentaPricing,
    getMontoBonificacionUnitario,
    normalizeBonificacionPct,
} from '../pricing.service';

describe('pricing.service', () => {
    it('normalizeBonificacionPct', () => {
        expect(normalizeBonificacionPct(10)).toBe(10);
        expect(normalizeBonificacionPct(0)).toBeNull();
        expect(normalizeBonificacionPct(null)).toBeNull();
        expect(normalizeBonificacionPct(150)).toBe(100);
    });

    it('caso venta #49: lista 1210, boni 10% → final 1089', () => {
        const p = buildPrecioPresentacion(1210, 10, 21);
        expect(p).not.toBeNull();
        expect(p!.precioListaConIva).toBe(1210);
        expect(p!.precioFinalConIva).toBe(1089);
        expect(p!.montoBonificacionUnitario).toBe(121);
        expect(p!.tieneBonificacion).toBe(true);
        expect(p!.bonificacionPorcentaje).toBe(10);
    });

    it('sin bonificación: final = lista', () => {
        const p = buildPrecioPresentacion(500, null, 21);
        expect(p!.precioFinalConIva).toBe(500);
        expect(p!.montoBonificacionUnitario).toBe(0);
    });

    it('computeLineaVentaPricing: línea online con bonificación visible en descuento', () => {
        const linea = computeLineaVentaPricing({
            precioListaConIva: 1210,
            bonificacionPctRaw: 10,
            porcentajeIva: 21,
            cantidad: 1,
            descuentoManual: 0,
        });
        expect(linea.precioUnitarioLista).toBe(1210);
        expect(linea.precioUnitarioFinal).toBe(1089);
        expect(linea.descuentoBonificacionLinea).toBe(121);
        expect(linea.descuentoAplicadoLinea).toBe(121);
        expect(linea.subTotalLinea).toBe(1089);
    });

    it('applyBonificacionToPrecio y getMontoBonificacionUnitario', () => {
        expect(applyBonificacionToPrecio(1000, 10)).toBe(900);
        expect(getMontoBonificacionUnitario(1210, 1089)).toBe(121);
    });
});
