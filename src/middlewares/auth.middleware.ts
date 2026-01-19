import '../types/express';
import { performance } from 'node:perf_hooks';
import { NextFunction, Request, Response } from 'express';
import { firebaseAdminAuth } from '../lib/firebaseAdmin';
import { prisma } from '../index';
import { auditService } from '../services/audit.service';
import { type AuthenticatedUser, type UserRole } from '../types/auth.type';
import { sanitizeString } from '../utils/validation.utils';

const buildAuthenticatedUser = (user: any): AuthenticatedUser => {
  const roleName = user?.roles?.nombre ? String(user.roles.nombre).toUpperCase() : null;

  return {
    id: user.id_usuario,
    nombre: user.nombre ?? null,
    apellido: user.apellido ?? null,
    email: user.email ?? null,
    telefono: user.telefono ?? null,
    username: user.username ?? null,
    nacimiento: user.nacimiento ?? null,
    rol: roleName && (roleName === 'ADMIN' || roleName === 'USER') ? (roleName as UserRole) : null,
    ultimoLogin: user.ultimo_login ?? null,
    loginIp: user.login_ip ?? null,
    estado: user.estado ?? null
  };
};

const ensureFirebaseAdmin = () => {
  if (!firebaseAdminAuth) {
    throw new Error(
      'Firebase Admin no está configurado correctamente. Verifica las variables de entorno: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY en el archivo .env del backend.'
    );
  }

  return firebaseAdminAuth;
};

export const verifyFirebaseToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authorization = req.headers.authorization ?? req.cookies?.token ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.substring(7).trim() : authorization;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token de autorización no proporcionado.'
      });
    }

    const adminAuth = ensureFirebaseAdmin();
    const decodedToken = await adminAuth.verifyIdToken(token, true);
    req.decodedToken = decodedToken;
    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token inválido o expirado.';
    return res.status(401).json({
      success: false,
      error: message
    });
  }
};

export const requireAuthenticatedUser = (req: Request, res: Response, next: NextFunction) => {
  if (!req.decodedToken) {
    return res.status(401).json({
      success: false,
      error: 'Se requiere un usuario autenticado.'
    });
  }

  return next();
};

