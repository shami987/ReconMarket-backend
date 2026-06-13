import { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      /** Zod-parsed query (Express 5 `req.query` is read-only) */
      validatedQuery?: unknown;
    }
  }
}

export {};
