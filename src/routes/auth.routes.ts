import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import {
  setSecurityHeaders,
  verifyFirebaseToken
} from '../middlewares/auth.middleware';
import { authRateLimiter, authenticatedRateLimiter } from '../middlewares/rate-limit.middleware';

const authRoutes = Router();

authRoutes.use(setSecurityHeaders);

// Endpoints de autenticación (rate limiting estricto)
authRoutes.post('/login/token', authRateLimiter, (req, res) => authController.loginWithFirebaseToken(req, res));
authRoutes.post('/register', authRateLimiter, verifyFirebaseToken, (req, res) => authController.registerWithFirebase(req, res));
authRoutes.post('/check-email', authRateLimiter, (req, res) => authController.checkEmail(req, res));

// Endpoints autenticados (rate limiting normal)
authRoutes.post('/complete-profile', authenticatedRateLimiter, verifyFirebaseToken, (req, res) => authController.completeProfile(req, res));
authRoutes.get('/me', authenticatedRateLimiter, verifyFirebaseToken, (req, res) => authController.getCurrentUser(req, res));
authRoutes.post('/guest-register', authenticatedRateLimiter, verifyFirebaseToken, (req, res) => authController.registerGuest(req, res));
authRoutes.post('/convert-guest', authenticatedRateLimiter, verifyFirebaseToken, (req, res) => authController.convertGuest(req, res));

export default authRoutes;

