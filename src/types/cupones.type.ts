import { z } from 'zod';

export const CUPON_TIPO_PORCENTAJE = 'porcentaje';
export const CUPON_TIPO_MONTO_FIJO = 'monto_fijo';
export const CUPON_TIPOS = [CUPON_TIPO_PORCENTAJE, CUPON_TIPO_MONTO_FIJO] as const;
export type CuponTipo = (typeof CUPON_TIPOS)[number];

export const CUPON_CANJE_APLICADO = 'aplicado';
export const CUPON_CANJE_LIBERADO = 'liberado';
export type CuponCanjeEstado = typeof CUPON_CANJE_APLICADO | typeof CUPON_CANJE_LIBERADO;

export interface ICupon {
  id_cupon: number;
  codigo: string;
  tipo: CuponTipo;
  valor: number;
  monto_minimo: number;
  usos_maximos: number;
  usos_actuales: number;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
  activo: boolean;
  creado_en: Date;
  actualizado_en: Date;
}

export interface ICuponCanje {
  id_canje: number;
  id_cupon: number;
  id_venta: number;
  monto_aplicado: number;
  estado: CuponCanjeEstado;
  creado_en: Date;
  liberado_en: Date | null;
  cod_interno?: string | null;
}

export interface ICuponValidacionResult {
  valid: boolean;
  message: string;
  id_cupon?: number;
  codigo?: string;
  tipo?: CuponTipo;
  valor?: number;
  monto_descuento?: number;
}

export interface ICuponAplicado {
  id_cupon: number;
  codigo: string;
  tipo: CuponTipo;
  valor: number;
  monto_descuento: number;
}

const optionalDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === '') return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  });

export const createCuponSchema = z
  .object({
    codigo: z.string().min(1, 'El código es obligatorio'),
    tipo: z.enum(CUPON_TIPOS),
    valor: z.coerce.number().finite().gte(0),
    monto_minimo: z.coerce.number().finite().gte(0).default(0),
    usos_maximos: z.coerce.number().int().gte(1).default(1),
    fecha_inicio: optionalDate,
    fecha_fin: optionalDate,
    activo: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === CUPON_TIPO_PORCENTAJE && data.valor > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El porcentaje no puede ser mayor a 100',
        path: ['valor'],
      });
    }
    if (data.fecha_inicio && data.fecha_fin && data.fecha_inicio > data.fecha_fin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fecha_inicio no puede ser posterior a fecha_fin',
        path: ['fecha_fin'],
      });
    }
  });

export const updateCuponSchema = z
  .object({
    codigo: z.string().min(1).optional(),
    tipo: z.enum(CUPON_TIPOS).optional(),
    valor: z.coerce.number().finite().gte(0).optional(),
    monto_minimo: z.coerce.number().finite().gte(0).optional(),
    usos_maximos: z.coerce.number().int().gte(1).optional(),
    fecha_inicio: optionalDate,
    fecha_fin: optionalDate,
    activo: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === CUPON_TIPO_PORCENTAJE && data.valor != null && data.valor > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El porcentaje no puede ser mayor a 100',
        path: ['valor'],
      });
    }
    if (data.fecha_inicio && data.fecha_fin && data.fecha_inicio > data.fecha_fin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fecha_inicio no puede ser posterior a fecha_fin',
        path: ['fecha_fin'],
      });
    }
  });

export const validateCuponBodySchema = z.object({
  codigo: z.string().min(1, 'Código requerido'),
  subtotal: z.coerce.number().finite().gte(0),
});

export type CreateCuponDTO = z.infer<typeof createCuponSchema>;
export type UpdateCuponDTO = z.infer<typeof updateCuponSchema>;