export const loadUserFromDatabase = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.decodedToken) {
    return res.status(401).json({
      success: false,
      error: 'Token no verificado.'
    });
  }

  try {
    const uid = req.decodedToken.uid;
    
    // Intentar buscar el usuario por UID
    let userRecord = await prisma.usuarios.findUnique({
      where: { id_usuario: uid },
      include: {
        roles: true
      }
    });

    if (!userRecord) {
      // Si es un usuario anónimo (invitado), intentar esperar un poco y buscar de nuevo
      // Esto maneja casos de timing donde el usuario se acaba de registrar
      const isAnonymous = req.decodedToken.firebase?.sign_in_provider === 'anonymous' || !req.decodedToken.email;
      
      if (isAnonymous) {
        // Esperar un poco y buscar de nuevo (para manejar timing issues)
        console.log('⏳ [loadUserFromDatabase] Usuario anónimo no encontrado, esperando 500ms...', { uid });
        await new Promise(resolve => setTimeout(resolve, 500));
        userRecord = await prisma.usuarios.findUnique({
          where: { id_usuario: uid },
          include: {
            roles: true
          }
        });
        
        // Si aún no se encuentra, buscar usuarios anónimos recientes (últimos 5 minutos)
        // Esto maneja casos donde el usuario se acaba de registrar pero hay un problema de timing
        if (!userRecord) {
          console.log('🔍 [loadUserFromDatabase] Buscando usuarios anónimos recientes...', { uid });
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          const recentAnonymousUsers = await prisma.usuarios.findMany({
            where: {
              es_anonimo: true,
              ultimo_login: {
                gte: fiveMinutesAgo
              }
            },
            include: {
              roles: true
            },
            orderBy: {
              ultimo_login: 'desc'
            },
            take: 5 // Solo los 5 más recientes
          });
          
          // Si hay usuarios anónimos recientes, usar el más reciente
          // Esto es un fallback para cuando el UID no coincide exactamente
          if (recentAnonymousUsers.length > 0) {
            console.log('✅ [loadUserFromDatabase] Usuario anónimo reciente encontrado:', {
              uidEnToken: uid,
              uidEnBD: recentAnonymousUsers[0].id_usuario,
              email: recentAnonymousUsers[0].email,
              ultimoLogin: recentAnonymousUsers[0].ultimo_login
            });
            
            // Si el UID es diferente, actualizar el id_usuario para que coincida
            if (recentAnonymousUsers[0].id_usuario !== uid) {
              console.warn('⚠️ [loadUserFromDatabase] UID diferente en usuario reciente, actualizando...', {
                uidAnterior: recentAnonymousUsers[0].id_usuario,
                uidNuevo: uid
              });
              
              try {
                // Verificar que no exista otro usuario con el nuevo UID
                const existingUserWithNewUid = await prisma.usuarios.findUnique({
                  where: { id_usuario: uid },
                  include: {
                    roles: true
                  }
                });
                
                if (existingUserWithNewUid) {
                  console.log('✅ [loadUserFromDatabase] Usuario con nuevo UID ya existe, usando ese');
                  userRecord = existingUserWithNewUid;
                } else {
                  // Actualizar el id_usuario
                  userRecord = await prisma.usuarios.update({
                    where: { id_usuario: recentAnonymousUsers[0].id_usuario },
                    data: { id_usuario: uid },
                    include: {
                      roles: true
                    }
                  });
                  console.log('✅ [loadUserFromDatabase] id_usuario actualizado correctamente');
                }
              } catch (updateError) {
                console.error('❌ [loadUserFromDatabase] Error al actualizar id_usuario:', updateError);
                // Usar el usuario encontrado aunque el UID sea diferente
                userRecord = recentAnonymousUsers[0];
              }
            } else {
              userRecord = recentAnonymousUsers[0];
            }
          }
        }
      }
      
      // Si aún no se encuentra y tiene email, intentar buscar por email
      if (!userRecord && req.decodedToken.email) {
        console.log('🔍 [loadUserFromDatabase] Buscando usuario por email...', { 
          uid, 
          email: req.decodedToken.email 
        });
        const userByEmail = await prisma.usuarios.findFirst({
          where: { 
            email: req.decodedToken.email,
            es_anonimo: true // Solo buscar usuarios invitados
          },
          include: {
            roles: true
          },
          orderBy: {
            ultimo_login: 'desc' // Obtener el más reciente
          }
        });
        
        if (userByEmail) {
          console.log('✅ [loadUserFromDatabase] Usuario encontrado por email:', {
            uidEnToken: uid,
            uidEnBD: userByEmail.id_usuario,
            email: userByEmail.email
          });
          
          // Si el UID es diferente, actualizar el id_usuario para que coincida
          if (userByEmail.id_usuario !== uid) {
            console.warn('⚠️ [loadUserFromDatabase] UID diferente, actualizando id_usuario...', {
              uidAnterior: userByEmail.id_usuario,
              uidNuevo: uid
            });
            
            try {
              // Primero verificar que no exista otro usuario con el nuevo UID
              const existingUserWithNewUid = await prisma.usuarios.findUnique({
                where: { id_usuario: uid },
                include: {
                  roles: true
                }
              });
              
              if (existingUserWithNewUid) {
                console.error('❌ [loadUserFromDatabase] Ya existe un usuario con el nuevo UID:', {
                  uid,
                  email: existingUserWithNewUid.email
                });
                userRecord = existingUserWithNewUid;
              } else {
                // Actualizar el id_usuario
                userRecord = await prisma.usuarios.update({
                  where: { id_usuario: userByEmail.id_usuario },
                  data: { id_usuario: uid },
                  include: {
                    roles: true
                  }
                });
                console.log('✅ [loadUserFromDatabase] id_usuario actualizado correctamente');
              }
            } catch (updateError) {
              console.error('❌ [loadUserFromDatabase] Error al actualizar id_usuario:', updateError);
              // Usar el usuario encontrado por email aunque el UID sea diferente
              userRecord = userByEmail;
            }
          } else {
            userRecord = userByEmail;
          }
        }
      }
      
      if (!userRecord) {
        // Log detallado para debugging
        console.error('❌ [loadUserFromDatabase] Usuario no encontrado después de todos los intentos:', {
          uid,
          email: req.decodedToken.email || 'sin email',
          isAnonymous,
          path: req.path,
          method: req.method
        });
        
        // Como último recurso, buscar cualquier usuario anónimo reciente (últimos 10 minutos)
        // Esto es un fallback extremo para casos donde el UID no coincide
        if (isAnonymous) {
          console.log('🔍 [loadUserFromDatabase] Último intento: buscando cualquier usuario anónimo reciente...');
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          const anyRecentAnonymous = await prisma.usuarios.findFirst({
            where: {
              es_anonimo: true,
              ultimo_login: {
                gte: tenMinutesAgo
              }
            },
            include: {
              roles: true
            },
            orderBy: {
              ultimo_login: 'desc'
            }
          });
          
          if (anyRecentAnonymous) {
            console.warn('⚠️ [loadUserFromDatabase] Usando usuario anónimo reciente como fallback:', {
              uidEnToken: uid,
              uidEnBD: anyRecentAnonymous.id_usuario,
              email: anyRecentAnonymous.email
            });
            
            // Actualizar el id_usuario para que coincida con el token actual
            try {
              const existingUserWithNewUid = await prisma.usuarios.findUnique({
                where: { id_usuario: uid },
                include: { roles: true }
              });
              
              if (existingUserWithNewUid) {
                userRecord = existingUserWithNewUid;
              } else {
                userRecord = await prisma.usuarios.update({
                  where: { id_usuario: anyRecentAnonymous.id_usuario },
                  data: { id_usuario: uid },
                  include: { roles: true }
                });
              }
            } catch (updateError) {
              console.error('❌ [loadUserFromDatabase] Error al actualizar en fallback:', updateError);
              userRecord = anyRecentAnonymous;
            }
          }
        }
        
        if (!userRecord) {
          return res.status(404).json({
            success: false,
            error: 'Usuario no encontrado en la base de datos. Por favor, inicia sesión nuevamente.'
          });
        }
      }
    }

    req.authenticatedUser = buildAuthenticatedUser(userRecord);
    return next();
  } catch (error) {
    console.error('❌ [loadUserFromDatabase] Error:', error);
    const message = error instanceof Error ? error.message : 'Error al recuperar el usuario.';
    return res.status(500).json({
      success: false,
      error: message
    });
  }
};

