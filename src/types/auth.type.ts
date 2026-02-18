import { z } from 'zod';

export const userRoleSchema = z.enum(['ADMIN', 'USER']);
export type UserRole = z.infer<typeof userRoleSchema>;

// Schema para registro básico (Step 1) - solo email y password, sin Firebase
export const basicRegisterSchema = z.object({
  email: z.string().email('Email inválido.').min(1, 'El email es requerido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.')
});
export type BasicRegisterInput = z.infer<typeof basicRegisterSchema>;

export const registerUserSchema = z.object({
  idToken: z.string().min(1, 'El token de Firebase es requerido.'),
  data: z
    .object({
      uid: z.string().optional(),
      username: z.string().optional(), // Opcional: se genera automáticamente si no viene
      nombre: z.string().optional(), // Opcional: solo requerido en Step 2
      apellido: z.union([z.string(), z.null()]).optional(),
      email: z.string().email('Email inválido.'),
      telefono: z.union([z.string(), z.number()]).optional(),
      nacimiento: z.union([z.string(), z.date()]).optional(),
      rol: userRoleSchema.optional()
    })
    .strict()
});
export type RegisterUserInput = z.infer<typeof registerUserSchema>;

export const loginWithTokenSchema = z
  .object({
    idToken: z.string().min(1, 'El token de Firebase es requerido.'),
    ip: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    endpoint: z.string().nullable().optional()
  })
  .strict();
export type LoginWithTokenInput = z.infer<typeof loginWithTokenSchema>;

export type AuditLogStatus = 'SUCCESS' | 'ERROR';

export type AuditLogPayload = {
  action: string;
  table?: string;
  description?: string;
  previousData?: Record<string, unknown> | null;
  currentData?: Record<string, unknown> | null;
  userAgent?: string | null;
  endpoint?: string | null;
  status?: AuditLogStatus;
  userId?: string | null;
  processingTimeMs?: number;
  /** Si true, solo se registra cuando ENABLE_ADMIN_AUDIT=true (auditoría solo admin, configurable prod/dev). */
  adminAudit?: boolean;
};

export type AuthenticatedUser = {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
  username: string | null;
  nacimiento: Date | null;
  rol: UserRole | null;
  ultimoLogin: Date | null;
  loginIp: string | null;
  estado: number | null;
};

export type AuthOperationResult = {
  user: AuthenticatedUser;
  created: boolean;
  roleId: number | null;
  estado: number | null;
};

// Schema para completar perfil (Step 2)
export const completeProfileSchema = z.object({
  // El token viene del header Authorization, no del body
  data: z
    .object({
      nombre: z.string().min(1, 'El nombre es requerido.'),
      apellido: z.string().optional().nullable(),
      telefono: z.union([z.string(), z.number()]).optional(),
      nacimiento: z.union([z.string(), z.date()]).optional(),
    })
    .strict()
});
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;

