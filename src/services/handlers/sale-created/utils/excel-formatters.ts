/**
 * Utilidades para formatear datos al formato requerido por el Excel de ventas
 */

import { Decimal } from '@prisma/client/runtime/library';

/**
 * Formatea una fecha al formato español completo: "8 de mayo de 2025 16:37 hs."
 */
export function formatFechaVenta(fecha: Date | null | undefined): string {
  if (!fecha) return '';
  
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  
  const dia = fecha.getDate();
  const mes = meses[fecha.getMonth()];
  const año = fecha.getFullYear();
  const horas = fecha.getHours().toString().padStart(2, '0');
  const minutos = fecha.getMinutes().toString().padStart(2, '0');
  
  return `${dia} de ${mes} de ${año} ${horas}:${minutos} hs.`;
}

/**
 * Formatea una fecha al formato DD-MM-YYYY HH:MM
 */
export function formatFechaAprobacion(fecha: Date | null | undefined): string {
  if (!fecha) return '';
  
  const dia = fecha.getDate().toString().padStart(2, '0');
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const año = fecha.getFullYear();
  const horas = fecha.getHours().toString().padStart(2, '0');
  const minutos = fecha.getMinutes().toString().padStart(2, '0');
  
  return `${dia}-${mes}-${año} ${horas}:${minutos}`;
}

/**
 * Convierte un número a string sin decimales (redondeado)
 */
export function formatNumeroSinDecimales(num: number | Decimal | null | undefined): string {
  if (num === null || num === undefined) return '';
  const valor = typeof num === 'number' ? num : Number(num);
  return Math.round(valor).toString();
}

/**
 * Formatea un número con 2 decimales (para columna AL - Estado)
 */
export function formatEstado(num: number | Decimal | null | undefined): string {
  if (num === null || num === undefined) return '0';
  const valor = typeof num === 'number' ? num : Number(num);
  return valor.toFixed(2);
}

/**
 * Mapea el estado de pago de MP a español
 */
export function mapMPStatusToSpanish(status: string | null | undefined): string {
  if (!status) return '';
  
  const map: Record<string, string> = {
    'approved': 'Aprobado',
    'pending': 'Pendiente',
    'in_process': 'En proceso',
    'rejected': 'Rechazado',
    'cancelled': 'Cancelado',
    'refunded': 'Reembolsado',
    'charged_back': 'Contracargo',
  };
  
  return map[status.toLowerCase()] || status;
}

/**
 * Mapea el detalle de estado de MP a español
 */
export function mapMPStatusDetailToSpanish(detail: string | null | undefined): string {
  if (!detail) return '';
  
  const map: Record<string, string> = {
    'accredited': 'Acreditado',
    'pending_contingency': 'Pendiente de acreditación',
    'pending_review_manual': 'Pendiente de revisión',
    'cc_rejected_bad_filled_card_number': 'Tarjeta rechazada - número inválido',
    'cc_rejected_bad_filled_date': 'Tarjeta rechazada - fecha inválida',
    'cc_rejected_bad_filled_other': 'Tarjeta rechazada - datos inválidos',
    'cc_rejected_bad_filled_security_code': 'Tarjeta rechazada - código de seguridad inválido',
    'cc_rejected_blacklist': 'Tarjeta rechazada - en lista negra',
    'cc_rejected_call_for_authorize': 'Tarjeta rechazada - requiere autorización',
    'cc_rejected_card_disabled': 'Tarjeta rechazada - tarjeta deshabilitada',
    'cc_rejected_card_error': 'Tarjeta rechazada - error en tarjeta',
    'cc_rejected_duplicated_payment': 'Tarjeta rechazada - pago duplicado',
    'cc_rejected_high_risk': 'Tarjeta rechazada - alto riesgo',
    'cc_rejected_insufficient_amount': 'Tarjeta rechazada - fondos insuficientes',
    'cc_rejected_invalid_installments': 'Tarjeta rechazada - cuotas inválidas',
    'cc_rejected_max_attempts': 'Tarjeta rechazada - máximo de intentos',
    'cc_rejected_other_reason': 'Tarjeta rechazada - otra razón',
  };
  
  return map[detail.toLowerCase()] || detail;
}

