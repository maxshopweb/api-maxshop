import { IProductos } from "./product.type";
export type { UserRole } from './auth.type';

// ============================================
// TIPOS BASE / ENUMS
// ============================================

// 1 = activo, 2 = inactivo, 0 = eliminado, 3 = perfil incompleto
export type EstadoGeneral = 0 | 1 | 2 | 3;

export type EstadoPago = 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado';

export type EstadoEnvio = 'pendiente' | 'preparando' | 'enviado' | 'en_transito' | 'entregado' | 'cancelado';

export type TipoVenta = 'presencial' | 'online' | 'telefono';

export type MetodoPago = 'efectivo' | 'tarjeta_debito' | 'tarjeta_credito' | 'transferencia' | 'mercadopago' | 'otro';

export type TipoDescuento = 'porcentaje' | 'monto_fijo';

export type TipoDireccion = 'envio' | 'facturacion' | 'principal';

export type WebhookStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type EstadoFactura = 'pendiente' | 'procesando' | 'completado' | 'error';


export interface INegocio {
    id_neg: number;
    nombre?: string | null;
    direccion?: string | null;
    logo?: string | null;
    telefono?: string | null;
    cuit?: string | null;
    cond_iva?: string | null;
    email?: string | null;
    color_primario?: string | null;
    color_secundario?: string | null;
    token_pago?: string | null;
    token_envio?: string | null;
}

export interface IRoles {
    id_rol: number;
    nombre?: string | null;
    descripcion?: string | null;
}

export interface IUsuarios {
    id_usuario: string;
    nombre?: string | null;
    apellido?: string | null;
    email?: string | null;
    telefono?: string | null;
    username?: string | null;
    password?: string | null;
    id_rol?: number | null;
    estado?: EstadoGeneral | null;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
    img?: string | null;
    ultimo_login?: Date | null;
    login_ip?: string | null;
    nacimiento?: Date | null;
    tipo_documento?: string | null;
    numero_documento?: string | null;
    token?: string | null;
    token_expira?: Date | null;
    // Relaciones
    rol?: IRoles | null;
}

export interface IAdmin {
    id_admin?: string | null;
    id_usuario: string;
    // Relaciones
    usuario?: IUsuarios;
}

export interface ICliente {
    id_cliente?: string | null;
    id_usuario: string;
    direccion?: string | null;
    altura?: string | null;
    piso?: string | null;
    dpto?: string | null;
    cod_postal?: number | null;
    ciudad?: string | null;
    provincia?: string | null;
    // Relaciones
    usuario?: IUsuarios;
    ventas?: IVenta[];
    direcciones?: IDireccion[];
}

// ============================================
// INTERFACES DE DIRECCIONES
// ============================================

export interface IDireccion {
    id_direccion: string;
    id_usuario?: string | null;
    id_venta?: number | null;
    
    // Campos tradicionales (coinciden con schema Prisma)
    nombre?: string | null;
    direccion?: string | null;
    altura?: string | null;
    piso?: string | null;
    dpto?: string | null;
    cod_postal?: number | null;
    ciudad?: string | null;
    provincia?: string | null;
    
    // Campos de geocodificación (OpenCage)
    latitud?: number | null;
    longitud?: number | null;
    direccion_formateada?: string | null;
    pais?: string | null;
    
    // Metadata
    es_principal?: boolean | null;
    tipo?: TipoDireccion | null;
    activo?: boolean | null;
    creado_en?: Date;
    actualizado_en?: Date | null;
}

/// DTO para respuesta normalizada de OpenCage
export interface IDireccionOpenCageDTO {
    direccion_formateada: string;
    direccion?: string;
    altura?: string;
    ciudad?: string;
    provincia?: string;
    cod_postal?: string; // OpenCage devuelve string, se parsea a number al guardar
    pais?: string;
    latitud: number;
    longitud: number;
}

/// DTO para crear/actualizar direcciones
export interface IDireccionDTO {
    nombre?: string;
    direccion: string;
    altura?: string | null;
    piso?: string | null;
    dpto?: string | null;
    cod_postal?: number | null;
    ciudad?: string | null;
    provincia?: string | null;
    pais?: string | null;
    latitud?: number | null;
    longitud?: number | null;
    direccion_formateada?: string | null;
    es_principal?: boolean;
}

