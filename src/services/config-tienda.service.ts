import { prisma } from '../index';
import { auditService } from './audit.service';
import {
  IConfigTienda,
  IUpdateConfigTiendaDTO,
  IDatosBancarios,
} from '../types/config-tienda.type';

export type AuditContext = {
  userId: string;
  userAgent?: string | null;
  endpoint?: string | null;
};

const DEFAULTS: IConfigTienda = {
  envio_gratis_minimo: 100000,
  envio_gratis_activo: true,
  cuotas_sin_interes: 3,
  cuotas_sin_interes_activo: true,
  cuotas_sin_interes_minimo: 80000,
  datos_bancarios: null,
  modo_mantenimiento: false,
  nombre: null,
  direccion: null,
  logo: null,
  telefono: null,
};

type NegocioRow = {
  envio_gratis_minimo: unknown;
  envio_gratis_activo: boolean | null;
  cuotas_sin_interes: unknown;
  cuotas_sin_interes_activo: boolean | null;
  cuotas_sin_interes_minimo: unknown;
  modo_mantenimiento?: boolean | null;
  nombre?: string | null;
  direccion?: string | null;
  logo?: string | null;
  telefono?: string | null;
  cuit?: string | null;
  banco?: string | null;
  tipo_cuenta?: string | null;
  numero_cuenta?: string | null;
  cbu?: string | null;
  alias?: string | null;
  instrucciones?: string | null;
};

const BANK_SELECT = {
  nombre: true,
  cuit: true,
  banco: true,
  tipo_cuenta: true,
  numero_cuenta: true,
  cbu: true,
  alias: true,
  instrucciones: true,
} as const;

