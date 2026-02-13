/**
 * Servicio wrapper para Mercado Pago
 * 
 * Este servicio encapsula toda la comunicación con la API de Mercado Pago:
 * - Creación de preferencias de pago
 * - Consulta de pagos
 * - Consulta de preferencias
 * 
 * NO procesa webhooks - eso lo hace PaymentWebhookService
 * 
 * @author MaxShop
 */

import { IVenta, IVentaDetalle } from '../types';

// ============================================
// TIPOS E INTERFACES
// ============================================

export interface BackUrls {
    success?: string;
    failure?: string;
    pending?: string;
}

export interface PreferenceItem {
    id?: string;
    title: string;
    description?: string;
    quantity: number;
    unit_price: number;
    currency_id: string;
    picture_url?: string;
    category_id?: string;
}

export interface CreatePreferenceRequest {
    items: PreferenceItem[];
    payer?: {
        name?: string;
        surname?: string;
        email?: string;
        phone?: {
            area_code?: string;
            number?: string;
        };
        identification?: {
            type?: string;
            number?: string;
        };
        address?: {
            street_name?: string;
            street_number?: number;
            zip_code?: string;
        };
    };
    back_urls?: BackUrls;
    auto_return?: 'approved' | 'all';
    external_reference?: string;
    notification_url?: string;
    statement_descriptor?: string;
    expires?: boolean;
    expiration_date_from?: string;
    expiration_date_to?: string;
    payment_methods?: {
        default_installments?: number;
    };
}

export interface PreferenceResponse {
    id: string;
    init_point: string;
    sandbox_init_point: string;
    client_id?: string;
    collector_id?: number;
    operation_type?: string;
    date_created?: string;
    last_updated?: string;
    external_reference?: string;
    [key: string]: any;
}

export interface MercadoPagoPaymentResponse {
    id: number;
    date_created: string;
    date_approved: string | null;
    date_last_updated: string;
    money_release_date: string | null;
    operation_type: string;
    issuer_id: string | null;
    payment_method_id: string;
    payment_type_id: string;
    status: string;
    status_detail: string;
    currency_id: string;
    description: string | null;
    live_mode: boolean;
    sponsor_id: number | null;
    authorization_code: string | null;
    money_release_schema: string | null;
    collector_id: number;
    payer: {
        id: number | null;
        email: string;
        identification: {
            type: string;
            number: string;
        } | null;
        first_name: string | null;
        last_name: string | null;
        phone: {
            area_code: string;
            number: string;
            extension: string;
        } | null;
    };
    metadata: Record<string, any>;
    additional_info: {
        items: Array<{
            id: string;
            title: string;
            description: string;
            category_id: string;
            quantity: number;
            unit_price: number;
        }>;
        payer: Record<string, any>;
        shipments: Record<string, any>;
    } | null;
    order: {
        id: string;
        type: string;
    } | null;
    external_reference: string | null;
    transaction_amount: number;
    transaction_amount_refunded: number;
    coupon_amount: number;
    differential_pricing_id: number | null;
    deduction_schema: string | null;
    transaction_details: {
        payment_method_reference_id: string | null;
        net_received_amount: number;
        total_paid_amount: number;
        overpaid_amount: number;
        external_resource_url: string | null;
        installment_amount: number;
        financial_institution: string | null;
        payable_deferral_period: string | null;
    };
    fee_details: Array<{
        type: string;
        amount: number;
        fee_payer: string;
    }>;
    captured: boolean;
    binary_mode: boolean;
    call_for_authorize_id: string | null;
    statement_descriptor: string | null;
    installments: number;
    card: {
        id: string | null;
        first_six_digits: string;
        last_four_digits: string;
        expiration_month: number;
        expiration_year: number;
        date_created: string;
        date_last_updated: string;
        cardholder: {
            name: string;
            identification: {
                number: string;
                type: string;
            };
        };
    } | null;
    notification_url: string | null;
    refunds: any[];
    processing_mode: string;
    merchant_account_id: string | null;
    acquirer: string | null;
    merchant_number: string | null;
    acquirer_reconciliation: any[];
    preference_id: string | null;
}

