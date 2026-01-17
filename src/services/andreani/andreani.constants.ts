/**
 * Constantes y enums de Andreani para uso en frontend/backend
 */

/**
 * Estados del pre-envío según documentación de Andreani
 */
export enum EstadoPreEnvio {
    PENDIENTE = 'Pendiente',           // La API aún no se comunicó con el TMS
    SOLICITADO = 'Solicitado',         // La API se comunicó con el TMS pero aún no tuvo respuesta
    CREADA = 'Creada',                 // El TMS ACEPTÓ el pre-envío
    RECHAZADO = 'Rechazado',           // El TMS NO ACEPTÓ el pre-envío
}

/**
 * Estados del pre-envío como objeto para usar en badges/UI
 */
export const ESTADOS_PRE_ENVIO = {
    PENDIENTE: {
        valor: 'Pendiente',
        label: 'Pendiente',
        descripcion: 'La API aún no se comunicó con el TMS',
        color: 'warning', // Para badges
    },
    SOLICITADO: {
        valor: 'Solicitado',
        label: 'Solicitado',
        descripcion: 'La API se comunicó con el TMS pero aún no tuvo respuesta',
        color: 'info',
    },
    CREADA: {
        valor: 'Creada',
        label: 'Creada',
        descripcion: 'El TMS ACEPTÓ el pre-envío y ya es posible admitirlo físicamente',
        color: 'success',
    },
    RECHAZADO: {
        valor: 'Rechazado',
        label: 'Rechazado',
        descripcion: 'El TMS NO ACEPTÓ el pre-envío (contratos incorrectos, falta de datos, etc.)',
        color: 'error',
    },
} as const;

/**
 * Obtiene la información de un estado del pre-envío
 */
export function getEstadoPreEnvio(estado: string) {
    const estadoUpper = estado.charAt(0).toUpperCase() + estado.slice(1).toLowerCase();
    return ESTADOS_PRE_ENVIO[estadoUpper as keyof typeof ESTADOS_PRE_ENVIO] || {
        valor: estado,
        label: estado,
        descripcion: 'Estado desconocido',
        color: 'default',
    };
}

