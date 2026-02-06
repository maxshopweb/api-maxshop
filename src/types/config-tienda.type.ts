export interface IConfigTienda {
  envio_gratis_minimo: number | null;
  cuotas_sin_interes: number | null;
  cuotas_sin_interes_minimo: number | null;
}

export interface IUpdateConfigTiendaDTO {
  envio_gratis_minimo?: number;
  cuotas_sin_interes?: number;
  cuotas_sin_interes_minimo?: number;
}
