import { buildCheckoutResultUrl } from '../checkout-result-url.utils';

describe('buildCheckoutResultUrl', () => {
    it('usa template de env y agrega id_venta y cod_interno', () => {
        const url = buildCheckoutResultUrl({
            templateUrl: 'https://www.maxshop.com.ar/checkout/resultado?status=approved',
            baseUrl: 'https://www.maxshop.com.ar',
            status: 'approved',
            idVenta: 42,
            codInterno: 'MAX-00000042',
        });

        const parsed = new URL(url);
        expect(parsed.origin).toBe('https://www.maxshop.com.ar');
        expect(parsed.pathname).toBe('/checkout/resultado');
        expect(parsed.searchParams.get('status')).toBe('approved');
        expect(parsed.searchParams.get('id_venta')).toBe('42');
        expect(parsed.searchParams.get('cod_interno')).toBe('MAX-00000042');
    });

    it('sobrescribe status del template según tipo de back_url', () => {
        const url = buildCheckoutResultUrl({
            templateUrl: 'https://www.maxshop.com.ar/checkout/resultado?status=approved',
            baseUrl: 'https://www.maxshop.com.ar',
            status: 'rejected',
            idVenta: 7,
        });

        expect(new URL(url).searchParams.get('status')).toBe('rejected');
        expect(new URL(url).searchParams.get('id_venta')).toBe('7');
    });

    it('arma URL desde baseUrl si no hay template', () => {
        const url = buildCheckoutResultUrl({
            baseUrl: 'http://localhost:3000',
            status: 'pending',
            idVenta: 1,
        });

        const parsed = new URL(url);
        expect(parsed.href).toContain('http://localhost:3000/checkout/resultado');
        expect(parsed.searchParams.get('status')).toBe('pending');
        expect(parsed.searchParams.get('id_venta')).toBe('1');
    });
});
