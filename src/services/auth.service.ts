import { performance } from 'node:perf_hooks';
import { DecodedIdToken } from 'firebase-admin/auth';
import { prisma } from '../index';
import { firebaseAdminAuth } from '../lib/firebaseAdmin';
import {
  loginWithTokenSchema,
  registerUserSchema,
  completeProfileSchema,
  type AuthenticatedUser,
  type AuthOperationResult,
  type LoginWithTokenInput,
  type RegisterUserInput,
  type CompleteProfileInput,
  type UserRole
} from '../types/auth.type';
import { auditService } from './audit.service';
import { parseDate, parseTelefono, sanitizeString } from '../utils/validation.utils';

export class AuthService {
  private ensureFirebaseAdmin() {
    if (!firebaseAdminAuth) {
      throw new Error('Firebase Admin no está configurado correctamente.');
    }

    return firebaseAdminAuth;
  }

  private async verifyFirebaseToken(idToken: string): Promise<DecodedIdToken> {
    const authAdmin = this.ensureFirebaseAdmin();

    try {
      return await authAdmin.verifyIdToken(idToken, true);
    } catch (error) {
      throw new Error('Token de Firebase inválido o expirado.');
    }
  }

  private async resolveRoleId(role?: UserRole | null): Promise<{ id: number | null; name: UserRole | null }> {
    const desiredRole = role ?? 'USER';

    if (!desiredRole) {
      return { id: null, name: null };
    }

    const roleName = desiredRole.toUpperCase() as UserRole;

    let roleRecord = await prisma.roles.findFirst({
      where: {
        nombre: {
          equals: roleName,
          mode: 'insensitive'
        }
      }
    });

    if (!roleRecord) {
      roleRecord = await prisma.roles.create({
        data: {
          nombre: roleName
        }
      });
    }

    return {
      id: roleRecord.id_rol,
      name: roleName
    };
  }

  private mapUser(user: any): AuthenticatedUser {
    const roleName = user?.roles?.nombre ? (user.roles.nombre.toUpperCase() as UserRole) : null;

    return {
      id: user.id_usuario,
      nombre: user.nombre ?? null,
      apellido: user.apellido ?? null,
      email: user.email ?? null,
      telefono: user.telefono ?? null,
      username: user.username ?? null,
      nacimiento: user.nacimiento ?? null,
      rol: roleName && (roleName === 'ADMIN' || roleName === 'USER') ? roleName : null,
      ultimoLogin: user.ultimo_login ?? null,
      loginIp: user.login_ip ?? null,
      estado: user.estado ?? null
    };
  }

  private buildUserDataFromToken(decoded: DecodedIdToken) {
    return {
      idUsuario: decoded.uid,
      nombre: sanitizeString(decoded.name ?? null),
      email: sanitizeString(decoded.email ?? null),
      telefono: parseTelefono(decoded.phone_number ?? null)
    };
  }