interface CreatePreferenceFromVentaParams {
    venta: IVenta;
    backUrls?: BackUrls;
    notificationUrl?: string;
    useAutoReturn?: boolean; // Si es false, no se incluye auto_return (útil para localhost)
    defaultInstallments?: number;
}

interface CreatePreferenceFromDataParams {
    idVenta: number;
    total: number;
    items: Array<{
        id_prod: number;
        cantidad: number;
        precio_unitario: number;
        nombre?: string;
        descripcion?: string;
        imagen?: string;
    }>;
    payer?: {
        name?: string;
        surname?: string;
        email?: string;
        phone?: string;
    };
    backUrls?: BackUrls;
    notificationUrl?: string;
    defaultInstallments?: number;
}

// ============================================
// SERVICIO PRINCIPAL
// ============================================

class MercadoPagoService {
    private accessToken: string;
    private isLiveMode: boolean;
    private baseUrl = 'https://api.mercadopago.com';
    // Email del usuario de prueba de MP (para sandbox)
    private testUserEmail: string;

    constructor() {
        // Determinar si usar modo producción o sandbox
        // En producción: NODE_ENV=production y MERCADOPAGO_ENV=production
        // En desarrollo: cualquier otro caso (default: sandbox)
        this.isLiveMode = process.env.NODE_ENV === 'production' && process.env.MERCADOPAGO_ENV === 'production';
        
        // Usar token correspondiente
        this.accessToken = this.isLiveMode
            ? process.env.MERCADOPAGO_ACCESS_TOKEN || ''
            : process.env.MERCADOPAGO_ACCESS_TOKEN_TEST || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
        
        this.testUserEmail = process.env.MERCADOPAGO_TEST_USER_EMAIL || 'test_user_123456789@testuser.com';
        
        if (!this.accessToken) {
            console.error('❌ [MercadoPagoService] Access Token no configurado');
        } else {
            const mode = this.isLiveMode ? 'PRODUCCIÓN' : 'SANDBOX';
            console.log(`✅ [MercadoPagoService] Inicializado en modo ${mode}`);
        }
    }

    /**
     * Verifica si el servicio está configurado correctamente
     */
    isConfigured(): boolean {
        return !!this.accessToken;
    }

    /**
     * Obtiene el modo actual (sandbox o producción)
     */
    getMode(): 'sandbox' | 'production' {
        return this.isLiveMode ? 'production' : 'sandbox';
    }