export interface IClienteFilters {
    page?: number;
    limit?: number;
    order_by?: 'nombre' | 'email' | 'creado_en' | 'ultimo_login';
    order?: 'asc' | 'desc';
    busqueda?: string;
    estado?: EstadoGeneral;
    ciudad?: string;
    provincia?: string;
    creado_desde?: string;
    creado_hasta?: string;
    ultimo_login_desde?: string;
    ultimo_login_hasta?: string;
}

export interface IClienteStats {
    totalVentas: number;
    totalGastado: number;
    promedioVenta: number;
    ultimaVenta?: Date;
    productosComprados: number;
}

export interface IIva {
    id_iva: number;
    codi_impuesto: string;
    nombre?: string | null;
    porcentaje?: number | null;
    descripcion?: string | null;
    activo?: boolean | null;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
}

export interface IListaPrecio {
    id_lista: number;
    codi_lista: string;
    nombre?: string | null;
    tipo_lista?: string | null;
    venta_lista?: string | null;
    activo?: boolean | null;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
}

export interface ISituacionFiscal {
    id_sifi: number;
    codi_sifi: string;
    nombre?: string | null;
    codi_impuesto?: string | null;
    activo?: boolean | null;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
}

export interface IMarca {
    id_marca: number;
    codi_marca: string;
    nombre?: string | null;
    descripcion?: string | null;
    activo?: boolean | null;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
}

export interface IEventos {
    id_evento: number;
    nombre?: string | null;
    descripcion?: string | null;
    fecha_inicio?: Date | null;
    fecha_fin?: Date | null;
    tipo_descuento?: TipoDescuento | null;
    banner_img?: string | null;
    color_tema?: string | null;
    activo?: boolean | null;
    creado_en?: Date | null;
    url_publica?: string | null;
    // Relaciones
    reglas?: IReglasEvento[];
}

export interface IReglasEvento {
    id_regla: number;
    id_evento?: number | null;
    tipo_descuento?: TipoDescuento | null;
    valor_desc?: number | null;
    desc_regla?: string | null;
    condicion_extra?: any | null; // JSONB
    activo?: boolean | null;
    creado_en?: Date | null;
    // Relaciones
    evento?: IEventos | null;
    contenidos?: IReglasContenido[];
}

export interface IReglasContenido {
    id_contenido?: number | null;
    id_regla: number;
    tipo_objetivo?: string | null;
    id_objetivo?: number | null;
    // Relaciones
    regla?: IReglasEvento;
}

export interface IAuditoria {
    id_aud: number;
    id_usuario?: string | null;
    fecha?: Date | null;
    accion?: string | null;
    tabla_afectada?: string | null;
    dato_anterior?: any | null; // JSONB
    dato_despues?: any | null; // JSONB
    user_agent?: string | null;
    endpoint?: string | null;
    estado?: string | null;
    descripcion?: string | null;
    tiempo_procesamiento?: number | null;
    // Relaciones
    usuario?: IUsuarios | null;
}

export interface IVenta {
    id_venta: number;
    cod_interno?: string | null;
    id_usuario?: string | null;
    fecha?: Date | null;
    id_cliente?: string | null;
    total_sin_iva?: number | null;
    total_con_iva?: number | null;
    descuento_total?: number | null;
    total_neto?: number | null;
    metodo_pago?: MetodoPago | null;
    estado_pago?: EstadoPago | null;
    estado_envio?: EstadoEnvio | null;
    id_envio?: string | null;
    tipo_venta?: TipoVenta | null;
    observaciones?: string | null;
    factura_url?: string | null;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
    // Relaciones
    usuario?: IUsuarios | null;
    cliente?: ICliente | null;
    detalles?: IVentaDetalle[];
    envio?: IEnvios | null;
    direcciones?: IDireccion[];
    mercado_pago_payments?: IMercadoPagoPayment[];
}

export interface IVentaDetalle {
    id_detalle: number;
    id_venta?: number | null;
    id_prod?: number | null;
    cantidad?: number | null;
    precio_unitario?: number | null;
    descuento_aplicado?: number | null;
    sub_total?: number | null;
    evento_aplicado?: number | null;
    tipo_descuento?: TipoDescuento | null;
    // Relaciones
    venta?: IVenta | null;
    producto?: IProductos | null;
    evento?: IEventos | null;
}

