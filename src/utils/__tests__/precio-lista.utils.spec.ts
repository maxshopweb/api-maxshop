/**
 * TESTS: resolución y validación de lista E
 * npm test -- precio-lista.utils
 */

import {
    ERR_LISTA_E_SIN_PRECIO,
    getPrecioNetoListaActiva,
    isPrecioListaEValido,
} from '../precio-lista.utils';

describe('isPrecioListaEValido', () => {
    it('permite otras listas sin precio_manual', () => {
        expect(isPrecioListaEValido('V', null)).toBe(true);
        expect(isPrecioListaEValido('O', undefined)).toBe(true);
        expect(isPrecioListaEValido(null, null)).toBe(true);
    });

    it('rechaza publicar E sin precio_manual > 0', () => {
        expect(isPrecioListaEValido('E', null)).toBe(false);
        expect(isPrecioListaEValido('E', 0)).toBe(false);
        expect(isPrecioListaEValido('e', '')).toBe(false);
        expect(ERR_LISTA_E_SIN_PRECIO).toMatch(/precio_manual/);
    });

    it('acepta E con precio_manual > 0', () => {
        expect(isPrecioListaEValido('E', 1500.5)).toBe(true);
        expect(isPrecioListaEValido('e', '100')).toBe(true);
    });
});

describe('getPrecioNetoListaActiva', () => {
    const base = {
        precio_venta: 1000,
        precio_especial: 800,
        precio_pvp: 1200,
        precio_campanya: 700,
        precio_manual: 650,
    };

    it('lista E usa precio_manual y no el especial O', () => {
        const neto = getPrecioNetoListaActiva({ ...base, lista_precio_activa: 'E' });
        expect(neto).toBe(650);
        expect(neto).toBeGreaterThan(0);
    });

    it('lista E sin precio_manual devuelve null (no cae a venta)', () => {
        expect(getPrecioNetoListaActiva({
            ...base,
            lista_precio_activa: 'E',
            precio_manual: null,
        })).toBeNull();
    });

    it('V/O/P/Q siguen mapeando a su campo', () => {
        expect(getPrecioNetoListaActiva({ ...base, lista_precio_activa: 'V' })).toBe(1000);
        expect(getPrecioNetoListaActiva({ ...base, lista_precio_activa: 'O' })).toBe(800);
        expect(getPrecioNetoListaActiva({ ...base, lista_precio_activa: 'P' })).toBe(1200);
        expect(getPrecioNetoListaActiva({ ...base, lista_precio_activa: 'Q' })).toBe(700);
    });
});
