import { UserRole, VerificationType } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new AppError(403, 'Insufficient permissions'));
      return;
    }

    next();
  };

export const requireVerifiedSeller = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    next(new AppError(401, 'Authentication required'));
    return;
  }

  const allowed: VerificationType[] = ['INDIVIDUAL_SELLER', 'BUSINESS_SELLER'];

  if (!allowed.includes(req.user.verificationType)) {
    next(
      new AppError(
        403,
        'Seller verification required. Apply for individual or business seller verification.',
      ),
    );
    return;
  }

  next();
};

export const requireEmailVerified = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!req.user?.isEmailVerified) {
    next(new AppError(403, 'Email verification required'));
    return;
  }

  next();
};

export const canBuy = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    next(new AppError(401, 'Authentication required'));
    return;
  }

  next();
};
