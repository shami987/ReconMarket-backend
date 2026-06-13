import { UserRole, VerificationType } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, 'Authentication required'));
    return;
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.deletedAt || !user.isActive) {
      next(new AppError(401, 'Account is inactive or not found'));
      return;
    }

    req.user = user;
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
};

export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice(7));
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (user && !user.deletedAt && user.isActive) {
      req.user = user;
    }
  } catch {
    // Ignore invalid token for optional auth
  }

  next();
};