export interface IEnvios {
    id_envio: string;
    id_venta?: number | null;
    empresa_envio?: string | null;
    cod_seguimiento?: string | null;
    estado_envio?: EstadoEnvio | null;
    costo_envio?: number | null;
    direccion_envio?: string | null;
    fecha_envio?: Date | null;
    fecha_entrega?: Date | null;
    observaciones?: string | null;
    // URLs de consulta (agregadas en el servicio)
    consultaUrl?: string | null;
    trackingUrl?: string | null;
    // Campos adicionales para tracking
    codigoTracking?: string | null;
    numeroSeguimiento?: string | null;
    preEnvioUrl?: string | null;
    envioUrl?: string | null;
    trazasUrl?: string | null;
    // Relaciones
    venta?: IVenta | null;
}

// =======================================
// DTOs (Data Transfer Objects)
// =======================================

// Para crear usuario
export interface ICreateUsuarioDTO {
    nombre: string;
    apellido: string;
    email: string;
    username: string;
    password: string;
    id_rol?: number;
    telefono?: string;
    nacimiento?: Date;
}

// Para login
export interface ILoginDTO {
    username: string;
    password: string;
}

// Para crear venta
export interface ICreateVentaDTO {
    id_cliente?: string;
    metodo_pago: MetodoPago;
    tipo_venta: TipoVenta;
    observaciones?: string;
    detalles: IVentaDetalleDTO[];
    costo_envio?: number; // Costo del envío calculado desde cotización
    direccion?: IDireccionDTO; // Dirección de envío
    direccionFacturacion?: IDireccionDTO; // Dirección de facturación (opcional)
}

export interface IVentaDetalleDTO {
    id_prod: number;
    cantidad: number;
    precio_unitario: number;
    descuento_aplicado?: number;
    evento_aplicado?: number;
}

// =======================================
// RESPUESTAS API
// =======================================

export interface IApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}

export interface IPaginatedResponse<T = any> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    priceRange?: {
        min: number;
        max: number;
    };
}

// =======================================
// AUTENTICACIÓN
// =======================================

export interface IJWTPayload {
    id_usuario: string;
    username: string;
    id_rol: number;
    email: string;
}

export interface IAuthResponse {
    token: string;
    usuario: Omit<IUsuarios, 'password'>;
}

// =======================================
// FILTROS Y QUERIES
// =======================================

export interface IVentaFilters {
    page?: number;
    limit?: number;
    order_by?: 'fecha' | 'total_neto' | 'creado_en' | 'estado_pago';
    order?: 'asc' | 'desc';
    busqueda?: string;
    id_cliente?: string;
    id_usuario?: string;
    fecha_desde?: string | Date;
    fecha_hasta?: string | Date;
    estado_pago?: EstadoPago;
    estado_envio?: EstadoEnvio;
    metodo_pago?: MetodoPago;
    tipo_venta?: TipoVenta;
    total_min?: number;
    total_max?: number;
}

export interface IUpdateVentaDTO {
    estado_pago?: EstadoPago;
    estado_envio?: EstadoEnvio;
    metodo_pago?: MetodoPago;
    observaciones?: string;
    id_envio?: string;
}

// =======================================
// DTOs para Marcas
// =======================================

export interface ICreateMarcaDTO {
    codi_marca: string;
    nombre: string;
    descripcion?: string;
}

export interface IUpdateMarcaDTO {
    nombre?: string;
    descripcion?: string;
}

// ============================================
// INTERFACES DE MERCADO PAGO
// ============================================

export interface IMercadoPagoPayment {
    id: bigint | number;
    venta_id: number;
    
    // Identificación MP
    payment_id: string;
    preference_id?: string | null;
    external_reference: string;
    
    // Estado del pago
    status_mp: string;
    status_detail?: string | null;
    estado_venta_relacionado?: string | null;
    
    // Método de pago
    payment_type_id: string;
    payment_method_id?: string | null;
    installments?: number | null;
    
    // Montos
    transaction_amount: number;
    total_paid_amount?: number | null;
    net_received_amount?: number | null;
    commission_amount?: number | null;
    fee_details?: any;
    
    // Moneda y tipo
    currency_id: string;
    operation_type?: string | null;
    
    // Fechas
    date_created: Date;
    date_approved?: Date | null;
    money_release_date?: Date | null;
    
    // Información adicional
    card_info?: any;
    payer_info?: any;
    processing_mode?: string | null;
    live_mode: boolean;
    
    // Metadata interna
    webhook_id?: bigint | number | null;
    webhook_processed_at?: Date | null;
    created_at: Date;
    updated_at: Date;
    notes?: string | null;
    
