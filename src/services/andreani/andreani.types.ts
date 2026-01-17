/**
 * Tipos TypeScript para la integración con Andreani
 * 
 * Estos tipos representan las estructuras de datos
 * que maneja la API de Andreani.
 */

// ============================================
// ENUMS Y CONSTANTES
// ============================================

// Los estados y constantes están en andreani.constants.ts para mejor organización
// Se re-exportan aquí para compatibilidad
export { EstadoPreEnvio, ESTADOS_PRE_ENVIO, getEstadoPreEnvio } from './andreani.constants';

// ============================================
// REQUEST TYPES
// ============================================

/**
 * Datos para crear una orden de envío (POST request)
 * Esta es la estructura que se ENVÍA a Andreani para crear un pre-envío
 */
export interface ICreateOrdenEnvioRequest {
    contrato: string; // OBLIGATORIO: ANDREANI_CONTRATO_DOM o ANDREANI_CONTRATO_SUC
    tipoDeServicio?: string;
    sucursalClienteID?: number;
    
    origen: {
        postal?: IDomicilioCompleto;
        sucursal?: ISucursalCompleta;
        coordenadas?: ICoordenadas;
    };
    
    destino: {
        postal?: IDomicilioCompleto;
        sucursal?: ISucursalCompleta;
        coordenadas?: ICoordenadas;
    };
    
    idPedido?: string;
    
    remitente: {
        nombreCompleto: string;
        email: string;
        documentoTipo: string;
        documentoNumero: string;
        telefonos: Array<{
            tipo: number; // 1 = Fijo, 2 = Móvil
            numero: string;
        }>;
    };
    
    destinatario: Array<{
        nombreCompleto: string;
        email: string;
        documentoTipo: string;
        documentoNumero: string;
        telefonos: Array<{
            tipo: number; // 1 = Fijo, 2 = Móvil
            numero: string;
        }>;
    }>;
    
    remito?: {
        numeroRemito: string;
        complementarios: string[];
    };
    
    centroDeCostos?: string;
    productoAEntregar?: string;
    productoARetirar?: string;
    tipoProducto?: string;
    categoriaFacturacion?: string;
    pagoDestino?: number;
    valorACobrar?: number;
    
    fechaDeEntrega?: {
        fecha: string;
        horaDesde: string;
        horaHasta: string;
    };
    
    codigoVerificadorDeEntrega?: string;
    
    bultos: Array<{
        kilos: number;
        largoCm?: number;
        altoCm?: number;
        anchoCm?: number;
        volumenCm: number; // OBLIGATORIO
        valorDeclaradoSinImpuestos?: number;
        valorDeclaradoConImpuestos?: number;
        referencias?: Array<{
            meta?: string;
            contenido?: string;
        }>;
        descripcion?: string;
        numeroDeEnvio?: string; // Solo si se está actualizando
        valorDeclarado?: number; // Legacy
        componentes?: {
            numeroAgrupador: string;
            componentesHijos: Array<{
                numeroHijo: string;
                referencias?: Array<{
                    meta?: string;
                    contenido?: string;
                }>;
            }>;
        };
        ean?: string;
    }>;
    
    pagoPendienteEnMostrador?: boolean;
}

/**
 * Estructura de sucursal de Andreani (para RESPONSE)
 */
export interface ISucursal {
    nomenclatura: string;
    descripcion: string;
    id: string;
}

export interface IRemitente {
    nombreCompleto: string;
    email: string;
    documentoTipo: string;
    documentoNumero: string;
    telefonos: ITelefono[];
    domicilio: IDomicilio;
}

export interface IDestinatario {
    nombreCompleto: string;
    email: string;
    documentoTipo: string;
    documentoNumero: string;
    telefonos: ITelefono[];
    domicilio: IDomicilio;
}

export interface ITelefono {
    tipo: 'F' | 'M' | 1 | 2; // F = Fijo, M = Móvil, 1 = Fijo (numérico), 2 = Móvil (numérico)
    numero: string;
}

export interface IDomicilio {
    calle: string;
    numero: string;
    piso?: string;
    departamento?: string;
    codigoPostal: string;
    localidad: string;
    provincia?: string; // Opcional para compatibilidad
    region?: string; // Usado en origen/destino según documentación
    pais?: string;
}

/**
 * Domicilio completo según estructura de Andreani (para POST)
 */