// Middleware para permitir usuarios invitados (estado 1) o usuarios completos
export const allowGuests = (req: Request, res: Response, next: NextFunction) => {
  if (!req.authenticatedUser) {
    return res.status(401).json({
      success: false,
      error: 'Usuario no autenticado.'
    });
  }

  // Permitir usuarios invitados (estado 1) y usuarios completos (estado 3)
  const allowedStates = [1, 3];
  if (req.authenticatedUser.estado !== null && !allowedStates.includes(req.authenticatedUser.estado)) {
    return res.status(403).json({
      success: false,
      error: 'Tu cuenta no tiene permisos para realizar esta acción.'
    });
  }

  return next();
};

export const requireRole =
  (...allowedRoles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.authenticatedUser) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado.'
      });
    }

    if (allowedRoles.length === 0) {
      return next();
    }

    const userRole = req.authenticatedUser.rol;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para acceder a este recurso.'
      });
    }

    return next();
  };

export const auditTrailMiddleware =
  (action: string, table?: string, description?: string) =>
  (req: Request, res: Response, next: NextFunction) => {
    const start = performance.now();

    res.on('finish', () => {
      const statusCode = res.statusCode;
      const status = statusCode >= 400 ? 'ERROR' : 'SUCCESS';

      void auditService.record({
        action,
        table,
        description:
          description ??
          `${req.method} ${req.originalUrl}${status === 'ERROR' ? ` -> ${statusCode}` : ''}`,
        previousData: undefined,
        currentData: undefined,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        endpoint: req.originalUrl,
        status,
        userId: req.authenticatedUser?.id ?? null,
        processingTimeMs: performance.now() - start
      });
    });

    return next();
  };

export const refreshTokenIfNeeded =
  (thresholdSeconds = 15 * 60) =>
  (req: Request, res: Response, next: NextFunction) => {
    const decoded = req.decodedToken;

    if (!decoded?.exp) {
      return next();
    }

    const expiresInMs = decoded.exp * 1000 - Date.now();
    if (expiresInMs <= thresholdSeconds * 1000) {
      req.needsTokenRefresh = true;
      res.setHeader('X-Token-Refresh', 'true');
    }

    return next();
  };

export const setSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  const ip = req.ip ?? req.headers['x-forwarded-for']?.toString() ?? null;
  if (req.authenticatedUser && ip) {
    req.authenticatedUser.loginIp = sanitizeString(ip) ?? req.authenticatedUser.loginIp;
  }

  return next();
};

