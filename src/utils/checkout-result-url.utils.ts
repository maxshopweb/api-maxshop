export type MercadoPagoCheckoutResultStatus = 'approved' | 'rejected' | 'pending';

export interface BuildCheckoutResultUrlParams {
    /** URL base desde env (ej. DEFAULT_SUCCESS_URL) o undefined para armar desde baseUrl */
    templateUrl?: string;
    /** Origen del front sin path de resultado (FRONTEND_URL o derivado del env) */
    baseUrl: string;
    status: MercadoPagoCheckoutResultStatus;
    idVenta: number;
    codInterno?: string | null;
}

/**
 * Arma la URL de retorno de checkout con status e identificadores de la venta.
 * Si hay templateUrl (DEFAULT_*_URL), conserva host/path y sobrescribe query params.
 */
export function buildCheckoutResultUrl(params: BuildCheckoutResultUrlParams): string {
    const { templateUrl, baseUrl, status, idVenta, codInterno } = params;

    let url: URL;
    if (templateUrl?.trim()) {
        url = new URL(templateUrl.trim());
    } else {
        const origin = baseUrl.replace(/\/+$/, '');
        url = new URL(`${origin}/checkout/resultado`);
    }

    url.searchParams.set('status', status);
    url.searchParams.set('id_venta', String(idVenta));
    if (codInterno) {
        url.searchParams.set('cod_interno', codInterno);
    }

    return url.toString();
}
