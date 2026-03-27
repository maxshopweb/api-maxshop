import '../types/express';
import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { logServerError, toPublicErrorMessage } from '../utils/publicError';

export class AuthController {
  async loginWithFirebaseToken(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.loginWithFirebaseToken({
        ...req.body,
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        endpoint: req.originalUrl ?? null
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logServerError('AuthController.loginWithFirebaseToken', error);
      res.status(400).json({
        success: false,
        error: toPublicErrorMessage(
          error,
          'No pudimos iniciar sesión. Verificá tus datos e intentá de nuevo.'
        )
      });
    }
  }

  async registerWithFirebase(req: Request, res: Response): Promise<void> {
    try {
      const uid = req.body.data.uid;
      const result = await authService.registerWithFirebase({
        ...req.body,
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        endpoint: req.originalUrl ?? null
      });

      res.status(result.created ? 201 : 200).json({
        success: true,
        data: result,
        message: result.created ? 'Usuario registrado exitosamente' : 'Usuario actualizado exitosamente'
      });
    } catch (error) {
      logServerError('AuthController.registerWithFirebase', error);
      res.status(400).json({
        success: false,
        error: toPublicErrorMessage(error, 'No pudimos registrar tu cuenta. Intentá de nuevo.')
      });
    }
  }

  async completeProfile(req: Request, res: Response): Promise<void> {
    try {
      // El token ya fue decodificado por el middleware verifyFirebaseToken
      // Usar req.decodedToken.uid en lugar del token del body
      if (!req.decodedToken) {
        res.status(401).json({
          success: false,
          error: 'Token no verificado.'
        });
        return;
      }

      const result = await authService.completeProfile({
        // NO pasar idToken del body, usar el decodedToken del middleware
        data: req.body.data,
        decodedTokenUid: req.decodedToken.uid, // Pasar el UID del token decodificado
        decodedTokenEmail: req.decodedToken.email ?? null, // Pasar el email por si necesitamos buscar por email
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        endpoint: req.originalUrl ?? null
      });

      res.status(200).json({
        success: true,
        data: result,
        message: 'Perfil completado exitosamente'
      });
    } catch (error) {
      logServerError('AuthController.completeProfile', error);
      res.status(400).json({
        success: false,
        error: toPublicErrorMessage(error, 'No pudimos guardar tu perfil. Intentá de nuevo.')
      });
    }
  }

  async getCurrentUser(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      data: {
        user: req.authenticatedUser ?? null,
        needsTokenRefresh: req.needsTokenRefresh ?? false
      }
    });
  }

  async checkEmail(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        res.status(400).json({
          success: false,
          error: 'El email es requerido.'
        });
        return;
      }

      const result = await authService.checkEmailExists(email);

      res.json({
        success: true,
        data: {
          exists: result.exists,
          canLoginAsGuest: !result.exists || result.isGuest
        }
      });
    } catch (error) {
      logServerError('AuthController.checkEmail', error);
      res.status(400).json({
        success: false,
        error: toPublicErrorMessage(error, 'No pudimos verificar el email. Intentá de nuevo.')
      });
    }
  }

  async registerGuest(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.registerGuest({
        ...req.body,
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        endpoint: req.originalUrl ?? null,
        guestDeviceId: (req.body as { guestDeviceId?: string }).guestDeviceId ?? ((req.headers['x-guest-device-id'] as string)?.trim() || undefined)
      });

      res.status(result.created ? 201 : 200).json({
        success: true,
        data: result,
        message: result.created ? 'Usuario invitado registrado exitosamente' : 'Usuario invitado actualizado exitosamente'
      });
    } catch (error) {
      logServerError('AuthController.registerGuest', error);
      res.status(400).json({
        success: false,
        error: toPublicErrorMessage(error, 'No pudimos completar el registro como invitado. Intentá de nuevo.')
      });
    }
  }

  async convertGuest(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.convertGuestToUser({
        ...req.body,
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent']?.toString() ?? null,
        endpoint: req.originalUrl ?? null
      });

      res.status(200).json({
        success: true,
        message: 'Usuario convertido exitosamente'
      });
    } catch (error) {
      logServerError('AuthController.convertGuest', error);
      res.status(400).json({
        success: false,
        error: toPublicErrorMessage(error, 'No pudimos convertir tu cuenta. Intentá de nuevo.')
      });
    }
  }
}

export const authController = new AuthController();