export interface IDomicilioCompleto {
    codigoPostal: string;
    calle: string;
    numero: string;
    piso?: string;
    departamento?: string;
    localidad: string;
    region?: string;
    pais?: string;
    casillaDeCorreo?: string;
    componentesDeDireccion?: Array<{
        meta?: string;
        contenido?: string;
    }>;
}

/**
 * Sucursal completa según estructura de Andreani (para POST)
 */
export interface ISucursalCompleta {
    id: string;
    nomenclatura?: string;
    descripcion?: string;
    direccion?: IDomicilioCompleto;
    telefonos?: {
        telefono: Array<{
            tipo: number;
            numero: string;
        }>;
    };
    datosAdicionales?: {
        matadatos?: Array<{
            meta?: string;
            contenido?: string;
        }>;
    };
}

/**
 * Coordenadas geográficas
 */
export interface ICoordenadas {
    elevacion?: number;
    latitud?: number;
    longitud?: number;
    poligono?: number;
}

export interface IBulto {
    kilos: number;
    largo?: number;
    ancho?: number;
    alto?: number;
    largoCm?: number; // Usado en formato de Andreani
    anchoCm?: number; // Usado en formato de Andreani
    altoCm?: number; // Usado en formato de Andreani
    valorDeclarado?: number;
    descripcion?: string;
}

/**
 * Estructura de bulto para B2C (formato completo según documentación)
 */
export interface IBultoB2C {
    numeroDeBulto: string;
    numeroDeEnvio?: string | null;
    totalizador: string; // "1/1", "1/2", etc.
    kilos: number;
    largoCm?: number;
    altoCm?: number;
    anchoCm?: number;
    volumenCm: number; // OBLIGATORIO
    valorDeclaradoSinImpuestos?: number; // OBLIGATORIO para B2B, opcional para B2C
    valorDeclaradoConImpuestos?: number;
    descripcion?: string;
    ean?: string;
    referencias?: Array<{
        meta?: string;
        contenido?: string;
    }>;
    linking?: Array<{
        meta: string;
        contenido: string;
    }>;
}

/**
 * Request para cotizar un envío
 * La API de tarifas usa query params (GET), no POST
 */
export interface ICotizarEnvioRequest {
    cpDestino: string; // Código postal del destino (OBLIGATORIO)
    contrato: string; // Código de contrato con Andreani (OBLIGATORIO)
    cliente: string; // Código Cliente dentro de Andreani (OBLIGATORIO)
    sucursalOrigen?: string; // Sucursal Origen (opcional)
    'bultos[0][valorDeclarado]'?: string; // Valor del bulto sin impuestos (opcional)
    'bultos[0][volumen]': string; // Volumen del bulto en cm3 (OBLIGATORIO)
    'bultos[0][kilos]'?: string; // Peso del bulto en kilos (opcional)
    'bultos[0][altoCm]'?: string; // Alto del bulto en cm (opcional)
    'bultos[0][largoCm]'?: string; // Largo del bulto en cm (opcional)
    'bultos[0][anchoCm]'?: string; // Ancho del bulto en cm (opcional)
}

/**
 * Respuesta de cotización de Andreani
 */
export interface ICotizarEnvioResponseRaw {
    pesoAforado: string;
    tarifaSinIva: {
        seguroDistribucion: string;
        distribucion: string;
        total: string;
    };
    tarifaConIva: {
        seguroDistribucion: string;
        distribucion: string;
        total: string;
    };
    errores?: IError[];
}

// ============================================
// RESPONSE TYPES
// ============================================

/**
 * Respuesta de autenticación
 */
export interface IAuthResponse {
    token: string;
    expiresIn?: number;
}

/**
 * Respuesta al crear una orden de envío (RESPONSE del pre-envío)
 * Esta es la estructura que DEVUELVE Andreani después de crear un pre-envío
 */
export interface IOrdenEnvioResponse {
    estado: string; // "Pendiente", "Solicitado", "Creada", "Rechazado"
    tipo: string; // "B2C"
    sucursalDeDistribucion: ISucursal;
    sucursalDeRendicion: ISucursal;
    sucursalDeImposicion?: ISucursal | {};
    sucursalAbastecedora?: ISucursal | {};
    fechaCreacion: string;
    numeroDePermisionaria: string;
    descripcionServicio: string;
    bultos: Array<{
        numeroDeBulto: string;
        numeroDeEnvio: string;
        totalizador: string; // "1/1", "1/2", etc.
        linking: Array<{
            meta: string;
            contenido: string;
        }>;
    }>;
    agrupadorDeBultos: string;
    etiquetasPorAgrupador: string;
}

