/**
 * =============================================================================
 * TESTS: AndreaniApiService — Cliente HTTP Andreani
 * =============================================================================
 *
 * OBJETIVO: Token en headers, retry en 401/403, parsing JSON/PDF, timeout.
 *
 * CÓMO EJECUTAR:
 *   npm test -- andreani.api
 *   npm test -- --watch
 */

import { AndreaniApiService } from '../andreani.api.service';

const mockGetToken = jest.fn();
const mockRenewToken = jest.fn();

jest.mock('../andreani.auth.service', () => ({
  andreaniAuthService: {
    getToken: (...args: unknown[]) => mockGetToken(...args),
    renewToken: (...args: unknown[]) => mockRenewToken(...args),
  },
}));

jest.mock('../../../config/andreani.config', () => ({
  andreaniConfig: {
    baseUrl: 'https://api.test.andreani.com',
    timeout: 5000,
  },
}));

const mockFetch = jest.fn();
beforeAll(() => {
  (global as any).fetch = mockFetch;
});
afterAll(() => {
  delete (global as any).fetch;
});

describe('AndreaniApiService', () => {
  let service: AndreaniApiService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AndreaniApiService();
    mockGetToken.mockResolvedValue('token-inicial');
  });

  describe('request (get)', () => {
    it('incluye x-authorization-token en la request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: true }),
      });

      await service.get('/v2/test');

      expect(mockGetToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.andreani.com/v2/test',
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-authorization-token': 'token-inicial' }),
        })
      );
    });

    it('renueva token y reintenta en 401', async () => {
      mockRenewToken.mockResolvedValue('token-nuevo');
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers(),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ ok: true }),
        });

      const r = await service.get('/v2/ordenes');

      expect(mockRenewToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(r.success).toBe(true);
    });

    it('renueva token y reintenta en 403', async () => {
      mockRenewToken.mockResolvedValue('token-nuevo');
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          headers: new Headers(),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ data: true }),
        });

      const r = await service.get('/v2/envios');

      expect(mockRenewToken).toHaveBeenCalled();
      expect(r.success).toBe(true);
    });

    it('devuelve success: false cuando response no ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      const r = await service.get('/v2/ordenes/999');

      expect(r.success).toBe(false);
      expect(r.statusCode).toBe(404);
      expect(r.error).toContain('404');
    });

    it('parsea JSON cuando Content-Type es application/json', async () => {
      const data = { numeroDeEnvio: '123', estado: 'Creada' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(data),
      });

      const r = await service.get<typeof data>('/v2/ordenes/123');

      expect(r.success).toBe(true);
      expect(r.data).toEqual(data);
    });
  });

  describe('getBinary', () => {
    it('devuelve buffer y contentType para PDF', async () => {
      const buf = Buffer.from('fake-pdf-content');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        arrayBuffer: () =>
          Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
      });

      const r = await service.getBinary('/v2/etiquetas/1');

      expect(r.success).toBe(true);
      expect(r.data).toBeDefined();
      expect(Buffer.isBuffer(r.data!.buffer)).toBe(true);
      expect(r.data!.contentType).toContain('pdf');
    });

    it('renueva token en 401 y reintenta', async () => {
      mockRenewToken.mockResolvedValue('token-nuevo');
      const buf = Buffer.from('pdf');
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/pdf' }),
          arrayBuffer: () =>
            Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
        });

      const r = await service.getBinary('/v2/etiquetas/1');

      expect(mockRenewToken).toHaveBeenCalled();
      expect(r.success).toBe(true);
    });

    it('devuelve success: false si la respuesta no es ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/pdf' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const r = await service.getBinary('/v2/etiquetas/1');

      expect(r.success).toBe(false);
      expect(r.statusCode).toBe(500);
    });
  });
});
