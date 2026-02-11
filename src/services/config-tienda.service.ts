import { prisma } from '../index';
import { IConfigTienda, IUpdateConfigTiendaDTO } from '../types/config-tienda.type';

const DEFAULTS: IConfigTienda = {
  envio_gratis_minimo: 100000,
  cuotas_sin_interes: 3,
  cuotas_sin_interes_minimo: 80000,
};

function fromDb(row: {
  envio_gratis_minimo: unknown;
  cuotas_sin_interes: unknown;
  cuotas_sin_interes_minimo: unknown;
}): IConfigTienda {
  return {
    envio_gratis_minimo: row.envio_gratis_minimo != null ? Number(row.envio_gratis_minimo) : null,
    cuotas_sin_interes: row.cuotas_sin_interes != null ? Number(row.cuotas_sin_interes) : null,
    cuotas_sin_interes_minimo: row.cuotas_sin_interes_minimo != null ? Number(row.cuotas_sin_interes_minimo) : null,
  };
}

export class ConfigTiendaService {
  async getConfig(): Promise<IConfigTienda> {
    const negocio = await prisma.negocio.findFirst({
      select: { envio_gratis_minimo: true, cuotas_sin_interes: true, cuotas_sin_interes_minimo: true },
    });
    if (!negocio) return DEFAULTS;
    const config = fromDb(negocio);
    return {
      envio_gratis_minimo: config.envio_gratis_minimo ?? DEFAULTS.envio_gratis_minimo,
      cuotas_sin_interes: config.cuotas_sin_interes ?? DEFAULTS.cuotas_sin_interes,
      cuotas_sin_interes_minimo: config.cuotas_sin_interes_minimo ?? DEFAULTS.cuotas_sin_interes_minimo,
    };
  }

  async updateConfig(dto: IUpdateConfigTiendaDTO): Promise<IConfigTienda> {
    const negocio = await prisma.negocio.findFirst();
    if (!negocio) {
      const created = await prisma.negocio.create({
        data: {
          envio_gratis_minimo: String(dto.envio_gratis_minimo ?? 100000),
          cuotas_sin_interes: String(dto.cuotas_sin_interes ?? 3),
          cuotas_sin_interes_minimo: String(dto.cuotas_sin_interes_minimo ?? 80000),
        },
      });
      return fromDb(created);
    }
    const current = fromDb(negocio);
    const envio = dto.envio_gratis_minimo ?? current.envio_gratis_minimo ?? DEFAULTS.envio_gratis_minimo;
    const cuotas = dto.cuotas_sin_interes ?? current.cuotas_sin_interes ?? DEFAULTS.cuotas_sin_interes;
    const cuotasMin = dto.cuotas_sin_interes_minimo ?? current.cuotas_sin_interes_minimo ?? DEFAULTS.cuotas_sin_interes_minimo;
    const envioNum = typeof envio === 'number' ? envio : Number(envio);
    const cuotasNum = typeof cuotas === 'number' ? cuotas : Number(cuotas);
    const cuotasMinNum = typeof cuotasMin === 'number' ? cuotasMin : Number(cuotasMin);
    const currentEnvio = current.envio_gratis_minimo ?? DEFAULTS.envio_gratis_minimo;
    const currentCuotas = current.cuotas_sin_interes ?? DEFAULTS.cuotas_sin_interes;
    const currentCuotasMin = current.cuotas_sin_interes_minimo ?? DEFAULTS.cuotas_sin_interes_minimo;
    if (envioNum === currentEnvio && cuotasNum === currentCuotas && cuotasMinNum === currentCuotasMin) {
      return current;
    }
    const updated = await prisma.negocio.update({
      where: { id_neg: negocio.id_neg },
      data: {
        envio_gratis_minimo: String(envioNum),
        cuotas_sin_interes: String(cuotasNum),
        cuotas_sin_interes_minimo: String(cuotasMinNum),
      },
    });
    return fromDb(updated);
  }
}
