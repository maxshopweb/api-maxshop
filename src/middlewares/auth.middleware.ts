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
    const userRecord = await prisma.usuarios.findUnique({
      where: { id_usuario: req.decodedToken.uid },
      include: {
        roles: true
      }
    });

    if (!userRecord) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado en la base de datos.'
      });
    }

    req.authenticatedUser = buildAuthenticatedUser(userRecord);
    return next();
  } catch (error) {
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