    /**
     * Realiza una petición HTTP a la API de Mercado Pago
     */
    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        endpoint: string,
        body?: any
    ): Promise<T> {
        if (!this.accessToken) {
            throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado');
        }

        const url = `${this.baseUrl}${endpoint}`;
        
        const options: RequestInit = {
            method,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': this.generateIdempotencyKey(),
            },
        };

        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
            // Log del body completo para debug (solo para preferences)
            if (endpoint.includes('/preferences')) {
                // Log detallado solo en desarrollo
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`📦 [MercadoPago] Body completo enviado a MP:`, JSON.stringify(body, null, 2));
                }
            }
        }

        // Log solo en desarrollo para debugging
        if (process.env.NODE_ENV !== 'production') {
            console.log(`🔄 [MercadoPago] ${method} ${endpoint}`);
        }

        const response = await fetch(url, options);
        const data = await response.json() as T & { message?: string; error?: string };

        if (!response.ok) {
            const errorMessage = data.message || data.error || response.statusText;
            console.error(`❌ [MercadoPago] Error en ${method} ${endpoint}:`, errorMessage);
            // Si es error de back_urls, mostrar el body que se envió
            if (errorMessage.includes('back_url') && body) {
                console.error(`❌ [MercadoPago] Body enviado (con error):`, JSON.stringify(body, null, 2));
            }
            throw new Error(`Error de Mercado Pago: ${errorMessage} (${response.status})`);
        }

        return data;
    }

    /**
     * Genera una clave de idempotencia única
     */
    private generateIdempotencyKey(): string {
        return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }

    // ============================================
    // PREFERENCIAS DE PAGO
    // ============================================

    /**
     * Crea una preferencia de pago
     */
    async createPreference(request: CreatePreferenceRequest): Promise<PreferenceResponse> {
        return this.request<PreferenceResponse>('POST', '/checkout/preferences', request);
    }

    /**
     * Crea una preferencia de pago a partir de una venta completa
     */
    async createPreferenceFromVenta(params: CreatePreferenceFromVentaParams): Promise<PreferenceResponse> {
        const { venta, backUrls, notificationUrl, useAutoReturn = true, defaultInstallments } = params;

        // Log solo en desarrollo
        if (process.env.NODE_ENV !== 'production') {
            console.log(`🔍 [MercadoPagoService] Creando preferencia para venta #${venta.id_venta}`);
        }

        if (!venta.total_neto) {
            throw new Error('La venta debe tener un total_neto para crear la preferencia');
        }

        if (!venta.detalles || venta.detalles.length === 0) {
            throw new Error('La venta debe tener detalles para crear la preferencia');
        }

        // Construir items desde los detalles de la venta
        const items: PreferenceItem[] = venta.detalles.map((detalle: IVentaDetalle) => {
            const nombre = detalle.producto?.nombre || `Producto ${detalle.id_prod}`;
            
            // Validar que picture_url sea una URL válida (no una ruta de archivo local)
            let pictureUrl: string | undefined = undefined;
            if (detalle.producto?.img_principal) {
                const imgPath = detalle.producto.img_principal;
                // Si es una URL válida (http/https), usarla. Si es una ruta local, ignorarla.
                if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
                    pictureUrl = imgPath;
                } else {
                    // Si es una ruta local, intentar construir una URL completa si hay una base URL configurada
                    const baseUrl = process.env.IMAGES_BASE_URL || process.env.FRONTEND_URL;
                    if (baseUrl && !imgPath.includes('\\') && !imgPath.includes('F:\\')) {
                        // Solo construir URL si no es una ruta de Windows absoluta
                        pictureUrl = `${baseUrl}${imgPath.startsWith('/') ? '' : '/'}${imgPath}`;
                    }
                    // Si no se puede construir una URL válida, dejarlo como undefined
                }
            }
            
            return {
                id: detalle.id_prod?.toString(),
                title: nombre.length > 256 ? nombre.substring(0, 256) : nombre,
                description: detalle.producto?.descripcion?.substring(0, 256) || undefined,
                quantity: detalle.cantidad || 1,
                unit_price: Number(detalle.precio_unitario) || 0,
                currency_id: 'ARS',
                picture_url: pictureUrl,
            };
        });

        // External reference para vincular con la venta
        const external_reference = `venta_${venta.id_venta}`;

        // Construir datos del pagador
        // MP requiere al menos email para habilitar el botón de pago
        let payer: CreatePreferenceRequest['payer'];
        const usuario = venta.cliente?.usuario || venta.usuario;
        
        if (usuario) {
            // En modo SANDBOX: NO incluir email en el payer
            // MP deshabilita el botón si usas email de test user
            // El usuario ingresará su email en el formulario de MP
            let emailFinal: string | undefined;
            if (!this.isLiveMode) {
                // SANDBOX: NO incluir email - MP lo tomará del formulario
                emailFinal = undefined;
            } else {
                // PRODUCCIÓN: Usar el email del usuario o uno por defecto
                emailFinal = usuario.email || `venta_${venta.id_venta}@maxshop.com`;
            }
            
            // Procesar teléfono
            let phoneData: { area_code: string; number: string } | undefined = undefined;
            if (usuario.telefono) {
                const telefonoLimpio = usuario.telefono.replace(/\D/g, ''); // Solo números
                if (telefonoLimpio.length >= 10) {
                    // Formato argentino: código de área (2-4 dígitos) + número (6-8 dígitos)
                    if (telefonoLimpio.startsWith('54')) {
                        // Tiene código de país
                        const sinPais = telefonoLimpio.substring(2);
                        if (sinPais.length >= 10) {
                            phoneData = {
                                area_code: sinPais.substring(0, 4), // Código de área (ej: 2302)
                                number: sinPais.substring(4), // Número
                            };
                        } else {
                            phoneData = {
                                area_code: '',
                                number: telefonoLimpio,
                            };
                        }
                    } else if (telefonoLimpio.length >= 10) {
                        // Asumir que los primeros 2-4 dígitos son código de área
                        phoneData = {
                            area_code: telefonoLimpio.substring(0, 4),
                            number: telefonoLimpio.substring(4),
                        };
                    } else {
                        phoneData = {
                            area_code: '',
                            number: telefonoLimpio,
                        };
                    }
                } else if (telefonoLimpio.length > 0) {
                    phoneData = {
                        area_code: '',
                        number: telefonoLimpio,
                    };
                }
            }
            
            // Construir objeto payer
            payer = {
                name: (usuario.nombre && usuario.nombre.trim()) || 'Test',
                surname: (usuario.apellido && usuario.apellido.trim()) || 'User',
                phone: phoneData,
            };
            
            // Solo incluir email si no es sandbox
            if (emailFinal) {
                payer.email = emailFinal;
            }
            
            // Validaciones finales - MP requiere nombre y apellido no vacíos
            if (!payer.name || payer.name.trim() === '') {
                payer.name = 'Test';
            }
            if (!payer.surname || payer.surname.trim() === '') {
                payer.surname = 'User';
            }
            
            // Log solo en desarrollo
            if (process.env.NODE_ENV !== 'production') {
                console.log(`👤 [MercadoPagoService] Payer: ${payer.name} ${payer.surname}${payer.email ? ` (${payer.email})` : ' (email no incluido en sandbox)'}`);
            }
        } else {
            // Si no hay usuario, crear un payer mínimo con datos de la venta
            payer = {
                name: 'Test',
                surname: 'User',
            };
            
            // Solo incluir email en producción
            if (this.isLiveMode) {
                payer.email = `venta_${venta.id_venta}@maxshop.com`;
            }
        }

        // Validar y construir back_urls
        // Cuando usamos auto_return: 'approved', back_urls.success es OBLIGATORIO
        if (!backUrls || !backUrls.success) {
            console.error('❌ [MercadoPagoService] backUrls recibido:', backUrls);
            throw new Error('back_urls.success es requerido cuando se usa auto_return: "approved". Verifica las variables de entorno DEFAULT_SUCCESS_URL o FRONTEND_URL');
        }

        const backUrlsFinal = {
            success: backUrls.success,
            failure: backUrls.failure || backUrls.success,
            pending: backUrls.pending || backUrls.success,
        };

        // Log solo en desarrollo
        if (process.env.NODE_ENV !== 'production') {
            console.log(`🔗 [MercadoPagoService] URLs configuradas: ${backUrlsFinal.success}`);
        }

        // Construir el request de preferencia
        // NOTA: auto_return solo funciona con HTTPS. Si usamos localhost, no incluirlo.
        const preferenceRequest: CreatePreferenceRequest = {
            items,
            payer,
            external_reference,
            back_urls: backUrlsFinal,
            // Solo usar auto_return si está habilitado Y tenemos back_urls.success válido
            auto_return: (useAutoReturn && backUrlsFinal.success) ? 'approved' : undefined,
            notification_url: notificationUrl || process.env.MERCADOPAGO_WEBHOOK_URL || undefined,
            payment_methods: (defaultInstallments && Number.isInteger(defaultInstallments) && defaultInstallments > 1)
                ? { default_installments: defaultInstallments }
                : undefined,
        };
        
        // Remover propiedades undefined para que no se envíen en el JSON
        if (!preferenceRequest.auto_return) {
            delete (preferenceRequest as any).auto_return;
        }
        if (!preferenceRequest.notification_url) {
            delete (preferenceRequest as any).notification_url;
        }
        if (!preferenceRequest.payment_methods) {
            delete (preferenceRequest as any).payment_methods;
        }

        // Log detallado solo en desarrollo
        if (process.env.NODE_ENV !== 'production') {
            console.log(`📤 [MercadoPagoService] Enviando request a MP (${items.length} items)`);
        }

        try {
            const preference = await this.createPreference(preferenceRequest);
            console.log(`✅ [MercadoPagoService] Preferencia creada: venta #${venta.id_venta} → ${preference.id}`);
            return preference;
        } catch (error) {
            console.error(`❌ [MercadoPagoService] Error al crear preferencia para venta #${venta.id_venta}:`, error);
            throw error;
        }
    }

    /**
     * Crea una preferencia de pago a partir de datos básicos
     */
    async createPreferenceFromData(params: CreatePreferenceFromDataParams): Promise<PreferenceResponse> {
        const { idVenta, items, payer: payerData, backUrls, notificationUrl, defaultInstallments } = params;

        if (!items || items.length === 0) {
            throw new Error('Debe haber al menos un item para crear la preferencia');
        }

        // Construir items
        const preferenceItems: PreferenceItem[] = items.map((item) => ({
            id: item.id_prod.toString(),
            title: (item.nombre || `Producto ${item.id_prod}`).substring(0, 256),
            description: item.descripcion?.substring(0, 256),
            quantity: item.cantidad,
            unit_price: item.precio_unitario,
            currency_id: 'ARS',
            picture_url: item.imagen || undefined,
        }));

        // External reference
        const external_reference = `venta_${idVenta}`;

        // Datos del pagador
        let payer: CreatePreferenceRequest['payer'];
        if (payerData) {
            payer = {
                name: payerData.name,
                surname: payerData.surname,
                email: payerData.email,
                phone: payerData.phone ? {
                    area_code: '',
                    number: payerData.phone,
                } : undefined,
            };
        }

        const preferenceRequest: CreatePreferenceRequest = {
            items: preferenceItems,
            payer,
            external_reference,
            back_urls: backUrls,
            auto_return: 'approved',
            notification_url: notificationUrl || process.env.MERCADOPAGO_WEBHOOK_URL,
            payment_methods: (defaultInstallments && Number.isInteger(defaultInstallments) && defaultInstallments > 1)
                ? { default_installments: defaultInstallments }
                : undefined,
        };

        try {
            const preference = await this.createPreference(preferenceRequest);
            console.log(`✅ [MercadoPagoService] Preferencia creada para venta #${idVenta}: ${preference.id}`);
            return preference;
        } catch (error) {
            console.error(`❌ [MercadoPagoService] Error al crear preferencia para venta #${idVenta}:`, error);
            throw error;
        }
    }

    /**
     * Obtiene una preferencia por ID
     */
    async getPreference(preferenceId: string): Promise<PreferenceResponse> {
        return this.request<PreferenceResponse>('GET', `/checkout/preferences/${preferenceId}`);
    }

    // ============================================
    // CONSULTA DE PAGOS
    // ============================================

    /**
     * Obtiene información completa de un pago por ID
     * Esta es la FUENTE DE VERDAD para el estado del pago
     */
    async getPayment(paymentId: string | number): Promise<MercadoPagoPaymentResponse> {
        return this.request<MercadoPagoPaymentResponse>('GET', `/v1/payments/${paymentId}`);
    }

    /**
     * Busca pagos por external_reference
     */
    async searchPaymentsByExternalReference(externalReference: string): Promise<MercadoPagoPaymentResponse[]> {
        const response = await this.request<{ results: MercadoPagoPaymentResponse[] }>(
            'GET',
            `/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}`
        );
        return response.results || [];
    }

    /**
     * Busca pagos por ID de venta
     */
    async searchPaymentsByVentaId(idVenta: number): Promise<MercadoPagoPaymentResponse[]> {
        return this.searchPaymentsByExternalReference(`venta_${idVenta}`);
    }

    // ============================================
    // UTILIDADES
    // ============================================

    /**
     * Extrae el ID de venta desde un external_reference
     * Formato esperado: "venta_{idVenta}"
     */
    static extractVentaIdFromExternalReference(externalReference: string): number | null {
        if (!externalReference) return null;
        
        const match = externalReference.match(/^venta_(\d+)$/);
        if (!match) {
            return null;
        }
        return parseInt(match[1], 10);
    }

    /**
     * Genera el external_reference para una venta
     */
    static generateExternalReference(idVenta: number): string {
        return `venta_${idVenta}`;
    }

    /**
     * Verifica si un estado de MP indica pago exitoso
     */
    static isApprovedStatus(status: string): boolean {
        return ['approved', 'authorized'].includes(status);
    }

    /**
     * Verifica si un estado de MP indica pago pendiente
     */
    static isPendingStatus(status: string): boolean {
        return ['pending', 'in_process'].includes(status);
    }

    /**
     * Verifica si un estado de MP indica pago rechazado/fallido
     */
    static isRejectedStatus(status: string): boolean {
        return ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(status);
    }
}

// Exportar instancia singleton
export const mercadoPagoService = new MercadoPagoService();
export { MercadoPagoService };
