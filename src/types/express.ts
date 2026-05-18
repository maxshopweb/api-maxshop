import type { DecodedIdToken } from 'firebase-admin/auth';
import type { AuthenticatedUser } from './auth.type';

declare global {
  namespace Express {
    interface Request {
      decodedToken?: DecodedIdToken;
      authenticatedUser?: AuthenticatedUser | null;
      needsTokenRefresh?: boolean;
    }
  }
}

export {};