  async loginWithFirebaseToken(input: LoginWithTokenInput): Promise<AuthOperationResult> {
    const parsedInput = loginWithTokenSchema.parse(input);
    const start = performance.now();

    const decodedToken = await this.verifyFirebaseToken(parsedInput.idToken);
    const userId = decodedToken.uid;

    // Verificar que el email esté verificado si el usuario tiene estado 2 (perfil incompleto)
    // El email debe estar verificado para permitir completar el perfil
    const isEmailVerified = decodedToken.email_verified ?? false;

    const fallbackData = this.buildUserDataFromToken(decodedToken);

    let userRecord = await prisma.usuarios.findFirst({
      where: {
        OR: [
          { id_usuario: userId },
          ...(fallbackData.email ? [{ email: fallbackData.email }] : [])
        ]
      },
      include: {
        roles: true
      }
    });

    // Si el usuario no existe, crearlo automáticamente (login con Google de usuario nuevo)
    let wasCreated = false;
    let previousUser = null;
    
    if (!userRecord) {
      const email = fallbackData.email;
      if (!email) {
        throw new Error('No se pudo determinar el email del usuario.');
      }

      const username = email.split('@')[0];
      const { id: roleId } = await this.resolveRoleId(null);

      // Crear usuario: si email está verificado -> estado 2, si no -> null
      userRecord = await prisma.usuarios.create({
        data: {
          id_usuario: userId,
          email,
          username,
          nombre: null,
          apellido: null,
          telefono: null,
          nacimiento: null,
          id_rol: roleId ?? undefined,
          estado: isEmailVerified ? 2 : null, // Estado 2 solo si email verificado
          creado_en: new Date(),
          ultimo_login: new Date(),
          login_ip: sanitizeString(parsedInput.ip ?? null),
          actualizado_en: new Date()
        },
        include: {
          roles: true
        }
      });
      
      wasCreated = true;
    } else {
      previousUser = this.mapUser(userRecord);
      
      // Si el email se acaba de verificar y el estado era null, actualizar a estado 2
      if (isEmailVerified && userRecord.estado === null) {
        userRecord = await prisma.usuarios.update({
          where: { id_usuario: userRecord.id_usuario },
          data: { estado: 2, actualizado_en: new Date() },
          include: { roles: true }
        });
      }
    }

    // Si el email no está verificado, rechazar login
    if (!isEmailVerified) {
      throw new Error('Debes verificar tu email antes de continuar. Revisa tu bandeja de entrada.');
    }

    // Solo actualizar si el usuario ya existía (no fue creado en esta operación)
    if (!wasCreated) {
      userRecord = await prisma.usuarios.update({
        where: { id_usuario: userRecord.id_usuario },
        data: {
          email: fallbackData.email ?? userRecord.email,
          nombre: fallbackData.nombre ?? userRecord.nombre,
          // Asegurar que telefono sea string (parseTelefono ahora retorna string | null)
          telefono: fallbackData.telefono ?? userRecord.telefono ?? null,
          ultimo_login: new Date(),
          login_ip: sanitizeString(parsedInput.ip ?? null) ?? userRecord.login_ip,
          actualizado_en: new Date()
        },
        include: {
          roles: true
        }
      });
    }

    const mappedUser = this.mapUser(userRecord);
    const processingTime = performance.now() - start;

    const action = wasCreated ? 'AUTH_REGISTER_OAUTH' : 'AUTH_LOGIN';
    const description = wasCreated 
      ? `Registro automático (OAuth) del usuario ${mappedUser.email ?? mappedUser.id}`
      : `Inicio de sesión del usuario ${mappedUser.email ?? mappedUser.id}`;

    await auditService.record({
      action,
      description,
      previousData: previousUser,
      currentData: mappedUser,
      userAgent: parsedInput.userAgent ?? null,
      endpoint: parsedInput.endpoint ?? null,
      status: 'SUCCESS',
      userId: userRecord.id_usuario,
      processingTimeMs: processingTime
    });

    return {
      user: mappedUser,
      created: wasCreated,
      roleId: userRecord.id_rol ?? null,
      estado: userRecord.estado ?? null
    };
  }