    // Relaciones
    venta?: IVenta;
}

// Mapeo de estados de MP a estados de venta
export const MP_STATUS_TO_VENTA_STATUS: Record<string, EstadoPago> = {
    'pending': 'pendiente',
    'in_process': 'pendiente',
    'approved': 'aprobado',
    'authorized': 'aprobado',
    'rejected': 'rechazado',
    'cancelled': 'cancelado',
    'refunded': 'cancelado',
    'charged_back': 'cancelado',
};

// ============================================
// INTERFACES DE WEBHOOKS
// ============================================

export interface IFailedWebhook {
    id: bigint | number;
    payment_id?: string | null;
    webhook_data: any;
    error_message: string;
    error_stack?: string | null;
    retry_count: number;
    max_retries: number;
    last_retry_at?: Date | null;
    next_retry_at?: Date | null;
    status: WebhookStatus;
    created_at: Date;
    updated_at: Date;
}

export interface IMercadoPagoWebhookEvent {
    action: string;
    data: {
        id: string | number;
    };
    type?: string;
    date_created?: string;
    user_id?: string;
    api_version?: string;
}

// ============================================
// INTERFACES DE EVENT BUS
// ============================================

export interface IEventLog {
    id: bigint | number;
    event_type: string;
    payload: any;
    handlers_executed: number;
    handlers_succeeded: number;
    handlers_failed: number;
    total_duration_ms?: number | null;
    handler_results?: any;
    source?: string | null;
    triggered_by?: string | null;
    created_at: Date;
}

/// Handler de eventos
export type EventHandler<T = unknown> = (payload: T) => Promise<void>;

/// Handler registrado con metadata
export interface RegisteredHandler<T = unknown> {
    name: string;
    handler: EventHandler<T>;
    priority?: number;
}

/// Resultado de ejecución de un handler
export interface HandlerResult {
    handlerName: string;
    status: 'fulfilled' | 'rejected';
    duration: number;
    error?: Error;
}

/// Resultado de emisión de un evento
export interface EmitResult {
    eventType: string;
    handlersExecuted: number;
    handlersSucceeded: number;
    handlersFailed: number;
    totalDuration: number;
    results: HandlerResult[];
}

// ============================================
// TIPOS DE EVENTOS
// ============================================

/// Evento emitido cuando un pedido cambia de 'pendiente' a 'aprobado'
export interface PedidoConfirmadoEvent {
    id_venta: number;
    fecha_confirmacion: Date;
    estado_anterior: 'pendiente';
    estado_actual: 'aprobado';
    id_cliente: string | null;
    cliente_email: string | null;
    cliente_nombre: string | null;
    total_neto: number | null;
    metodo_pago: string | null;
    tipo_venta: string | null;
    timestamp: Date;
}

/// Evento emitido cuando se crea un nuevo pedido
export interface PedidoCreadoEvent {
    id_venta: number;
    id_cliente: string | null;
    total_neto: number | null;
    metodo_pago: string | null;
    tipo_venta: string | null;
    timestamp: Date;
}

/// Evento emitido cuando un pedido es cancelado
export interface PedidoCanceladoEvent {
    id_venta: number;
    id_cliente: string | null;
    motivo?: string;
    timestamp: Date;
}

/// Evento emitido cuando se genera código de envío
export interface CodigoEnvioGeneradoEvent {
    id_venta: number;
    id_envio: string;
    codigo_seguimiento: string;
    empresa_envio: string;
    timestamp: Date;
}

/// Mapa de todos los eventos disponibles
export interface EventMap {
    PedidoConfirmado: PedidoConfirmadoEvent;
    PedidoCreado: PedidoCreadoEvent;
    PedidoCancelado: PedidoCanceladoEvent;
    CodigoEnvioGenerado: CodigoEnvioGeneradoEvent;
}

/// Tipos de eventos disponibles
export type EventType = keyof EventMap;

// ============================================
// INTERFACES DE FACTURAS PENDIENTES
// ============================================

export interface IVentaPendienteFactura {
    id: bigint | number;
    venta_id: number;
    fecha_creacion: Date;
    fecha_ultimo_intento?: Date | null;
    intentos: number;
    estado: EstadoFactura;
    error_mensaje?: string | null;
    factura_encontrada: boolean;
    factura_nombre_archivo?: string | null;
    procesado_en?: Date | null;
    // Relaciones
    venta?: IVenta;
}
