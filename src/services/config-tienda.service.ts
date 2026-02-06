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
          envio_gratis_minimo: dto.envio_gratis_minimo ?? 100000,
          cuotas_sin_interes: dto.cuotas_sin_interes ?? 3,
          cuotas_sin_interes_minimo: dto.cuotas_sin_interes_minimo ?? 80000,
        },
      });
      return fromDb(created);
    }
    const updated = await prisma.negocio.update({
      where: { id_neg: negocio.id_neg },
      data: {
        ...(dto.envio_gratis_minimo !== undefined && { envio_gratis_minimo: dto.envio_gratis_minimo }),
        ...(dto.cuotas_sin_interes !== undefined && { cuotas_sin_interes: dto.cuotas_sin_interes }),
        ...(dto.cuotas_sin_interes_minimo !== undefined && { cuotas_sin_interes_minimo: dto.cuotas_sin_interes_minimo }),
      },
    });
    return fromDb(updated);
  }
}