  async registerWithFirebase(
    input: RegisterUserInput & { ip?: string | null; userAgent?: string | null; endpoint?: string | null }
  ): Promise<AuthOperationResult> {
    const parsedInput = registerUserSchema.parse({
      idToken: input.idToken,
      data: input.data
    });

    const start = performance.now();

    const decodedToken = await this.verifyFirebaseToken(parsedInput.idToken);
    const firebaseUid = decodedToken.uid;

    if (parsedInput.data.uid && parsedInput.data.uid !== firebaseUid) {
      throw new Error('El UID proporcionado no coincide con el token de Firebase.');
    }

    const fallbackData = this.buildUserDataFromToken(decodedToken);
    const email = sanitizeString(parsedInput.data.email ?? fallbackData.email ?? null);

    if (!email) {
      throw new Error('No se pudo determinar el email del usuario.');
    }

    const telefono = parseTelefono(parsedInput.data.telefono ?? fallbackData.telefono ?? null);
    const nacimiento = parseDate(parsedInput.data.nacimiento ?? null);
    const nombre = sanitizeString(parsedInput.data.nombre ?? fallbackData.nombre ?? null);
    const apellido = sanitizeString(parsedInput.data.apellido ?? null);
    const username = sanitizeString(parsedInput.data.username ?? email.split('@')[0]);

    const { id: roleId, name: roleName } = await this.resolveRoleId(parsedInput.data.rol ?? null);

    let userRecord = await prisma.usuarios.findFirst({
      where: {
        OR: [
          { id_usuario: firebaseUid },
          { email },
          ...(username ? [{ username }] : [])
        ]
      },
      include: {
        roles: true
      }
    });

    // Si el usuario ya existe por email (pero no por UID), significa que el email ya está registrado
    // Esto es importante para evitar duplicados cuando se registra con Google
    if (userRecord && userRecord.id_usuario !== firebaseUid && userRecord.email === email) {
      throw new Error('Este email ya está registrado. Por favor, inicia sesión en su lugar.');
    }

    const previousUser = userRecord ? this.mapUser(userRecord) : null;
    const loginIp = sanitizeString(input.ip ?? null) ?? previousUser?.loginIp ?? null;
    const dataToPersist = {
      email,
      nombre,
      apellido,
      username,
      telefono,
      nacimiento,
      id_rol: roleId ?? undefined,
      ultimo_login: new Date(),
      login_ip: loginIp,
      actualizado_en: new Date()
    };

    const idUsuario = userRecord?.id_usuario ?? firebaseUid;

    let created = false;

    if (userRecord) {
      userRecord = await prisma.usuarios.update({
        where: { id_usuario: userRecord.id_usuario },
        data: dataToPersist,
        include: {
          roles: true
        }
      });
    } else {
      // Estado inicial: null (sin verificar email)
      // Cuando se verifique el email, se actualizará a estado 2 en loginWithFirebaseToken
      userRecord = await prisma.usuarios.create({
        data: {
          id_usuario: idUsuario,
          ...dataToPersist,
          estado: null, // Sin verificar email aún
          creado_en: new Date()
        },
        include: {
          roles: true
        }
      });
      created = true;
    }

    const mappedUser = this.mapUser({
      ...userRecord,
      roles: userRecord.roles ?? (roleName ? { nombre: roleName } : null)
    });

    const processingTime = performance.now() - start;

    await auditService.record({
      action: created ? 'AUTH_REGISTER' : 'AUTH_REGISTER_UPDATE',
      description: created
        ? `Registro de usuario ${mappedUser.email}`
        : `Actualización de registro para ${mappedUser.email}`,
      previousData: previousUser,
      currentData: mappedUser,
      userAgent: input.userAgent ?? null,
      endpoint: input.endpoint ?? null,
      status: 'SUCCESS',
      userId: userRecord.id_usuario,
      processingTimeMs: processingTime
    });

    return {
      user: mappedUser,
      created,
      roleId: userRecord.id_rol ?? null,
      estado: userRecord.estado ?? null
    };
  }

