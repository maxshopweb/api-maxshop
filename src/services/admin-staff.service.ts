import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { firebaseAdminAuth } from '../lib/firebaseAdmin';
import { auditService } from './audit.service';
import type { UserRole } from '../types/auth.type';
import {
  createStaffUserSchema,
  updateStaffUserSchema,
  listStaffQuerySchema,
  type CreateStaffUserInput,
  type UpdateStaffUserInput,
  type ListStaffQueryInput,
  type StaffUserPublic
} from '../types/admin-staff.type';
import { sanitizeString } from '../utils/validation.utils';

/** Ventana y límites de reinicios de contraseña (sin tablas nuevas; memoria del proceso). */
function getPasswordResetLimits() {
  const windowMs = Math.max(
    60_000,
    Number(process.env.STAFF_PWD_RESET_WINDOW_MS) || 24 * 60 * 60 * 1000
  );
  const maxPerTarget = Math.max(1, Number(process.env.STAFF_PWD_RESET_MAX_TARGET) || 3);
  const maxPerActor = Math.max(1, Number(process.env.STAFF_PWD_RESET_MAX_ACTOR) || 20);
  return { windowMs, maxPerTarget, maxPerActor };
}

const targetResetAt = new Map<string, number[]>();
const actorResetAt = new Map<string, number[]>();

function prune(ts: number[], windowMs: number, now: number): number[] {
  return ts.filter((t) => now - t < windowMs);
}

function assertPasswordResetAllowed(targetUid: string, actorUid: string): void {
  const { windowMs, maxPerTarget, maxPerActor } = getPasswordResetLimits();
  const now = Date.now();

  const tArr = prune(targetResetAt.get(targetUid) ?? [], windowMs, now);
  if (tArr.length >= maxPerTarget) {
    const err = new Error(
      'Se alcanzó el límite de reinicios de contraseña para este usuario en el período configurado.'
    );
    (err as Error & { code?: string }).code = 'RATE_LIMIT_TARGET';
    throw err;
  }

  const aArr = prune(actorResetAt.get(actorUid) ?? [], windowMs, now);
  if (aArr.length >= maxPerActor) {
    const err = new Error(
      'Alcanzaste el límite de reinicios de contraseña en el período configurado. Intentá más tarde.'
    );
    (err as Error & { code?: string }).code = 'RATE_LIMIT_ACTOR';
    throw err;
  }
}

function recordPasswordReset(targetUid: string, actorUid: string): void {
  const { windowMs } = getPasswordResetLimits();
  const now = Date.now();
  const tArr = prune(targetResetAt.get(targetUid) ?? [], windowMs, now);
  tArr.push(now);
  targetResetAt.set(targetUid, tArr);
  const aArr = prune(actorResetAt.get(actorUid) ?? [], windowMs, now);
  aArr.push(now);
  actorResetAt.set(actorUid, aArr);
}

function getAllowedEmailDomain(): string | null {
  const raw = (process.env.ADMIN_STAFF_EMAIL_DOMAIN || 'maxshop.com').trim().toLowerCase();
  if (!raw || raw === '*') return null;
  return raw.replace(/^@+/, '');
}

function assertEmailDomainAllowed(email: string): void {
  const domain = getAllowedEmailDomain();
  if (!domain) return;
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at < 0) throw new Error('Email inválido.');
  const host = lower.slice(at + 1);
  if (host !== domain) {
    throw new Error(`El email debe pertenecer al dominio @${domain}.`);
  }
}

function generateTemporaryPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*-';
  const buf = randomBytes(24);
  let out = '';
  for (let i = 0; i < 18; i++) {
    out += chars[buf[i]! % chars.length];
  }
  return out;
}

async function resolveRoleId(role: UserRole): Promise<number> {
  const name = role.toUpperCase() as UserRole;
  let row = await prisma.roles.findFirst({
    where: { nombre: { equals: name, mode: 'insensitive' } }
  });
  if (!row) {
    row = await prisma.roles.create({ data: { nombre: name } });
  }
  return row.id_rol;
}

async function pickUniqueUsername(base: string): Promise<string> {
  const normalized = base.slice(0, 100).toLowerCase();
  let candidate = normalized;
  for (let i = 0; i < 8; i++) {
    const taken = await prisma.usuarios.findFirst({ where: { username: candidate } });
    if (!taken) return candidate;
    candidate = `${normalized}_${randomBytes(2).toString('hex')}`.slice(0, 100);
  }
  throw new Error('No se pudo generar un nombre de usuario único.');
}