/**
 * Mapea el método de pago de MP a español
 */
export function mapPaymentMethodToSpanish(methodId: string | null | undefined): string {
  if (!methodId) return '';
  
  const map: Record<string, string> = {
    'account_money': 'Dinero en Cuenta',
    'credit_card': 'Tarjeta de Crédito',
    'debit_card': 'Tarjeta de Débito',
    'ticket': 'Ticket',
    'bank_transfer': 'Transferencia Bancaria',
    'atm': 'Cajero Automático',
    'digital_currency': 'Moneda Digital',
  };
  
  return map[methodId.toLowerCase()] || methodId;
}

/**
 * Mapea el tipo de pago de MP a español (tipo de tarjeta)
 */
export function mapPaymentTypeToSpanish(
  typeId: string | null | undefined,
  cardInfo?: any
): string {
  if (!typeId) return '';
  
  // Si es account_money, retornar directamente
  if (typeId.toLowerCase() === 'account_money') {
    return 'Dinero en Cuenta';
  }
  
  // Si hay información de tarjeta, usar el tipo de tarjeta
  if (cardInfo?.card?.cardholder?.name) {
    // Intentar determinar el tipo de tarjeta desde el payment_method_id
    const methodId = cardInfo.payment_method_id || '';
    if (methodId.includes('visa')) return 'Visa';
    if (methodId.includes('master')) return 'Mastercard';
    if (methodId.includes('amex')) return 'American Express';
    if (methodId.includes('naranja')) return 'Naranja';
    if (methodId.includes('cabal')) return 'Cabal';
  }
  
  // Mapeo genérico
  const map: Record<string, string> = {
    'credit_card': 'Tarjeta de Crédito',
    'debit_card': 'Tarjeta de Débito',
  };
  
  return map[typeId.toLowerCase()] || typeId;
}

/**
 * Formatea tipo y número de documento
 */
export function formatTipoDocumento(
  tipo: string | null | undefined,
  numero: string | number | null | undefined
): string {
  if (!numero) return '';
  
  const numStr = numero.toString();
  
  // Si el tipo está en el número (ej: "DNI 12345678")
  if (tipo && tipo.toLowerCase().includes('dni')) {
    return `DNI ${numStr}`;
  }
  if (tipo && tipo.toLowerCase().includes('cuit')) {
    return `CUIT ${numStr}`;
  }
  
  // Intentar determinar por longitud
  if (numStr.length <= 8) {
    return `DNI ${numStr}`;
  } else if (numStr.length === 11) {
    return `CUIT ${numStr}`;
  }
  
  return numStr;
}

/**
 * Formatea dirección de facturación
 */
export function formatDireccionFacturacion(
  direccion: string | null | undefined,
  ciudad: string | null | undefined,
  codPostal: number | string | null | undefined,
  provincia: string | null | undefined
): string {
  const parts: string[] = [];
  
  if (direccion) parts.push(direccion);
  if (ciudad) parts.push(ciudad);
  if (codPostal) parts.push(`C.P.: ${codPostal}`);
  if (provincia) parts.push(provincia);
  
  return parts.join(' - ') || '';
}

/**
 * Formatea dirección de envío con referencia
 */
export function formatDireccionEnvio(
  direccionFormateada: string | null | undefined,
  direccion: string | null | undefined,
  referencia: string | null | undefined,
  codPostal: number | string | null | undefined,
  ciudad: string | null | undefined,
  provincia: string | null | undefined
): string {
  // Si hay dirección formateada (de OpenCage), usarla
  if (direccionFormateada) {
    return direccionFormateada;
  }
  
  // Construir desde partes
  const parts: string[] = [];
  
  if (direccion) parts.push(direccion);
  if (referencia) parts.push(`Referencia: ${referencia}`);
  if (codPostal) parts.push(`CP ${codPostal}`);
  if (ciudad) parts.push(ciudad);
  if (provincia) parts.push(provincia);
  
  return parts.join(' - ') || '';
}