  async completeProfile(
    input: CompleteProfileInput & { ip?: string | null; userAgent?: string | null; endpoint?: string | null }
  ): Promise<AuthOperationResult> {
    const parsedInput = completeProfileSchema.parse({
      idToken: input.idToken,
      data: input.data
    });

    const start = performance.now();

    const decodedToken = await this.verifyFirebaseToken(parsedInput.idToken);
    const firebaseUid = decodedToken.uid;

    // Buscar usuario existente
    let userRecord = await prisma.usuarios.findFirst({
      where: {
        id_usuario: firebaseUid
      },
      include: {
        roles: true
      }
    });

    if (!userRecord) {
      throw new Error('Usuario no encontrado. Debe completar el registro primero.');
    }

    // Verificar que el usuario tenga estado 2 (email verificado, perfil incompleto)
    if (userRecord.estado !== 2) {
      throw new Error('El perfil ya está completo o el usuario no está en estado de perfil incompleto.');
    }

    const previousUser = this.mapUser(userRecord);

    // Preparar datos para actualizar
    const telefono = parseTelefono(parsedInput.data.telefono ?? null);
    const nacimiento = parseDate(parsedInput.data.nacimiento ?? null);
    const nombre = sanitizeString(parsedInput.data.nombre);
    const apellido = sanitizeString(parsedInput.data.apellido ?? null);
    const loginIp = sanitizeString(input.ip ?? null) ?? previousUser.loginIp ?? null;

    // Actualizar usuario con datos del perfil y cambiar estado a 3 (alta/perfil completo)
    userRecord = await prisma.usuarios.update({
      where: { id_usuario: userRecord.id_usuario },
      data: {
        nombre,
        apellido,
        telefono,
        nacimiento,
        estado: 3, // Cambiar a alta (perfil completo)
        ultimo_login: new Date(),
        login_ip: loginIp,
        actualizado_en: new Date()
      },
      include: {
        roles: true
      }
    });

    const mappedUser = this.mapUser(userRecord);
    const processingTime = performance.now() - start;

    await auditService.record({
      action: 'AUTH_COMPLETE_PROFILE',
      description: `Perfil completado para usuario ${mappedUser.email}`,
      previousData: previousUser,
      currentData: mappedUser,
      userAgent: input.userAgent ?? null,
      endpoint: input.endpoint ?? null,
      status: 'SUCCESS',
      userId: userRecord.id_usuario,
      processingTimeMs: processingTime
    });

    return {
      user: mappedUser,
      created: false,
      roleId: userRecord.id_rol ?? null,
      estado: userRecord.estado ?? null
    };
  }

  async checkEmailExists(email: string): Promise<{ exists: boolean; isGuest: boolean }> {
    if (!email || !email.trim()) {
      return { exists: false, isGuest: false };
    }

    try {
      const userRecord = await prisma.usuarios.findFirst({
        where: {
          email: email.trim()
        },
        select: {
          email: true,
          es_anonimo: true
        }
      });

      if (!userRecord) {
        return { exists: false, isGuest: false };
      }

      return {
        exists: true,
        isGuest: userRecord.es_anonimo === true
      };
    } catch (error) {
      // Si hay un error de schema (campo no existe), intentar sin email_no_verificado
      // Esto es un fallback para bases de datos que aún no tienen la migración
      try {
        const userRecord = await prisma.usuarios.findFirst({
          where: {
            email: email.trim()
          },
          select: {
            email: true,
            es_anonimo: true
          }
        });

        return {
          exists: !!userRecord,
          isGuest: userRecord?.es_anonimo === true || false
        };
      } catch (fallbackError) {
        // Si aún falla, retornar que no existe para no bloquear el flujo
        console.error('Error al verificar email:', error);
        return { exists: false, isGuest: false };
      }
    }
  }