function mapToPublic(
  u: Prisma.usuariosGetPayload<{ include: { roles: true } }>
): StaffUserPublic {
  return {
    id_usuario: u.id_usuario,
    nombre: u.nombre ?? null,
    apellido: u.apellido ?? null,
    email: u.email ?? null,
    username: u.username ?? null,
    activo: u.activo ?? null,
    id_rol: u.id_rol ?? null,
    estado: u.estado ?? null,
    rol: u.roles?.nombre ? String(u.roles.nombre).toUpperCase() : null
  };
}

export class AdminStaffService {
  private ensureFirebase() {
    if (!firebaseAdminAuth) {
      throw new Error('Firebase Admin no está configurado correctamente.');
    }
    return firebaseAdminAuth;
  }

  /** Usuario con fila `admin` (personal de panel). */
  private async getStaffByIdOrThrow(idUsuario: string) {
    const u = await prisma.usuarios.findFirst({
      where: {
        id_usuario: idUsuario,
        admin: { isNot: null }
      },
      include: { roles: true, admin: true }
    });
    if (!u) {
      const err = new Error('Usuario de staff no encontrado.');
      (err as Error & { code?: string }).code = 'NOT_FOUND';
      throw err;
    }
    return u;
  }

  async listStaff(
    query: ListStaffQueryInput,
    _ctx: { actorUserId: string }
  ): Promise<{ data: StaffUserPublic[]; total: number; page: number; limit: number }> {
    const parsed = listStaffQuerySchema.parse(query);
    const skip = (parsed.page - 1) * parsed.limit;
    const search = parsed.search?.trim();

    const andParts: Prisma.usuariosWhereInput[] = [{ admin: { isNot: null } }];

    if (search) {
      andParts.push({
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { nombre: { contains: search, mode: 'insensitive' } },
          { apellido: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } }
        ]
      });
    }

    if (parsed.nombre) {
      andParts.push({ nombre: { contains: parsed.nombre, mode: 'insensitive' } });
    }
    if (parsed.apellido) {
      andParts.push({ apellido: { contains: parsed.apellido, mode: 'insensitive' } });
    }
    if (parsed.email) {
      andParts.push({ email: { contains: parsed.email, mode: 'insensitive' } });
    }
    if (parsed.rol) {
      andParts.push({
        roles: { nombre: { equals: parsed.rol, mode: 'insensitive' } }
      });
    }
    if (parsed.estado !== undefined) {
      andParts.push({ estado: parsed.estado });
    }
    if (parsed.activo !== undefined) {
      andParts.push({ activo: parsed.activo });
    }

    const where: Prisma.usuariosWhereInput =
      andParts.length === 1 ? andParts[0]! : { AND: andParts };

    const [rows, total] = await Promise.all([
      prisma.usuarios.findMany({
        where,
        include: { roles: true },
        orderBy: { creado_en: 'desc' },
        skip,
        take: parsed.limit
      }),
      prisma.usuarios.count({ where })
    ]);

    return {
      data: rows.map(mapToPublic),
      total,
      page: parsed.page,
      limit: parsed.limit
    };
  }

  async getStaffById(
    idUsuario: string,
    _ctx: { actorUserId: string }
  ): Promise<StaffUserPublic> {
    const u = await this.getStaffByIdOrThrow(idUsuario);
    return mapToPublic(u);
  }

  async createStaffUser(
    input: CreateStaffUserInput & {
      actorUserId: string;
      ip?: string | null;
      userAgent?: string | null;
      endpoint?: string | null;
    }
  ): Promise<{ user: StaffUserPublic; temporaryPassword: string }> {
    const parsed = createStaffUserSchema.parse(input);
    const email = sanitizeString(parsed.email)!;
    assertEmailDomainAllowed(email);

    const nombre = sanitizeString(parsed.nombre)!;
    const apellido = sanitizeString(parsed.apellido ?? null);
    const auth = this.ensureFirebase();

    const existing = await prisma.usuarios.findFirst({ where: { email } });
    if (existing) {
      if (existing.es_anonimo === true) {
        throw new Error(
          'Ese email pertenece a un invitado. No se puede crear staff sobre esa cuenta.'
        );
      }
      throw new Error('Ya existe un usuario con ese email.');
    }

    const roleId = await resolveRoleId('ADMIN');
    const temporaryPassword =
      parsed.password !== undefined && parsed.password.length > 0
        ? parsed.password
        : generateTemporaryPassword();
    let firebaseUid: string | null = null;
    const start = performance.now();

    try {
      const fb = await auth.createUser({
        email,
        password: temporaryPassword,
        emailVerified: true,
        disabled: false
      });
      const uid = fb.uid;
      firebaseUid = uid;

      const localPart = email.split('@')[0] ?? 'user';
      const username = await pickUniqueUsername(localPart.replace(/[^a-zA-Z0-9._-]/g, '_') || 'user');

      await prisma.$transaction(async (tx) => {
        await tx.usuarios.create({
          data: {
            id_usuario: uid,
            email,
            username,
            nombre,
            apellido,
            telefono: null,
            nacimiento: null,
            id_rol: roleId,
            estado: 3,
            es_anonimo: false,
            email_no_verificado: false,
            activo: true,
            creado_en: new Date(),
            ultimo_login: null,
            login_ip: sanitizeString(input.ip ?? null),
            actualizado_en: new Date()
          }
        });

        await tx.admin.create({ data: { id_usuario: uid } });
      });

      const userRow = await prisma.usuarios.findUniqueOrThrow({
        where: { id_usuario: uid },
        include: { roles: true }
      });

      await auditService.record({
        action: 'ADMIN_STAFF_CREATE',
        description: `Alta staff ${email} rol ADMIN (UID ${uid})`,
        previousData: null,
        currentData: { email, rol: 'ADMIN', targetUid: uid },
        userAgent: input.userAgent ?? null,
        endpoint: input.endpoint ?? null,
        status: 'SUCCESS',
        userId: input.actorUserId,
        processingTimeMs: performance.now() - start
      });

      return {
        user: mapToPublic(userRow),
        temporaryPassword
      };
    } catch (err) {
      if (firebaseUid) {
        try {
          await auth.deleteUser(firebaseUid);
        } catch {
          /* rollback best effort */
        }
      }
      const code =
        typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : '';
      if (code === 'auth/email-already-exists') {
        throw new Error('Ese email ya está registrado en Firebase.');
      }
      if (code === 'auth/invalid-password') {
        throw new Error('La contraseña generada no cumple las políticas de Firebase.');
      }
      throw err;
    }
  }

  async updateStaffUser(
    idUsuario: string,
    input: UpdateStaffUserInput & {
      actorUserId: string;
      userAgent?: string | null;
      endpoint?: string | null;
    }
  ): Promise<StaffUserPublic> {
    const parsed = updateStaffUserSchema.parse(input);
    await this.getStaffByIdOrThrow(idUsuario);

    const auth = this.ensureFirebase();
    const start = performance.now();

    const current = await prisma.usuarios.findUnique({
      where: { id_usuario: idUsuario },
      include: { roles: true }
    });
    if (!current) {
      const err = new Error('Usuario no encontrado.');
      (err as Error & { code?: string }).code = 'NOT_FOUND';
      throw err;
    }

    let email = current.email ?? undefined;
    if (parsed.email !== undefined) {
      email = sanitizeString(parsed.email)!;
      assertEmailDomainAllowed(email);
      const other = await prisma.usuarios.findFirst({
        where: { email, NOT: { id_usuario: idUsuario } }
      });
      if (other) {
        throw new Error('Ya existe otro usuario con ese email.');
      }
    }

    if (parsed.rol !== undefined) {
      const newRoleId = await resolveRoleId(parsed.rol);
      await prisma.$transaction(async (tx) => {
        await tx.usuarios.update({
          where: { id_usuario: idUsuario },
          data: {
            ...(parsed.nombre !== undefined && { nombre: sanitizeString(parsed.nombre) }),
            ...(parsed.apellido !== undefined && { apellido: sanitizeString(parsed.apellido) }),
            ...(parsed.email !== undefined && { email }),
            ...(parsed.rol !== undefined && { id_rol: newRoleId }),
            actualizado_en: new Date()
          }
        });
        if (parsed.rol === 'ADMIN') {
          await tx.admin.upsert({
            where: { id_usuario: idUsuario },
            create: { id_usuario: idUsuario },
            update: {}
          });
        } else {
          await tx.admin.deleteMany({ where: { id_usuario: idUsuario } });
        }
      });
    } else {
      await prisma.usuarios.update({
        where: { id_usuario: idUsuario },
        data: {
          ...(parsed.nombre !== undefined && { nombre: sanitizeString(parsed.nombre) }),
          ...(parsed.apellido !== undefined && { apellido: sanitizeString(parsed.apellido) }),
          ...(parsed.email !== undefined && { email }),
          actualizado_en: new Date()
        }
      });
    }

    if (parsed.email !== undefined && email) {
      await auth.updateUser(idUsuario, {
        email,
        emailVerified: true
      });
    }

    const updated = await prisma.usuarios.findUnique({
      where: { id_usuario: idUsuario },
      include: { roles: true }
    });
    if (!updated) throw new Error('Error al leer el usuario actualizado.');

    await auditService.record({
      action: 'ADMIN_STAFF_UPDATE',
      description: `Actualización staff ${idUsuario}`,
      previousData: {
        nombre: current.nombre,
        apellido: current.apellido,
        email: current.email,
        rol: current.roles?.nombre
      },
      currentData: {
        nombre: updated.nombre,
        apellido: updated.apellido,
        email: updated.email,
        rol: updated.roles?.nombre
      },
      userAgent: input.userAgent ?? null,
      endpoint: input.endpoint ?? null,
      status: 'SUCCESS',
      userId: input.actorUserId,
      processingTimeMs: performance.now() - start
    });

    return mapToPublic(updated);
  }

  async resetStaffPassword(
    idUsuario: string,
    ctx: {
      actorUserId: string;
      userAgent?: string | null;
      endpoint?: string | null;
    }
  ): Promise<{ temporaryPassword: string }> {
    await this.getStaffByIdOrThrow(idUsuario);
    assertPasswordResetAllowed(idUsuario, ctx.actorUserId);

    const auth = this.ensureFirebase();
    const temporaryPassword = generateTemporaryPassword();
    const start = performance.now();

    try {
      await auth.updateUser(idUsuario, { password: temporaryPassword });
    } catch (err) {
      const code =
        typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : '';
      if (code === 'auth/invalid-password') {
        throw new Error('La contraseña generada no cumple las políticas de Firebase.');
      }
      throw err;
    }

    recordPasswordReset(idUsuario, ctx.actorUserId);

    await auditService.record({
      action: 'ADMIN_STAFF_PASSWORD_RESET',
      description: `Reinicio de contraseña staff UID ${idUsuario} (valor no almacenado)`,
      previousData: null,
      currentData: { targetUid: idUsuario },
      userAgent: ctx.userAgent ?? null,
      endpoint: ctx.endpoint ?? null,
      status: 'SUCCESS',
      userId: ctx.actorUserId,
      processingTimeMs: performance.now() - start
    });

    return { temporaryPassword };
  }

  async setStaffActive(
    idUsuario: string,
    activo: boolean,
    ctx: {
      actorUserId: string;
      userAgent?: string | null;
      endpoint?: string | null;
    }
  ): Promise<StaffUserPublic> {
    if (idUsuario === ctx.actorUserId && !activo) {
      throw new Error('No podés dar de baja tu propia cuenta.');
    }

    await this.getStaffByIdOrThrow(idUsuario);
    const auth = this.ensureFirebase();
    const start = performance.now();

    const prev = await prisma.usuarios.findUnique({
      where: { id_usuario: idUsuario },
      include: { roles: true }
    });

    await auth.updateUser(idUsuario, { disabled: !activo });

    const updated = await prisma.usuarios.update({
      where: { id_usuario: idUsuario },
      data: { activo, actualizado_en: new Date() },
      include: { roles: true }
    });

    await auditService.record({
      action: activo ? 'ADMIN_STAFF_REACTIVATE' : 'ADMIN_STAFF_DEACTIVATE',
      description: `${activo ? 'Reactivación' : 'Baja'} staff ${idUsuario}`,
      previousData: prev ? mapToPublic(prev) : null,
      currentData: mapToPublic(updated),
      userAgent: ctx.userAgent ?? null,
      endpoint: ctx.endpoint ?? null,
      status: 'SUCCESS',
      userId: ctx.actorUserId,
      processingTimeMs: performance.now() - start
    });

    return mapToPublic(updated);
  }
}

export const adminStaffService = new AdminStaffService();