function toStr(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/**
 * Mapea fila de negocio a IDatosBancarios.
 * Retorna null si no hay datos mínimos (titular o banco/numero_cuenta).
 */
function mapToDatosBancarios(row: NegocioRow | null): IDatosBancarios | null {
  if (!row) return null;
  const titular = toStr(row.nombre) ?? '';
  const banco = toStr(row.banco) ?? '';
  const tipoCuenta = toStr(row.tipo_cuenta) ?? '';
  const numeroCuenta = toStr(row.numero_cuenta) ?? '';
  const hasMinimal = (titular && (banco || numeroCuenta)) || (banco && numeroCuenta);
  if (!hasMinimal) return null;
  return {
    banco,
    tipo_cuenta: tipoCuenta,
    numero_cuenta: numeroCuenta,
    cbu: toStr(row.cbu) ?? undefined,
    alias: toStr(row.alias) ?? undefined,
    titular: titular || 'Titular',
    cuit: toStr(row.cuit) ?? undefined,
    instrucciones: toStr(row.instrucciones) ?? undefined,
  };
}

function fromDb(row: NegocioRow): IConfigTienda {
  return {
    envio_gratis_minimo: row.envio_gratis_minimo != null ? Number(row.envio_gratis_minimo) : null,
    envio_gratis_activo: row.envio_gratis_activo ?? true,
    cuotas_sin_interes: row.cuotas_sin_interes != null ? Number(row.cuotas_sin_interes) : null,
    cuotas_sin_interes_activo: row.cuotas_sin_interes_activo ?? true,
    cuotas_sin_interes_minimo:
      row.cuotas_sin_interes_minimo != null ? Number(row.cuotas_sin_interes_minimo) : null,
    datos_bancarios: mapToDatosBancarios(row),
    modo_mantenimiento: row.modo_mantenimiento ?? false,
    nombre: toStr(row.nombre),
    direccion: toStr(row.direccion),
    logo: toStr(row.logo),
    telefono: toStr(row.telefono),
  };
}

export interface IPaymentInstallmentsConfig {
  cuotasSinInteres: number | null;
  cuotasSinInteresMinimo: number | null;
}

export class ConfigTiendaService {
  private static readonly CONFIG_SELECT = {
    id_neg: true,
    envio_gratis_minimo: true,
    envio_gratis_activo: true,
    cuotas_sin_interes: true,
    cuotas_sin_interes_activo: true,
    cuotas_sin_interes_minimo: true,
    modo_mantenimiento: true,
    direccion: true,
    logo: true,
    telefono: true,
    ...BANK_SELECT,
  } as const;

  async getConfig(): Promise<IConfigTienda> {
    const negocio = await prisma.negocio.findFirst({
      select: ConfigTiendaService.CONFIG_SELECT,
    });
    if (!negocio) {
      return { ...DEFAULTS, datos_bancarios: null };
    }
    const config = fromDb(negocio as NegocioRow);
    return {
      envio_gratis_minimo: config.envio_gratis_minimo ?? DEFAULTS.envio_gratis_minimo,
      envio_gratis_activo: config.envio_gratis_activo ?? DEFAULTS.envio_gratis_activo,
      cuotas_sin_interes: config.cuotas_sin_interes ?? DEFAULTS.cuotas_sin_interes,
      cuotas_sin_interes_activo: config.cuotas_sin_interes_activo ?? DEFAULTS.cuotas_sin_interes_activo,
      cuotas_sin_interes_minimo:
        config.cuotas_sin_interes_minimo ?? DEFAULTS.cuotas_sin_interes_minimo,
      datos_bancarios: config.datos_bancarios,
      modo_mantenimiento: config.modo_mantenimiento ?? DEFAULTS.modo_mantenimiento,
      nombre: config.nombre ?? DEFAULTS.nombre,
      direccion: config.direccion ?? DEFAULTS.direccion,
      logo: config.logo ?? DEFAULTS.logo,
      telefono: config.telefono ?? DEFAULTS.telefono,
    };
  }

  /**
   * Datos bancarios para transferencia/efectivo.
   * Reutilizado por ventas (email) y por cliente (resultado checkout).
   */
  async getDatosBancarios(): Promise<IDatosBancarios | null> {
    const negocio = await prisma.negocio.findFirst({
      select: BANK_SELECT,
    });
    return mapToDatosBancarios(negocio as NegocioRow | null);
  }

  async updateConfig(dto: IUpdateConfigTiendaDTO, auditContext?: AuditContext): Promise<IConfigTienda> {
    const negocio = await prisma.negocio.findFirst({
      select: ConfigTiendaService.CONFIG_SELECT,
    });

    if (!negocio) {
      const created = await this.ensureNegocioCreate(dto, auditContext);
      return fromDb(created as NegocioRow);
    }

    const current = fromDb(negocio as NegocioRow);
    const envio = dto.envio_gratis_minimo ?? current.envio_gratis_minimo ?? DEFAULTS.envio_gratis_minimo;
    const envioActivo = dto.envio_gratis_activo ?? current.envio_gratis_activo ?? DEFAULTS.envio_gratis_activo;
    const cuotas = dto.cuotas_sin_interes ?? current.cuotas_sin_interes ?? DEFAULTS.cuotas_sin_interes;
    const cuotasActivo =
      dto.cuotas_sin_interes_activo ??
      current.cuotas_sin_interes_activo ??
      DEFAULTS.cuotas_sin_interes_activo;
    const cuotasMin =
      dto.cuotas_sin_interes_minimo ?? current.cuotas_sin_interes_minimo ?? DEFAULTS.cuotas_sin_interes_minimo;
    const envioNum = Number(envio);
    const cuotasNum = Number(cuotas);
    const cuotasMinNum = Number(cuotasMin);
    const currentEnvio = current.envio_gratis_minimo ?? DEFAULTS.envio_gratis_minimo;
    const currentEnvioActivo = current.envio_gratis_activo ?? DEFAULTS.envio_gratis_activo;
    const currentCuotas = current.cuotas_sin_interes ?? DEFAULTS.cuotas_sin_interes;
    const currentCuotasActivo = current.cuotas_sin_interes_activo ?? DEFAULTS.cuotas_sin_interes_activo;
    const currentCuotasMin = current.cuotas_sin_interes_minimo ?? DEFAULTS.cuotas_sin_interes_minimo;
    const reglasUnchanged =
      envioNum === currentEnvio &&
      envioActivo === currentEnvioActivo &&
      cuotasNum === currentCuotas &&
      cuotasActivo === currentCuotasActivo &&
      cuotasMinNum === currentCuotasMin;
    const noBankUpdate = dto.datos_bancarios === undefined;
    const noMaintenanceUpdate = dto.modo_mantenimiento === undefined;
    if (reglasUnchanged && noBankUpdate && noMaintenanceUpdate) return current;

    const updateData: Record<string, unknown> = {
      envio_gratis_minimo: String(envioNum),
      envio_gratis_activo: envioActivo,
      cuotas_sin_interes: String(cuotasNum),
      cuotas_sin_interes_activo: cuotasActivo,
      cuotas_sin_interes_minimo: String(cuotasMinNum),
    };

    if (dto.modo_mantenimiento !== undefined) {
      updateData.modo_mantenimiento = dto.modo_mantenimiento;
    }

    // Datos bancarios (solo si viene en el DTO)
    if (dto.datos_bancarios !== undefined) {
      const db = dto.datos_bancarios;
      if (db === null) {
        updateData.banco = null;
        updateData.tipo_cuenta = null;
        updateData.numero_cuenta = null;
        updateData.cbu = null;
        updateData.alias = null;
        updateData.instrucciones = null;
      } else {
        if (db.banco !== undefined) updateData.banco = db.banco?.trim() || null;
        if (db.tipo_cuenta !== undefined) updateData.tipo_cuenta = db.tipo_cuenta?.trim() || null;
        if (db.numero_cuenta !== undefined) updateData.numero_cuenta = db.numero_cuenta?.trim() || null;
        if (db.cbu !== undefined) updateData.cbu = db.cbu?.trim() || null;
        if (db.alias !== undefined) updateData.alias = db.alias?.trim() || null;
        if (db.instrucciones !== undefined) updateData.instrucciones = db.instrucciones?.trim() || null;
        if (db.titular !== undefined) updateData.nombre = db.titular?.trim() || (negocio as NegocioRow).nombre;
        if (db.cuit !== undefined) updateData.cuit = db.cuit?.trim() || null;
      }
    }

    const updated = await prisma.negocio.update({
      where: { id_neg: negocio.id_neg },
      data: updateData as Parameters<typeof prisma.negocio.update>[0]['data'],
    });

    const result = fromDb(updated as unknown as NegocioRow);
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

  private async ensureNegocioCreate(
    dto: IUpdateConfigTiendaDTO,
    auditContext?: AuditContext
  ): Promise<NegocioRow> {
    const data: Record<string, unknown> = {
      envio_gratis_minimo: String(dto.envio_gratis_minimo ?? 100000),
      envio_gratis_activo: dto.envio_gratis_activo ?? true,
      cuotas_sin_interes: String(dto.cuotas_sin_interes ?? 3),
      cuotas_sin_interes_activo: dto.cuotas_sin_interes_activo ?? true,
      cuotas_sin_interes_minimo: String(dto.cuotas_sin_interes_minimo ?? 80000),
      modo_mantenimiento: dto.modo_mantenimiento ?? false,
    };
    if (dto.datos_bancarios && typeof dto.datos_bancarios === 'object') {
      const db = dto.datos_bancarios;
      data.banco = db.banco?.trim() || null;
      data.tipo_cuenta = db.tipo_cuenta?.trim() || null;
      data.numero_cuenta = db.numero_cuenta?.trim() || null;
      data.cbu = db.cbu?.trim() || null;
      data.alias = db.alias?.trim() || null;
      data.instrucciones = db.instrucciones?.trim() || null;
      data.nombre = db.titular?.trim() || null;
      data.cuit = db.cuit?.trim() || null;
    }
    const created = await prisma.negocio.create({
      data: data as Parameters<typeof prisma.negocio.create>[0]['data'],
    });
    if (auditContext) {
      const result = fromDb(created as unknown as NegocioRow);
      await auditService.record({
        action: 'CONFIG_TIENDA_UPDATE',
        table: 'negocio',
        description: 'Creación de configuración de tienda',
        previousData: null,
        currentData: result as unknown as Record<string, unknown>,
        userId: auditContext.userId,
        userAgent: auditContext.userAgent ?? null,
        endpoint: auditContext.endpoint ?? null,
        status: 'SUCCESS',
        adminAudit: true,
      });
    }
    return created as unknown as NegocioRow;
  }

  async getPaymentInstallmentsConfig(): Promise<IPaymentInstallmentsConfig> {
    const negocio = await prisma.negocio.findFirst({
      select: { cuotas_sin_interes: true, cuotas_sin_interes_minimo: true },
    });
    if (!negocio) {
      return { cuotasSinInteres: null, cuotasSinInteresMinimo: null };
    }
    const cuotas = negocio.cuotas_sin_interes != null ? Number(negocio.cuotas_sin_interes) : null;
    const minimo = negocio.cuotas_sin_interes_minimo != null ? Number(negocio.cuotas_sin_interes_minimo) : null;
    return {
      cuotasSinInteres: cuotas && Number.isFinite(cuotas) && cuotas > 0 ? cuotas : null,
      cuotasSinInteresMinimo: minimo && Number.isFinite(minimo) && minimo > 0 ? minimo : null,
    };
  }
}
