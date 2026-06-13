import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from '../errors/AppError';

type RequestPart = 'body' | 'query' | 'params';

export const validate =
  <T extends ZodSchema>(schema: T, part: RequestPart = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      next(
        new AppError(400, 'Validation failed', result.error.flatten().fieldErrors),
      );
      return;
    }

    req[part] = result.data;
    next();
  };
