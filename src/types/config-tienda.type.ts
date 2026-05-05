/**
 * Datos bancarios para transferencia / efectivo.
 * Reutilizado en config tienda, checkout resultado y emails.
 */
export interface IDatosBancarios {
  banco: string;
  tipo_cuenta: string;
  numero_cuenta: string;
  cbu?: string | null;
  alias?: string | null;
  titular: string;
  cuit?: string | null;
  instrucciones?: string | null;
}

export interface IConfigTienda {
  envio_gratis_minimo: number | null;
  envio_gratis_activo: boolean;
  cuotas_sin_interes: number | null;
  cuotas_sin_interes_activo: boolean;
  cuotas_sin_interes_minimo: number | null;
  datos_bancarios: IDatosBancarios | null;
  modo_mantenimiento: boolean;
  /** Identidad de tienda (pública, para UI / mantenimiento) */
  nombre: string | null;
  direccion: string | null;
  logo: string | null;
  telefono: string | null;
}

export interface IUpdateConfigTiendaDTO {
  envio_gratis_minimo?: number;
  envio_gratis_activo?: boolean;
  cuotas_sin_interes?: number;
  cuotas_sin_interes_activo?: boolean;
  cuotas_sin_interes_minimo?: number;
  datos_bancarios?: Partial<IDatosBancarios> | null;
  modo_mantenimiento?: boolean;
}