  async registerGuest(input: {
    idToken: string;
    email: string;
    nombre: string;
    apellido?: string;
    telefono?: string;
    ip?: string;
    userAgent?: string;
    endpoint?: string;
  }): Promise<AuthOperationResult> {
    const start = performance.now();

    const decodedToken = await this.verifyFirebaseToken(input.idToken);
    const firebaseUid = decodedToken.uid;

    // Verificar que el token sea de un usuario anónimo
    // Los usuarios anónimos no tienen email en el token
    // Además, verificamos que no exista un usuario permanente con este UID
    if (decodedToken.email) {
      // Si el token tiene email, no es anónimo (a menos que sea temporal)
      // Intentar verificar si es usuario permanente, pero si el campo no existe, continuar
      try {
        const existingUser = await prisma.usuarios.findFirst({
          where: {
            id_usuario: firebaseUid
          },
          select: {
            id_usuario: true,
            es_anonimo: true
          }
        });

        if (existingUser && existingUser.es_anonimo === false) {
          throw new Error('Este usuario ya está registrado como usuario permanente.');
        }
      } catch (error) {
        // Si hay error por campo no existente, continuar (la migración se ejecutará después)
        if (error instanceof Error && error.message.includes('column') && error.message.includes('does not exist')) {
          // Campo no existe aún, continuar
        } else {
          throw error;
        }
      }
    }

    const email = sanitizeString(input.email.trim());
    if (!email) {
      throw new Error('El email es requerido.');
    }

    // Verificar que el email NO exista en la BD
    const emailCheck = await this.checkEmailExists(email);
    if (emailCheck.exists && !emailCheck.isGuest) {
      throw new Error('Este email ya está registrado. Por favor, inicia sesión en su lugar.');
    }

    // Si existe como invitado, actualizar en lugar de crear
    let userRecord = await prisma.usuarios.findFirst({
      where: {
        OR: [
          { id_usuario: firebaseUid },
          { email: email }
        ]
      },
      include: {
        roles: true
      }
    });

    const previousUser = userRecord ? this.mapUser(userRecord) : null;
    const { id: roleId } = await this.resolveRoleId('USER'); // Usar USER como rol base, se puede cambiar después

    // Buscar o crear rol INVITADO
    let guestRole = await prisma.roles.findFirst({
      where: {
        nombre: {
          equals: 'INVITADO',
          mode: 'insensitive'
        }
      }
    });

    if (!guestRole) {
      guestRole = await prisma.roles.create({
        data: {
          nombre: 'INVITADO',
          descripcion: 'Usuario invitado (checkout sin registro)'
        }
      });
    }

    const nombre = sanitizeString(input.nombre);
    const apellido = sanitizeString(input.apellido ?? null);
    const telefono = parseTelefono(input.telefono ?? null);
    const loginIp = sanitizeString(input.ip ?? null);

    let created = false;

    // Preparar datos para crear/actualizar
    const updateData: any = {
      email: email, // Email siempre tiene valor
      nombre,
      apellido,
      telefono,
      es_anonimo: true,
      estado: 1, // Estado 1 = invitado
      id_rol: guestRole.id_rol,
      ultimo_login: new Date(),
      login_ip: loginIp,
      actualizado_en: new Date()
    };

    // Intentar agregar email_no_verificado si existe en la BD
    // Si no existe, se ignorará y funcionará con el esquema antiguo
    try {
      updateData.email_no_verificado = true;
    } catch (e) {
      // Campo no existe aún, continuar sin él
    }

    if (userRecord) {
      // Actualizar usuario invitado existente
      try {
        userRecord = await prisma.usuarios.update({
          where: { id_usuario: userRecord.id_usuario },
          data: updateData,
          include: {
            roles: true
          }
        });
      } catch (error) {
        // Si falla por campo no existente, intentar sin email_no_verificado
        if (error instanceof Error && (error.message.includes('Unknown argument') || error.message.includes('does not exist'))) {
          const { email_no_verificado, ...dataWithoutField } = updateData;
          userRecord = await prisma.usuarios.update({
            where: { id_usuario: userRecord.id_usuario },
            data: dataWithoutField,
            include: {
              roles: true
            }
          });
        } else {
          throw error;
        }
      }
    } else {
      // Crear nuevo usuario invitado
      const createData: any = {
        id_usuario: firebaseUid,
        email: email, // Email siempre tiene valor (incluso para invitados)
        nombre,
        apellido,
        telefono,
        username: email.split('@')[0],
        es_anonimo: true,
        estado: 1, // Estado 1 = invitado
        id_rol: guestRole.id_rol,
        activo: true,
        creado_en: new Date(),
        ultimo_login: new Date(),
        login_ip: loginIp,
        actualizado_en: new Date()
      };

      // Intentar agregar email_no_verificado si existe
      try {
        createData.email_no_verificado = true;
      } catch (e) {
        // Campo no existe aún
      }

      try {
        userRecord = await prisma.usuarios.create({
          data: createData,
          include: {
            roles: true
          }
        });
        created = true;
      } catch (error) {
        // Si falla por campo no existente, intentar sin email_no_verificado
        if (error instanceof Error && (error.message.includes('Unknown argument') || error.message.includes('does not exist'))) {
          const { email_no_verificado, ...dataWithoutField } = createData;
          userRecord = await prisma.usuarios.create({
            data: dataWithoutField,
            include: {
              roles: true
            }
          });
          created = true;
        } else {
          throw error;
        }
      }
    }

    const mappedUser = this.mapUser(userRecord);
    const processingTime = performance.now() - start;

    await auditService.record({
      action: 'AUTH_REGISTER_GUEST',
      description: `Registro de usuario invitado ${mappedUser.email || email}`,
      previousData: previousUser,
      currentData: mappedUser,
      userAgent: input.userAgent ?? null,
      endpoint: input.endpoint ?? null,
      status: 'SUCCESS',
      userId: userRecord.id_usuario,
      processingTimeMs: processingTime
    });

    return {
      user: mappedUser,
      created,
      roleId: userRecord.id_rol ?? null,
      estado: userRecord.estado ?? null
    };
  }

