/**
 * Diferencia de cabecera Excel (columna AH): envío / ajuste de pedido.
 * Cupón y transferencia bajan total_neto sin tocar total_con_iva; se restan
 * para no mezclarlos con el envío.
 */
export function computeCabeceraDiferenciaEnvio(
  totalConIva: number,
  totalNeto: number,
  descuentoCupon = 0,
  descuentoTransferencia = 0
): number {
  return totalConIva - totalNeto - descuentoCupon - descuentoTransferencia;
}
