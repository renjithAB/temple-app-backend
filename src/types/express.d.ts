import { AuthenticatedUser } from '../middleware/authenticate.js';
import { VerifiedTempleScope } from '../middleware/templeScope.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: AuthenticatedUser;
      templeScope?: VerifiedTempleScope;
    }
  }
}

export {};