/**
 * Respuesta al consultar una orden (formato B2C)
 */
export interface IConsultaOrdenResponse {
    estado?: string;
    tipo?: string;
    sucursalDeDistribucion?: ISucursal;
    sucursalDeRendicion?: ISucursal;
    sucursalDeImposicion?: ISucursal;
    sucursalAbastecedora?: ISucursal;
    fechaCreacion?: string;
    numeroDePermisionaria?: string;
    descripcionServicio?: string;
    bultos?: Array<{
        numeroDeBulto?: string;
        numeroDeEnvio?: string;
        totalizador?: string;
        linking?: Array<{
            meta?: string;
            contenido?: string;
        }>;
    }>;
    agrupadorDeBultos?: string;
    etiquetasPorAgrupador?: string;
    numeroDeOrden?: string;
    numeroDeEnvio?: string;
    numeroDeTracking?: string;
    fechaActualizacion?: string;
    contrato?: string;
    remitente?: IRemitente;
    destinatario?: IDestinatario;
    costo?: number;
    eventos?: IEventoEnvio[];
    errores?: IError[];
}

/**
 * Respuesta al obtener etiquetas
 */
export interface IEtiquetaResponse {
    numeroDeEnvio?: string;
    numeroDeTracking?: string;
    etiqueta?: {
        url?: string;
        numero?: string;
        formato?: string;
    };
    errores?: IError[];
}

/**
 * Estado del envío (genérico, para compatibilidad)
 */
export interface IEstadoEnvioResponse {
    numeroDeEnvio?: string;
    numeroDeTracking?: string;
    estado?: string;
    fechaActualizacion?: string;
    eventos?: IEventoEnvio[];
    errores?: IError[];
}

/**
 * Respuesta al consultar estado de un ENVÍO REAL (no pre-envío)
 * Endpoint: GET /v2/envios/{numeroAndreani}
 */
export interface IEstadoEnvioRealResponse {
    numeroDeTracking: string;
    contrato: string;
    ciclo: string;
    estado: string;
    estadoId: number;
    fechaEstado: string;
    sucursalDeDistribucion: ISucursal;
    fechaCreacion: string;
    destino: {
        Postal?: {
            localidad: string;
            pais: string;
            direccion: string;
            codigoPostal: string;
            region?: string;
        };
    };
    remitente: {
        nombreYApellido?: string;
        [key: string]: any;
    };
    destinatario: {
        nombreYApellido: string;
        tipoYNumeroDeDocumento?: string;
        eMail?: string;
    };
    bultos: Array<{
        kilos: number;
        valorDeclaradoConImpuestos?: number;
        IdDeProducto?: string;
        volumen?: number;
    }>;
    idDeProducto?: string;
    referencias?: string[];
    servicio?: string;
}

/**
 * Respuesta al consultar trazas de un ENVÍO REAL
 * Endpoint: GET /v2/envios/{numeroAndreani}/trazas
 */
export interface ITrazasEnvioResponse {
    eventos: Array<{
        Fecha: string;
        Estado: string;
        EstadoId: number;
        Traduccion: string;
        Sucursal: string;
        SucursalId: number;
        Ciclo: string;
        Motivo?: string;
        MotivoId?: number;
    }>;
}

export interface IEventoEnvio {
    fecha?: string;
    estado?: string;
    descripcion?: string;
    sucursal?: string;
    observaciones?: string;
}

export interface IError {
    codigo?: string;
    mensaje?: string;
    campo?: string;
}


/**
 * Respuesta normalizada de cotización
 */
export interface ICotizarEnvioResponse {
    proveedor: 'ANDREANI';
    precio: number; // Precio total con IVA
    moneda: 'ARS';
    plazoEntrega: string;
    servicio: string;
    entorno: 'QA' | 'PROD';
    pesoAforado?: string;
    tarifaSinIva?: {
        seguroDistribucion: string;
        distribucion: string;
        total: string;
    };
    tarifaConIva?: {
        seguroDistribucion: string;
        distribucion: string;
        total: string;
    };
}

// ============================================
// INTERNAL TYPES
// ============================================

/**
 * Opciones para hacer requests a la API
 */
export interface IApiRequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
    retryOnAuthError?: boolean;
}

/**
 * Resultado de una operación de API
 */
export interface IApiResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    statusCode?: number;
}

