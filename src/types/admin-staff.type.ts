import { z } from 'zod';
import { userRoleSchema } from './auth.type';

/** Dominio permitido para emails de staff (ej. maxshop.com). Vacío = cualquier dominio. */
const emailSchema = z.string().email('Email inválido.').min(3).max(255);

/** Alta de personal con panel: siempre rol ADMIN en Firebase + BD + tabla `admin`. */
export const createStaffUserSchema = z.object({
  email: emailSchema,
  nombre: z.string().trim().min(1, 'El nombre es requerido.').max(255),
  apellido: z.string().trim().max(255).optional().nullable()
});

export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;

export const updateStaffUserSchema = z
  .object({
    nombre: z.string().trim().min(1).max(255).optional(),
    apellido: z.union([z.string().trim().max(255), z.null()]).optional(),
    email: emailSchema.optional(),
    rol: userRoleSchema.optional()
  })
  .strict()
  .refine(
    (data) =>
      data.nombre !== undefined ||
      data.apellido !== undefined ||
      data.email !== undefined ||
      data.rol !== undefined,
    { message: 'Enviá al menos un campo para actualizar.' }
  );

export type UpdateStaffUserInput = z.infer<typeof updateStaffUserSchema>;

/** Valores típicos de req.query (Express) → string acotado o undefined. */
const queryStringTrim = (max: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const t = String(v).trim().slice(0, max);
    return t.length ? t : undefined;
  }, z.string().max(max).optional());

/**
 * Query permitida para GET list (ACL): solo estas claves; el resto rechaza con Zod.
 * Solo usuarios con fila `admin` (staff de panel).
 */
export const listStaffQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: queryStringTrim(200),
    nombre: queryStringTrim(255),
    apellido: queryStringTrim(255),
    email: queryStringTrim(255),
    rol: z.preprocess(
      (v) => (v === undefined || v === null || v === '' ? undefined : String(v).toUpperCase()),
      userRoleSchema.optional()
    ),
    estado: z.preprocess(
      (v) => (v === '' || v === undefined || v === null ? undefined : v),
      z.coerce.number().int().optional()
    ),
    activo: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      const s = String(v).toLowerCase();
      if (s === 'true' || s === '1') return true;
      if (s === 'false' || s === '0') return false;
      return undefined;
    }, z.boolean().optional())
  })
  .strict();

export type ListStaffQueryInput = z.infer<typeof listStaffQuerySchema>;

export type StaffUserPublic = {
  id_usuario: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  username: string | null;
  activo: boolean | null;
  rol: string | null;
  id_rol: number | null;
  estado: number | null;
};