  async convertGuestToUser(input: {
    idToken: string;
    password: string;
    email: string;
    ip?: string;
    userAgent?: string;
    endpoint?: string;
  }): Promise<AuthOperationResult> {
    const start = performance.now();

    const decodedToken = await this.verifyFirebaseToken(input.idToken);
    const firebaseUid = decodedToken.uid;

    // Buscar usuario invitado
    const userRecord = await prisma.usuarios.findFirst({
      where: {
        id_usuario: firebaseUid,
        es_anonimo: true
      },
      include: {
        roles: true
      }
    });

    if (!userRecord) {
      throw new Error('Usuario invitado no encontrado o ya fue convertido.');
    }

    if (userRecord.estado !== 1) {
      throw new Error('El usuario no está en estado de invitado.');
    }

    const email = sanitizeString(input.email.trim());
    if (!email) {
      throw new Error('El email es requerido.');
    }

    // Verificar que el email no esté en uso por otro usuario
    const emailCheck = await this.checkEmailExists(email);
    if (emailCheck.exists && !emailCheck.isGuest) {
      const existingUser = await prisma.usuarios.findFirst({
        where: {
          email: email,
          id_usuario: { not: firebaseUid }
        }
      });

      if (existingUser) {
        throw new Error('Este email ya está registrado por otro usuario.');
      }
    }

    const previousUser = this.mapUser(userRecord);

    // Resolver rol USER
    const { id: userRoleId } = await this.resolveRoleId('USER');

    // Actualizar usuario: convertir de invitado a permanente
    const updateData: any = {
      email: email, // Email verificado (se verifica en frontend con linkWithCredential)
      es_anonimo: false,
      estado: 3, // Estado 3 = usuario completo
      id_rol: userRoleId,
      ultimo_login: new Date(),
      login_ip: sanitizeString(input.ip ?? null),
      actualizado_en: new Date()
    };

    // Intentar agregar email_no_verificado si existe
    try {
      updateData.email_no_verificado = false; // Email ahora está verificado
    } catch (e) {
      // Campo no existe aún
    }

    let updatedUser;
    try {
      updatedUser = await prisma.usuarios.update({
        where: { id_usuario: firebaseUid },
        data: updateData,
        include: {
          roles: true
        }
      });
    } catch (error) {
      // Si falla por campo no existente, intentar sin email_no_verificado
      if (error instanceof Error && (error.message.includes('Unknown argument') || error.message.includes('does not exist'))) {
        const { email_no_verificado, ...dataWithoutField } = updateData;
        updatedUser = await prisma.usuarios.update({
          where: { id_usuario: firebaseUid },
          data: dataWithoutField,
          include: {
            roles: true
          }
        });
      } else {
        throw error;
      }
    }

    const mappedUser = this.mapUser(updatedUser);
    const processingTime = performance.now() - start;

    await auditService.record({
      action: 'AUTH_CONVERT_GUEST',
      description: `Conversión de invitado a usuario permanente ${mappedUser.email}`,
      previousData: previousUser,
      currentData: mappedUser,
      userAgent: input.userAgent ?? null,
      endpoint: input.endpoint ?? null,
      status: 'SUCCESS',
      userId: updatedUser.id_usuario,
      processingTimeMs: processingTime
    });

    return {
      user: mappedUser,
      created: false,
      roleId: updatedUser.id_rol ?? null,
      estado: updatedUser.estado ?? null
    };
  }
}

export const authService = new AuthService();