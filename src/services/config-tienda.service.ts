import { prisma } from '../index';
import { auditService } from './audit.service';
import { IConfigTienda, IUpdateConfigTiendaDTO } from '../types/config-tienda.type';

export type AuditContext = {
  userId: string;
  userAgent?: string | null;
  endpoint?: string | null;
};

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

export interface IPaymentInstallmentsConfig {
  cuotasSinInteres: number | null;
  cuotasSinInteresMinimo: number | null;
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

  async updateConfig(dto: IUpdateConfigTiendaDTO, auditContext?: AuditContext): Promise<IConfigTienda> {
    const negocio = await prisma.negocio.findFirst();
    if (!negocio) {
      const created = await prisma.negocio.create({
        data: {
          envio_gratis_minimo: String(dto.envio_gratis_minimo ?? 100000),
          cuotas_sin_interes: String(dto.cuotas_sin_interes ?? 3),
          cuotas_sin_interes_minimo: String(dto.cuotas_sin_interes_minimo ?? 80000),
        },
      });
      const result = fromDb(created);
      if (auditContext) {
        await auditService.record({
          action: 'CONFIG_TIENDA_UPDATE',
          table: 'negocio',
          description: 'Creación/actualización de configuración de tienda',
          previousData: null,
          currentData: result as unknown as Record<string, unknown>,
          userId: auditContext.userId,
          userAgent: auditContext.userAgent ?? null,
          endpoint: auditContext.endpoint ?? null,
          status: 'SUCCESS',
          adminAudit: true,
        });
      }
      return result;
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
    const result = fromDb(updated);
    if (auditContext) {
      await auditService.record({
        action: 'CONFIG_TIENDA_UPDATE',
        table: 'negocio',
        description: 'Actualización de configuración de tienda',
        previousData: current as unknown as Record<string, unknown>,
        currentData: result as unknown as Record<string, unknown>,
        userId: auditContext.userId,
        userAgent: auditContext.userAgent ?? null,
        endpoint: auditContext.endpoint ?? null,
        status: 'SUCCESS',
        adminAudit: true,
      });
    }
    return result;
  }

  /**
   * Configuración raw para reglas de pago.
   * Si el valor viene null/0 (o inválido), se considera "no configurado".
   */
  async getPaymentInstallmentsConfig(): Promise<IPaymentInstallmentsConfig> {
    const negocio = await prisma.negocio.findFirst({
      select: { cuotas_sin_interes: true, cuotas_sin_interes_minimo: true },
    });

    if (!negocio) {
      return {
        cuotasSinInteres: null,
        cuotasSinInteresMinimo: null,
      };
    }

    const cuotas = negocio.cuotas_sin_interes != null ? Number(negocio.cuotas_sin_interes) : null;
    const minimo = negocio.cuotas_sin_interes_minimo != null ? Number(negocio.cuotas_sin_interes_minimo) : null;

    return {
      cuotasSinInteres: cuotas && Number.isFinite(cuotas) && cuotas > 0 ? cuotas : null,
      cuotasSinInteresMinimo: minimo && Number.isFinite(minimo) && minimo > 0 ? minimo : null,
    };
  }
}
