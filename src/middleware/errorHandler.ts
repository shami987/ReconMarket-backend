import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { logger } from '../lib/logger';

export const notFoundHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  next(new AppError(404, 'Not found'));
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    logger.warn({ statusCode: err.statusCode, details: err.details }, err.message);
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  if (err instanceof ZodError) {
    logger.warn({ issues: err.issues }, 'Validation error');
    res.status(400).json({
      error: 'Validation failed',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');

  res.status(500).json({
    error: 'Internal server error',
    ...(env.NODE_ENV === 'development' && { message: err.message }),
  });
};
